import { Hono } from 'hono';
import { z } from 'zod';
import { authMiddleware } from '@/middleware/auth';
import { getRequestUser, assertRole, ApiError } from '@/lib/auth-helpers';
import { ProfileRepository } from '@/repositories/profile-repository';
import { db } from '@/lib/db';

export const usersRouter = new Hono();
const profileRepo = new ProfileRepository(db);

// Todas las rutas de usuarios requieren autenticación
usersRouter.use('*', authMiddleware);

// ── GET /api/users  (admin+) ──────────────────────────────────────────────────
usersRouter.get('/', async (c) => {
  const user = getRequestUser(c);
  assertRole(user, ['superadmin', 'admin']);

  const profiles = await profileRepo.getAll();
  return c.json({ profiles });
});

// ── GET /api/users/me ─────────────────────────────────────────────────────────
usersRouter.get('/me', async (c) => {
  const user = getRequestUser(c);
  const profile = await profileRepo.getById(user.sub);
  if (!profile) throw new ApiError(404, 'Perfil no encontrado');
  return c.json({ profile });
});

// ── PATCH /api/users/:id/role  (solo superadmin) ──────────────────────────────
const roleSchema = z.object({
  role: z.enum(['superadmin', 'admin', 'gestor', 'user']),
});

usersRouter.patch('/:id/role', async (c) => {
  const user = getRequestUser(c);
  assertRole(user, ['superadmin']);

  const { id } = c.req.param();
  const body = await c.req.json();
  const parsed = roleSchema.safeParse(body);
  if (!parsed.success) throw new ApiError(400, 'Rol no válido');

  await profileRepo.updateRole(id, parsed.data.role);
  return c.json({ success: true });
});

// ── PATCH /api/users/:id/plan  (admin+) ───────────────────────────────────────
const planSchema = z.object({
  plan: z.enum(['free', 'premium']),
});

usersRouter.patch('/:id/plan', async (c) => {
  const user = getRequestUser(c);
  assertRole(user, ['superadmin', 'admin']);

  const { id } = c.req.param();
  const body = await c.req.json();
  const parsed = planSchema.safeParse(body);
  if (!parsed.success) throw new ApiError(400, 'Plan no válido');

  await profileRepo.updatePlan(id, parsed.data.plan);
  return c.json({ success: true });
});
