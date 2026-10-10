import { Hono } from 'hono';
import { z } from 'zod';
import { authMiddleware } from '@/middleware/auth';
import { getRequestUser, assertRole, ApiError } from '@/lib/auth-helpers';
import { db } from '@/lib/db';
import { FUND_TAGS, FUND_TAG_KEYS, tagsForSector } from '@/lib/sector-tags';

// Catálogo de Fondos — SOLO Premium (o gestor/admin/superadmin).
// Decisión del usuario (2026-07-16): gancho freemium; los free ven un teaser
// con conteos (GET /summary) y el catálogo completo exige plan premium.

export const fundsRouter = new Hono();

fundsRouter.use('*', authMiddleware);

// El plan se verifica contra la BD (el JWT puede quedar desactualizado tras un upgrade)
async function assertPremium(userId: string) {
  const p = await db.profile.findUnique({
    where: { id: userId }, select: { plan: true, role: true },
  });
  if (!p) throw new ApiError(401, 'Sesión inválida');
  const staff = ['gestor', 'admin', 'superadmin'].includes(p.role);
  if (p.plan !== 'premium' && !staff) {
    throw new ApiError(403, 'El catálogo de fondos está disponible con el Plan Premium');
  }
}

// ── GET /api/funds/summary — conteos para el teaser (cualquier usuario logueado) ──
fundsRouter.get('/summary', async (c) => {
  const [total, nacionales] = await Promise.all([
    db.fund.count(),
    db.fund.count({ where: { scope: 'nacional' } }),
  ]);
  return c.json({ total, nacionales, internacionales: total - nacionales });
});

// ── GET /api/funds — catálogo completo (premium o gestor+) ───────────────────
fundsRouter.get('/', async (c) => {
  const user = getRequestUser(c);
  await assertPremium(user.sub);

  const [funds, org] = await Promise.all([
    db.fund.findMany({ orderBy: [{ deadline: 'asc' }, { name: 'asc' }] }),
    db.organization.findFirst({ where: { userId: user.sub  }, orderBy: { createdAt: "asc" }, select: { sector: true } }),
  ]);

  return c.json({
    // Temas de MI industria: la UI marca con ellos los fondos que encajan
    my_tags:   tagsForSector(org?.sector),
    my_sector: org?.sector ?? null,
    tag_labels: FUND_TAGS,
    funds: funds.map((f) => ({
      id:               f.id,
      scope:            f.scope,
      name:             f.name,
      instrument_type:  f.instrumentType,
      eligible_profile: f.eligibleProfile,
      sectors:          f.sectors,
      sector_tags:      (f.sectorTags as string[] | null) ?? [],
      amounts:          f.amounts,
      deadline:         f.deadline ? f.deadline.toISOString() : null,
      deadline_text:    f.deadlineText,
      checklist:        f.checklist,
      url:              f.url,
      // Re-verificación nocturna (§16): cuándo se comprobó y de dónde salió la fecha.
      verify_status:    f.verifyStatus,
      verified_at:      f.verifiedAt ? f.verifiedAt.toISOString() : null,
      deadline_source:  f.deadlineSource, // manual | bot | null (carga original)
    })),
  });
});

// ══ CRUD del catálogo (gestor/admin/superadmin) ═══════════════════════════════
// Mantiene el catálogo vivo entre re-imports de la matriz Neo.

const fundSchema = z.object({
  scope:            z.enum(['nacional', 'internacional']),
  name:             z.string().min(1, 'El nombre es obligatorio'),
  instrument_type:  z.string().min(1, 'El tipo de instrumento es obligatorio'),
  eligible_profile: z.string().optional().nullable(),
  sectors:          z.string().optional().nullable(),
  sector_tags:      z.array(z.enum(FUND_TAG_KEYS as [string, ...string[]])).optional(),
  amounts:          z.string().optional().nullable(),
  deadline:         z.string().optional().nullable(), // ISO (fecha concreta)
  deadline_text:    z.string().optional().nullable(), // "Por convocatoria", "Abierto"…
  checklist:        z.string().optional().nullable(),
  url:              z.string().optional().nullable(),
});

function toFundData(d: z.infer<typeof fundSchema>) {
  return {
    scope:           d.scope,
    name:            d.name.trim(),
    instrumentType:  d.instrument_type.trim(),
    eligibleProfile: d.eligible_profile?.trim() || null,
    sectors:         d.sectors?.trim() || null,
    sectorTags:      [...new Set(d.sector_tags ?? [])],
    amounts:         d.amounts?.trim() || null,
    deadline:        d.deadline ? new Date(d.deadline) : null,
    deadlineText:    d.deadline ? null : (d.deadline_text?.trim() || null),
    checklist:       d.checklist?.trim() || null,
    url:             d.url?.trim() || null,
  };
}

// ══ Cola de revisión del job nocturno (gestor/admin/superadmin) ═════════════════
// El bot PROPONE (fechas nuevas, enlaces rotos, enlaces de LinkedIn); un gestor
// decide. Ver src/jobs/verificar-fondos.ts.

