import { Hono } from 'hono';
import { createHash } from 'crypto';
import { authMiddleware } from '@/middleware/auth';
import { getRequestUser, assertRole } from '@/lib/auth-helpers';
import { db } from '@/lib/db';
import { GENES_SCALE, GENES_MAX_POINTS, GENES_CATEGORIES } from '@/lib/scoring';
import { tagsForSector } from '@/lib/sector-tags';

// KPIs REALES (2026-07-18). Reemplazan a los "Pendiente" del dashboard, que
// esperaban datos que nadie captura (carbono, valorización USD, gap IMI).
// Aquí solo se calcula lo que la plataforma efectivamente sabe.

export const statsRouter = new Hono();

// ── GET /api/stats/public — conteos agregados para la landing (PÚBLICO) ───────
// Registrado ANTES del authMiddleware: la landing no tiene sesión.
// Solo devuelve NÚMEROS AGREGADOS, nunca nombres ni datos de nadie.
// Reemplaza a "Ecosistemas conectados / Puntos de datos por día / Millones USD
// gestionados", que eran métricas inventadas que nadie podía calcular.
// Las organizaciones de DEMOSTRACIÓN no cuentan en las cifras públicas: se crean
// para mostrar módulos con volumen en presentaciones, y contarlas inflaría los
// números que se muestran en la landing (regla de honestidad).
const DEMO_ORG_PREFIX = 'ORGANIZACIÓN DEMO';

statsRouter.get('/public', async (c) => {
  const notDemo = { name: { not: { startsWith: DEMO_ORG_PREFIX } } };

  const [organizations, diagnostics, actors, funds, certificates, documents] = await Promise.all([
    db.organization.count({ where: notDemo }),
    db.diagnosticResult.count(),
    db.actor.count(),
    db.fund.count(),
    db.certificate.count(),
    db.dataroomDocument.count({ where: { organization: notDemo } }),
  ]);

  return c.json({ organizations, diagnostics, actors, funds, certificates, documents });
});

// ── POST /api/stats/visit — registra una visita (PÚBLICO) ─────────────────────
// Antes del authMiddleware: la landing y las páginas públicas no tienen sesión.
//
// PRIVACIDAD (decisión de diseño): NO se guarda la IP ni el user-agent. Se guarda
// un hash de (IP + UA + día + AUTH_SECRET), que permite contar visitantes ÚNICOS
// por día sin poder identificar a nadie; como la fecha entra en la mezcla, el
// mismo visitante genera un hash distinto cada día y no se le puede seguir en el
// tiempo. Del referrer se guarda SOLO el dominio: una URL completa puede llevar
// datos personales en el query string.
const BOT_RE = /bot|crawl|spider|slurp|bingpreview|headless|lighthouse|curl|wget|python-requests|monitor|uptime/i;

function visitorHashOf(ip: string, ua: string): string {
  const day = new Date().toISOString().slice(0, 10); // rota cada día
  return createHash('sha256')
    .update(`${ip}|${ua}|${day}|${process.env.AUTH_SECRET ?? ''}`)
    .digest('hex');
}

// ── Retención de site_visits ────────────────────────────────────────────────
// Esta tabla guarda UNA FILA POR CADA CARGA DE PÁGINA, también de visitantes
// anónimos: no depende de cuántos usuarios registrados haya. Con 10 000 visitas
// diarias son ~3,6 millones de filas y ~500 MB al año — más que todo el resto de
// la base junta.
//
// Se borra el detalle antiguo. NO se conservan agregados todavía porque no hay
// tráfico que justifique la complejidad; si algún día hace falta la serie
// histórica, hay que agregar una tabla de resúmenes ANTES de que el borrado
// empiece a morder (a 90 días, eso es dentro de 3 meses).
const VISITAS_RETENCION_DIAS = 90;
let ultimaLimpieza = 0;

