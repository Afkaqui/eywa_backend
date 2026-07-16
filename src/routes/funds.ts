import { Hono } from 'hono';
import { authMiddleware } from '@/middleware/auth';
import { getRequestUser, ApiError } from '@/lib/auth-helpers';
import { db } from '@/lib/db';

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

  const funds = await db.fund.findMany({
    orderBy: [{ deadline: 'asc' }, { name: 'asc' }],
  });

  return c.json({
    funds: funds.map((f) => ({
      id:               f.id,
      scope:            f.scope,
      name:             f.name,
      instrument_type:  f.instrumentType,
      eligible_profile: f.eligibleProfile,
      sectors:          f.sectors,
      amounts:          f.amounts,
      deadline:         f.deadline ? f.deadline.toISOString() : null,
      deadline_text:    f.deadlineText,
      checklist:        f.checklist,
      url:              f.url,
    })),
  });
});
