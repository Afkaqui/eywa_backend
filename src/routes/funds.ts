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
    db.organization.findUnique({ where: { userId: user.sub }, select: { sector: true } }),
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
    await db.fund.update({ where: { id: c.req.param('id') }, data: toFundData(parsed.data) });
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