/** Borra visitas viejas, como mucho una vez al día. No bloquea la petición. */
function limpiarVisitasViejas() {
  const UN_DIA = 24 * 3600 * 1000;
  if (Date.now() - ultimaLimpieza < UN_DIA) return;
  ultimaLimpieza = Date.now();

  const corte = new Date(Date.now() - VISITAS_RETENCION_DIAS * UN_DIA);
  // Deliberadamente sin await: registrar una visita no debe esperar a la limpieza.
  db.siteVisit.deleteMany({ where: { createdAt: { lt: corte } } })
    .then(r => { if (r.count) console.log(`[stats] retención: ${r.count} visitas de más de ${VISITAS_RETENCION_DIAS} días borradas`); })
    .catch(err => console.error('[stats] falló la limpieza de visitas:', err));
}

statsRouter.post('/visit', async (c) => {
  limpiarVisitasViejas(); // se ejecuta como mucho 1 vez al día

  const body = await c.req.json().catch(() => ({} as Record<string, unknown>));

  // Ruta sin query string (puede llevar tokens o datos personales) y acotada.
  const rawPath = typeof body.path === 'string' ? body.path : '/';
  const path = rawPath.split('?')[0].split('#')[0].slice(0, 300) || '/';

  // Del referrer solo el dominio; si no parsea, se descarta.
  let referrerHost: string | null = null;
  if (typeof body.referrer === 'string' && body.referrer) {
    try {
      const h = new URL(body.referrer).hostname;
      referrerHost = h ? h.slice(0, 200) : null;
    } catch { /* referrer inválido → se ignora */ }
  }

  // La IP real la reenvía el proxy del frontend; si no llega, el hash sigue
  // siendo válido (solo agrupa peor).
  const ip = (c.req.header('x-forwarded-for') ?? '').split(',')[0].trim();
  const ua = c.req.header('user-agent') ?? '';

  try {
    await db.siteVisit.create({
      data: {
        path,
        referrerHost,
        visitorHash: visitorHashOf(ip, ua),
        isBot: BOT_RE.test(ua) || !ua,
      },
    });
  } catch (err) {
    // Registrar una visita NUNCA debe romperle la página a nadie.
    console.error('[stats] no se pudo registrar la visita:', err);
  }

  // 204: no hay nada que devolver y evita payload innecesario en cada carga.
  return c.body(null, 204);
});

statsRouter.use('*', authMiddleware);