// GET /api/funds/revision
fundsRouter.get('/revision', async (c) => {
  const user = getRequestUser(c);
  assertRole(user, ['gestor', 'admin', 'superadmin']);

  const [pendientes, ultima] = await Promise.all([
    db.fund.findMany({ where: { needsReview: true }, orderBy: [{ detectedDeadline: 'asc' }, { name: 'asc' }] }),
    db.fundSyncRun.findFirst({ where: { kind: 'verificacion' }, orderBy: { startedAt: 'desc' } }),
  ]);

  return c.json({
    ultima_corrida: ultima ? {
      inicio:     ultima.startedAt.toISOString(),
      fin:        ultima.finishedAt?.toISOString() ?? null,
      revisados:  ultima.checked,
      marcados:   ultima.flagged,
      errores:    ultima.errors,
      resumen:    ultima.summary,
    } : null,
    pendientes: pendientes.map((f) => ({
      id:                f.id,
      name:              f.name,
      url:               f.url,
      deadline:          f.deadline?.toISOString() ?? null,
      deadline_text:     f.deadlineText,
      verify_status:     f.verifyStatus,
      verify_http:       f.verifyHttp,
      verified_at:       f.verifiedAt?.toISOString() ?? null,
      detected_deadline: f.detectedDeadline?.toISOString() ?? null,
      detected_evidence: f.detectedEvidence,
      review_reason:     f.reviewReason,
    })),
  });
});

// POST /api/funds/:id/revision  { accion: 'aceptar_fecha' | 'descartar' }
const revisionSchema = z.object({ accion: z.enum(['aceptar_fecha', 'descartar']) });

fundsRouter.post('/:id/revision', async (c) => {
  const user = getRequestUser(c);
  assertRole(user, ['gestor', 'admin', 'superadmin']);
  const parsed = revisionSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) throw new ApiError(400, 'Acción inválida');

  const f = await db.fund.findUnique({ where: { id: c.req.param('id') } });
  if (!f) throw new ApiError(404, 'Fondo no encontrado');
  if (!f.needsReview) throw new ApiError(409, 'Este fondo ya no tiene nada pendiente de revisión');

  if (parsed.data.accion === 'aceptar_fecha') {
    if (!f.detectedDeadline) throw new ApiError(409, 'No hay una fecha propuesta que aceptar');
    await db.fund.update({
      where: { id: f.id },
      data: {
        deadline: f.detectedDeadline, deadlineText: null, deadlineSource: 'bot',
        needsReview: false, reviewReason: null, dismissedDetection: null,
      },
    });
  } else {
    // Se recuerda QUÉ se descartó para que el bot no lo proponga de nuevo mañana.
    const clave = f.verifyStatus === 'enlace_roto' ? 'enlace_roto'
      : f.url && /lnkd\.in|linkedin\.com/i.test(f.url) ? 'linkedin'
      : f.detectedDeadline ? `fecha:${f.detectedDeadline.toISOString().slice(0, 10)}`
      : null;
    await db.fund.update({
      where: { id: f.id },
      data: { needsReview: false, reviewReason: null, dismissedDetection: clave },
    });
  }
  return c.json({ success: true });
});

// POST /api/funds
fundsRouter.post('/', async (c) => {
  const user = getRequestUser(c);
  assertRole(user, ['gestor', 'admin', 'superadmin']);

  const parsed = fundSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) throw new ApiError(400, parsed.error.errors[0]?.message ?? 'Datos inválidos');
  if (parsed.data.deadline && isNaN(Date.parse(parsed.data.deadline))) {
    throw new ApiError(400, 'Fecha de cierre inválida');
  }

  const fund = await db.fund.create({ data: toFundData(parsed.data) });
  return c.json({ fund: { id: fund.id } }, 201);
});

// PATCH /api/funds/:id
fundsRouter.patch('/:id', async (c) => {
  const user = getRequestUser(c);
  assertRole(user, ['gestor', 'admin', 'superadmin']);

  const parsed = fundSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) throw new ApiError(400, parsed.error.errors[0]?.message ?? 'Datos inválidos');
  if (parsed.data.deadline && isNaN(Date.parse(parsed.data.deadline))) {
    throw new ApiError(400, 'Fecha de cierre inválida');
  }

  try {
    // Una edición humana resuelve lo que hubiera pendiente: si corrigió la URL o la
    // fecha, la próxima verificación partirá de lo nuevo.
    const actual = await db.fund.findUnique({ where: { id: c.req.param('id') }, select: { deadline: true } });
    const datos = toFundData(parsed.data);
    const cambioFecha = (actual?.deadline?.getTime() ?? null) !== (datos.deadline?.getTime() ?? null);
    await db.fund.update({
      where: { id: c.req.param('id') },
      data: {
        ...datos,
        ...(cambioFecha ? { deadlineSource: 'manual' } : {}),
        needsReview: false, reviewReason: null, dismissedDetection: null,
      },
    });
  } catch {
    throw new ApiError(404, 'Fondo no encontrado');
  }
  return c.json({ success: true });
});

// DELETE /api/funds/:id
fundsRouter.delete('/:id', async (c) => {
  const user = getRequestUser(c);
  assertRole(user, ['gestor', 'admin', 'superadmin']);

  try {
    await db.fund.delete({ where: { id: c.req.param('id') } });
  } catch {
    throw new ApiError(404, 'Fondo no encontrado');
  }
  return c.json({ success: true });
});
