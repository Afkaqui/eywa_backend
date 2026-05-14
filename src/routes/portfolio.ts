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
portfolioRouter.get('/', async (c) => {
  const companies = await portfolioRepo.getAll();
  return c.json({ companies });
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

  await portfolioRepo.update(id, body);
  return c.json({ success: true });
});

// ── DELETE /api/portfolio/:id  (gestor+) ──────────────────────────────────────
portfolioRouter.delete('/:id', async (c) => {
  const user = getRequestUser(c);
  assertRole(user, ['gestor', 'admin', 'superadmin']);

  const { id } = c.req.param();
  await portfolioRepo.delete(id);
  return c.json({ success: true });
});
