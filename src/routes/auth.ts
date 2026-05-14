import { Hono } from 'hono';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { db } from '@/lib/db';
import { signToken, ApiError } from '@/lib/auth-helpers';

export const authRouter = new Hono();

// ── Schemas de validación ─────────────────────────────────────────────────────

const loginSchema = z.object({
  email:    z.string().email(),
  password: z.string().min(6),
});

const registerSchema = z.object({
  email:     z.string().email(),
  password:  z.string().min(6),
  full_name: z.string().min(1),
  company:   z.string().optional(),
});

// ── POST /api/auth/validate  (llamado por Auth.js v5 Credentials provider) ────
// Valida credenciales y devuelve el user object. Auth.js crea el JWT.
authRouter.post('/validate', async (c) => {
  const body = await c.req.json();
  const parsed = loginSchema.safeParse(body);

  if (!parsed.success) {
    throw new ApiError(400, 'Email o contraseña inválidos');
  }

  const { email, password } = parsed.data;

  const user = await db.profile.findUnique({ where: { email } });
  if (!user) throw new ApiError(401, 'Credenciales incorrectas');

  const valid = await bcrypt.compare(password, user.password);
  if (!valid) throw new ApiError(401, 'Credenciales incorrectas');

  // Devuelve solo los campos que necesita Auth.js para el JWT
  return c.json({
    id:        user.id,
    email:     user.email,
    name:      user.fullName,
    role:      user.role,
    plan:      user.plan,
    company:   user.company,
  });
});

// ── POST /api/auth/register ───────────────────────────────────────────────────
// Crea una cuenta nueva. El frontend llama esto en el flujo de registro.
authRouter.post('/register', async (c) => {
  const body = await c.req.json();
  const parsed = registerSchema.safeParse(body);

  if (!parsed.success) {
    throw new ApiError(400, parsed.error.errors[0]?.message ?? 'Datos inválidos');
  }

  const { email, password, full_name, company } = parsed.data;

  const existing = await db.profile.findUnique({ where: { email } });
  if (existing) throw new ApiError(409, 'El email ya está registrado');

  const passwordHash = await bcrypt.hash(password, 12);

  const user = await db.profile.create({
    data: {
      email,
      password: passwordHash,
      fullName: full_name,
      company:  company ?? null,
      role:     'user',
      plan:     'free',
    },
  });

  return c.json({
    id:      user.id,
    email:   user.email,
    name:    user.fullName,
    role:    user.role,
    plan:    user.plan,
    company: user.company,
  }, 201);
});

// ── POST /api/auth/login ──────────────────────────────────────────────────────
// Endpoint standalone: valida y devuelve un JWT propio (útil para Postman/testing)
authRouter.post('/login', async (c) => {
  const body = await c.req.json();
  const parsed = loginSchema.safeParse(body);

  if (!parsed.success) throw new ApiError(400, 'Email o contraseña inválidos');

  const { email, password } = parsed.data;
  const user = await db.profile.findUnique({ where: { email } });
  if (!user) throw new ApiError(401, 'Credenciales incorrectas');

  const valid = await bcrypt.compare(password, user.password);
  if (!valid) throw new ApiError(401, 'Credenciales incorrectas');

  const token = signToken({
    sub:   user.id,
    email: user.email,
    role:  user.role,
    plan:  user.plan,
    name:  user.fullName ?? undefined,
  });

  return c.json({ token, user: { id: user.id, email: user.email, role: user.role, plan: user.plan } });
});
