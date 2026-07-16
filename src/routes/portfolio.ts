import { Hono } from 'hono';
import { z } from 'zod';
import { authMiddleware } from '@/middleware/auth';
import { getRequestUser, assertRole, ApiError } from '@/lib/auth-helpers';
import { PortfolioRepository } from '@/repositories/portfolio-repository';
import { db } from '@/lib/db';

export const portfolioRouter = new Hono();
const portfolioRepo = new PortfolioRepository(db);

portfolioRouter.use('*', authMiddleware);

// ── GET /api/portfolio ────────────────────────────────────────────────────────
// Híbrido (decisión 2026-07-16): el portfolio se alimenta de las ORGANIZACIONES
// reales (empresas vinculadas a usuarios, score = diagnóstico GENES) + las empresas
// EXTERNAS que el gestor agrega a mano (tabla portfolio_companies).
portfolioRouter.get('/', async (c) => {
  const [manual, orgs] = await Promise.all([
    portfolioRepo.getAll(),
    db.organization.findMany(),
  ]);

  // Último resultado del diagnóstico por usuario (dueño de cada organización)
  const userIds = orgs.map((o) => o.userId);
  const results = userIds.length
    ? await db.diagnosticResult.findMany({
        where:   { userId: { in: userIds } },
        orderBy: { createdAt: 'desc' },
      })
    : [];
  const latest = new Map<string, (typeof results)[number]>();
  for (const r of results) if (!latest.has(r.userId)) latest.set(r.userId, r);

  const platform = orgs.map((o) => {
    const r = latest.get(o.userId);
    return {
      id:         o.id,
      source:     'plataforma' as const,
      name:       o.name,
      sector:     o.sector ?? null,
      // score en % (0-100) del diagnóstico GENES; null = aún sin diagnóstico → "Pendiente"
      score:      r?.percentage ?? null,
      level:      r?.level ?? null, // banda GENES
      status:     r ? 'Diagnóstico realizado' : 'Diagnóstico pendiente',
      // riesgo derivado de la banda (escala 0-75): ≥61 bajo · ≥46 medio · <46 alto
      risk:       r ? (r.score >= 61 ? 'bajo' : r.score >= 46 ? 'medio' : 'alto') : null,
      carbon:     null,
      trend:      null,
      lastAudit:  null,
      hasLogo:    !!o.imageUrl,
      orgId:      o.id,
      publicSlug: o.publicEnabled ? o.publicSlug : null,
      createdAt:  o.createdAt,
      updatedAt:  o.updatedAt,
    };
  });

  const manualRows = manual.map((m) => ({
    ...m,
    source:     'manual' as const,
    level:      null,
    hasLogo:    false,
    orgId:      null,
    publicSlug: null,
  }));

  // Plataforma primero (ordenadas por score desc, sin diagnóstico al final), luego externas
  const byScore = (a: { score: number | null }, b: { score: number | null }) =>
    (b.score ?? -1) - (a.score ?? -1);
  return c.json({ companies: [...platform.sort(byScore), ...manualRows] });
});

// ── POST /api/portfolio  (gestor+) ────────────────────────────────────────────
const companySchema = z.object({
  name:      z.string().min(1),
  sector:    z.string().min(1),
  score:     z.number().int().min(0).max(100),
  status:    z.string().optional(),
  carbon:    z.string().optional().nullable(),
  trend:     z.string().optional().nullable(),
  last_audit: z.string().optional().nullable(),
  risk:      z.enum(['bajo', 'medio', 'alto']).optional(),
});

portfolioRouter.post('/', async (c) => {
  const user = getRequestUser(c);
  assertRole(user, ['gestor', 'admin', 'superadmin']);

  const body = await c.req.json();
  const parsed = companySchema.safeParse(body);
  if (!parsed.success) throw new ApiError(400, parsed.error.errors[0]?.message ?? 'Datos inválidos');

  const company = await portfolioRepo.create({
    ...parsed.data,
    lastAudit:  parsed.data.last_audit ?? null,
    status:     parsed.data.status ?? 'Pendiente',
    risk:       parsed.data.risk ?? 'medio',
    createdBy:  user.sub,
  });

  return c.json({ company }, 201);
});

// ── PATCH /api/portfolio/:id  (gestor+) ───────────────────────────────────────
portfolioRouter.patch('/:id', async (c) => {
  const user = getRequestUser(c);
  assertRole(user, ['gestor', 'admin', 'superadmin']);

  const { id } = c.req.param();
  const body = await c.req.json();

  // Solo las empresas EXTERNAS (manuales) se editan aquí; las de la plataforma
  // se gestionan desde el perfil de la propia organización.
  try {
    await portfolioRepo.update(id, body);
  } catch {
    throw new ApiError(404, 'Solo las empresas externas (manuales) se editan aquí');
  }
  return c.json({ success: true });
});

// ── DELETE /api/portfolio/:id  (gestor+) ──────────────────────────────────────
portfolioRouter.delete('/:id', async (c) => {
  const user = getRequestUser(c);
  assertRole(user, ['gestor', 'admin', 'superadmin']);

  const { id } = c.req.param();
  try {
    await portfolioRepo.delete(id);
  } catch {
    throw new ApiError(404, 'Solo las empresas externas (manuales) se eliminan aquí');
  }
  return c.json({ success: true });
});
