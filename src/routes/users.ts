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
// ── GET /api/users/search?q=  (todos los usuarios autenticados) ───────────────
usersRouter.get('/search', async (c) => {
  const q = (c.req.query('q') ?? '').trim();
  if (q.length < 2) return c.json({ users: [] });
  const users = await profileRepo.search(q);
  return c.json({ users });
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

// ── PATCH /api/users/me  (actualizar nombre y empresa) ───────────────────────
const updateProfileSchema = z.object({
  full_name: z.string().min(1).optional(),
  company:   z.string().optional(),
});

usersRouter.patch('/me', async (c) => {
  const user = getRequestUser(c);
  const body = await c.req.json();
  const parsed = updateProfileSchema.safeParse(body);
  if (!parsed.success) throw new ApiError(400, parsed.error.errors[0]?.message ?? 'Datos inválidos');

  const updated = await profileRepo.updateProfile(user.sub, {
    fullName: parsed.data.full_name,
    company:  parsed.data.company,
  });
  return c.json({ profile: updated });
});

// ── POST /api/users/me/password  (cambiar contraseña) ────────────────────────
const changePasswordSchema = z.object({
  current_password: z.string().min(1),
  new_password:     z.string().min(6, 'La contraseña debe tener al menos 6 caracteres'),
});

usersRouter.post('/me/password', async (c) => {
  const user = getRequestUser(c);
  const body = await c.req.json();
  const parsed = changePasswordSchema.safeParse(body);
  if (!parsed.success) throw new ApiError(400, parsed.error.errors[0]?.message ?? 'Datos inválidos');

  const result = await profileRepo.changePassword(
    user.sub,
    parsed.data.current_password,
    parsed.data.new_password,
  );
  if (result.error) throw new ApiError(400, result.error);
  return c.json({ success: true });
});
