import { Hono } from 'hono';
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

statsRouter.use('*', authMiddleware);

// ── GET /api/stats/me — KPIs del usuario en sesión ────────────────────────────
statsRouter.get('/me', async (c) => {
  const user = getRequestUser(c);

  const [org, lastTwo, enrollments, certificates, plans] = await Promise.all([
    db.organization.findUnique({ where: { userId: user.sub }, select: { id: true, sector: true } }),
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