// ── GET /api/stats/me — KPIs del usuario en sesión ────────────────────────────
statsRouter.get('/me', async (c) => {
  const user = getRequestUser(c);

  const [org, lastTwo, enrollments, certificates, plans] = await Promise.all([
    db.organization.findFirst({ where: { userId: user.sub  }, orderBy: { createdAt: "asc" }, select: { id: true, sector: true } }),
    db.diagnosticResult.findMany({
      where: { userId: user.sub }, orderBy: { createdAt: 'desc' }, take: 2,
      select: { score: true, level: true, breakdown: true, createdAt: true },
    }),
    db.courseEnrollment.findMany({
      where: { userId: user.sub },
      select: { progress: true, completed: true, course: { select: { durationHours: true } } },
    }),
    db.certificate.count({ where: { userId: user.sub } }),
    db.projectPlan.findMany({ where: { userId: user.sub }, select: { status: true } }),
  ]);

  // ── Índice ESG: nota, banda, variación y mayor brecha ──
  const latest = lastTwo[0] ?? null;
  const previous = lastTwo[1] ?? null;
  let esg: null | {
    index5: number; level: string; delta: number | null;
    weakest: { key: string; label: string; avg: number } | null;
    zero_criteria: number;
  } = null;

  if (latest) {
    const index5 = (latest.score / GENES_SCALE) * GENES_MAX_POINTS;
    const breakdown = (latest.breakdown as { score?: number; category?: string }[] | null) ?? [];

    // Promedio por categoría → la más baja es la mayor brecha
    const byCat = new Map<string, { sum: number; n: number }>();
    for (const b of breakdown) {
      const k = b.category ?? 'general';
      const acc = byCat.get(k) ?? { sum: 0, n: 0 };
      acc.sum += b.score ?? 0; acc.n++;
      byCat.set(k, acc);
    }
    let weakest: { key: string; label: string; avg: number } | null = null;
    for (const [k, v] of byCat) {
      const avg = v.n ? v.sum / v.n : 0;
      if (!weakest || avg < weakest.avg) weakest = { key: k, label: GENES_CATEGORIES[k] ?? k, avg };
    }

    esg = {
      index5,
      level: latest.level,
      delta: previous ? index5 - (previous.score / GENES_SCALE) * GENES_MAX_POINTS : null,
      weakest,
      zero_criteria: breakdown.filter(b => (b.score ?? 0) === 0).length,
    };
  }

  // ── Dataroom: completitud (documentos + ítems cubiertos por la plataforma) ──
  let dataroom: { completed: number; total: number; percentage: number } | null = null;
  if (org) {
    const [totalItems, docs] = await Promise.all([
      db.dataroomItem.count(),
      db.dataroomDocument.findMany({ where: { organizationId: org.id }, select: { itemId: true } }),
    ]);
    // Ítems ASG que cuentan vía plataforma (diagnóstico / certificados)
    const platformItems = new Set<string>();
    if (latest || certificates > 0) {
      const names: string[] = [];
      if (latest) names.push('Reporte de sostenibilidad');
      if (certificates > 0) names.push('Certificaciones de calidad / sostenibilidad');
      const items = await db.dataroomItem.findMany({ where: { name: { in: names } }, select: { id: true } });
      items.forEach(i => platformItems.add(i.id));
    }
    const done = new Set([...docs.map(d => d.itemId), ...platformItems]).size;
    dataroom = {
      completed: done,
      total: totalItems,
      percentage: totalItems ? Math.round((done / totalItems) * 100) : 0,
    };
  }

  // ── Academia: horas formativas reales de cursos completados ──
  const completed = enrollments.filter(e => e.completed);
  const hours = completed.reduce((s, e) => s + (e.course?.durationHours ?? 0), 0);
  const avgProgress = enrollments.length
    ? Math.round(enrollments.reduce((s, e) => s + (e.progress ?? 0), 0) / enrollments.length)
    : 0;

  // ── Fondos que encajan con mi sector y cierran pronto ──
  // Match EXACTO por etiquetas temáticas (2026-07-18): los fondos están etiquetados
  // con la taxonomía EYWA y cada industria de empresa se mapea a los temas que le
  // corresponden. Los fondos "multisectorial" aplican a todos.
  const now = new Date();
  const in30 = new Date(now.getTime() + 30 * 24 * 3600 * 1000);
  const openFunds = await db.fund.findMany({
    where: { OR: [{ deadline: { gte: now } }, { deadline: null }] },
    select: { id: true, name: true, sectorTags: true, deadline: true, scope: true },
  });
  const myTags = tagsForSector(org?.sector);
  const matching = myTags.length
    ? openFunds.filter(f => {
        const tags = (f.sectorTags as string[] | null) ?? [];
        return tags.some(t => myTags.includes(t) || t === 'multisectorial');
      })
    : [];
  const closingSoon = openFunds
    .filter(f => f.deadline && f.deadline <= in30)
    .sort((a, b) => (a.deadline!.getTime() - b.deadline!.getTime()));

  return c.json({
    esg,
    dataroom,
    academy: {
      enrolled:      enrollments.length,
      completed:     completed.length,
      hours,
      avg_progress:  avgProgress,
      certificates,
    },
    projects: {
      total:    plans.length,
      analyzed: plans.filter(p => p.status === 'analyzed').length,
      pending:  plans.filter(p => p.status === 'pending').length,
    },
    funds: {
      open_total:   openFunds.length,
      matching:     matching.length,
      closing_soon: closingSoon.length,
      next_closing: closingSoon[0]
        ? { name: closingSoon[0].name, deadline: closingSoon[0].deadline!.toISOString() }
        : null,
    },
    has_organization: Boolean(org),
  });
});

// ── GET /api/stats/activation — embudo de activación (gestor+) ────────────────
// Dónde se caen los usuarios: registrados → organización → diagnóstico → dataroom
// → landing pública. El KPI interno más accionable de la plataforma.
statsRouter.get('/activation', async (c) => {
  const user = getRequestUser(c);
  assertRole(user, ['gestor', 'admin', 'superadmin']);

  const [registered, withOrg, orgIdsWithDocs, usersWithDiag, withLanding] = await Promise.all([
    db.profile.count(),
    db.organization.count(),
    db.dataroomDocument.findMany({ select: { organizationId: true }, distinct: ['organizationId'] }),
    db.diagnosticResult.findMany({ select: { userId: true }, distinct: ['userId'] }),
    db.organization.count({ where: { publicEnabled: true } }),
  ]);

  const steps = [
    { key: 'registrados',  label: 'Registrados',            value: registered },
    { key: 'organizacion', label: 'Con organización',       value: withOrg },
    { key: 'diagnostico',  label: 'Con diagnóstico ESG',    value: usersWithDiag.length },
    { key: 'dataroom',     label: 'Con dataroom iniciado',  value: orgIdsWithDocs.length },
    { key: 'landing',      label: 'Con landing pública',    value: withLanding },
  ].map((s, i, arr) => ({
    ...s,
    // % respecto al total de registrados y caída respecto al paso anterior
    percentage: registered ? Math.round((s.value / registered) * 100) : 0,
    drop_from_previous: i === 0 ? 0 : arr[i - 1].value - s.value,
  }));

  return c.json({ steps, registered });
});

// ── GET /api/stats/visits — visitas a la web (SOLO superadmin) ────────────────
// Decisión del usuario (2026-07-25): el contador de visitas es exclusivo del panel
// de superadmin. La restricción REAL vive aquí, no en el frontend: ocultar el panel
// en la UI no impide que otro rol llame al endpoint a mano.
// Los bots se cuentan aparte y NO entran en las cifras principales: si un
// crawler pasa 300 veces, el número "visitas" dejaría de significar personas.
statsRouter.get('/visits', async (c) => {
  const user = getRequestUser(c);
  assertRole(user, ['superadmin']);

  const days = Math.min(Math.max(Number(c.req.query('days') ?? 30), 1), 365);
  const since = new Date(Date.now() - days * 24 * 3600 * 1000);
  const humans = { isBot: false };

  const [total, periodo, botCount, porDia, topPaths, topRefs, unicos] = await Promise.all([
    db.siteVisit.count({ where: humans }),
    db.siteVisit.count({ where: { ...humans, createdAt: { gte: since } } }),
    db.siteVisit.count({ where: { isBot: true, createdAt: { gte: since } } }),
    db.$queryRaw<{ dia: Date; visitas: bigint; unicos: bigint }[]>`
      SELECT date_trunc('day', created_at) AS dia,
             count(*)                      AS visitas,
             count(DISTINCT visitor_hash)  AS unicos
      FROM site_visits
      WHERE is_bot = false AND created_at >= ${since}
      GROUP BY 1 ORDER BY 1 ASC`,
    db.siteVisit.groupBy({
      by: ['path'], where: { ...humans, createdAt: { gte: since } },
      _count: { path: true }, orderBy: { _count: { path: 'desc' } }, take: 10,
    }),
    db.siteVisit.groupBy({
      by: ['referrerHost'],
      where: { ...humans, createdAt: { gte: since }, referrerHost: { not: null } },
      _count: { referrerHost: true }, orderBy: { _count: { referrerHost: 'desc' } }, take: 10,
    }),
    db.siteVisit.findMany({
      where: { ...humans, createdAt: { gte: since } },
      select: { visitorHash: true }, distinct: ['visitorHash'],
    }),
  ]);

  return c.json({
    days,
    total,                       // histórico completo (personas)
    period: periodo,             // visitas en el rango
    unique_visitors: unicos.length,
    bots: botCount,              // aparte, para que no inflen lo anterior
    by_day: porDia.map(r => ({
      day:     r.dia.toISOString().slice(0, 10),
      visits:  Number(r.visitas),
      unique:  Number(r.unicos),
    })),
    top_paths: topPaths.map(p => ({ path: p.path, visits: p._count.path })),
    top_referrers: topRefs.map(r => ({ host: r.referrerHost, visits: r._count.referrerHost })),
  });
});
