import { Hono } from 'hono';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { randomBytes, createHash } from 'crypto';
import { db } from '@/lib/db';
import { signToken, ApiError } from '@/lib/auth-helpers';
import { sendMail, baseTemplate, appUrl, isMailConfigured } from '@/lib/mailer';

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

  return c.json({
    token,
    user: {
      id:      user.id,
      email:   user.email,
      name:    user.fullName,   // Auth.js lo lee de aquí (no del JWT) -> nombre en perfil/certificado
      role:    user.role,
      plan:    user.plan,
      company: user.company,
    },
  });
});

// ── POST /api/auth/oauth-sync ─────────────────────────────────────────────────
// Llamado por Auth.js cuando un usuario se autentica con Google (o cualquier OAuth).
// Crea la cuenta si no existe y devuelve el JWT del backend.
const oauthSyncSchema = z.object({
  email:    z.string().email(),
  name:     z.string().nullish(),
  provider: z.string(),
});

authRouter.post('/oauth-sync', async (c) => {
  const body = await c.req.json();
  const parsed = oauthSyncSchema.safeParse(body);

  if (!parsed.success) throw new ApiError(400, 'Datos inválidos');

  const { email, name } = parsed.data;

  // Buscar o crear el perfil
  let user = await db.profile.findUnique({ where: { email } });

  if (!user) {
    user = await db.profile.create({
      data: {
        email,
        password: '', // OAuth users don't need a password
        fullName:  name ?? null,
        company:   null,
        role:      'user',
        plan:      'free',
      },
    });
  }

  const token = signToken({
    sub:   user.id,
    email: user.email,
    role:  user.role,
    plan:  user.plan,
    name:  user.fullName ?? undefined,
  });

  return c.json({
    token,
    user: {
      id:      user.id,
      email:   user.email,
      role:    user.role,
      plan:    user.plan,
      company: user.company,
    },
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Recuperación de contraseña
// ══════════════════════════════════════════════════════════════════════════════
//
// Reglas de seguridad aplicadas aquí:
// 1. NO se revela si un correo existe (evita enumerar usuarios): la respuesta es
//    idéntica exista o no la cuenta.
// 2. El token viaja SOLO en el correo; en la BD se guarda su SHA-256.
// 3. Un solo uso y expiración corta (1 hora).
// 4. Al pedir uno nuevo se invalidan los anteriores del usuario.
// 5. Anti-spam: si ya se emitió uno hace menos de 60 s, no se manda otro (pero la
//    respuesta al cliente es la misma, para no filtrar nada).

const TOKEN_TTL_MIN   = 60;  // minutos de validez
const RESEND_COOLDOWN = 60;  // segundos entre solicitudes por usuario

const sha256 = (v: string) => createHash('sha256').update(v).digest('hex');

// Respuesta genérica: la MISMA exista o no la cuenta.
const GENERIC_FORGOT_RESPONSE = {
  message: 'Si el correo corresponde a una cuenta, te enviamos un enlace para restablecer tu contraseña. Revisa tu bandeja y la carpeta de spam.',
};

const forgotSchema = z.object({ email: z.string().email() });

// ── POST /api/auth/forgot-password ────────────────────────────────────────────
authRouter.post('/forgot-password', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const parsed = forgotSchema.safeParse(body);
  // Incluso con un email mal formado devolvemos lo mismo: no damos pistas.
  if (!parsed.success) return c.json(GENERIC_FORGOT_RESPONSE);

  const email = parsed.data.email.trim().toLowerCase();

  // Si el correo no está configurado, decirlo claro en el log del servidor. Al
  // cliente NO: seguiría siendo una vía de enumeración.
  if (!isMailConfigured()) {
    console.error('[auth] forgot-password: correo no configurado (falta RESEND_API_KEY/MAIL_FROM)');
    return c.json(GENERIC_FORGOT_RESPONSE);
  }

  // Búsqueda INSENSIBLE a mayúsculas: el registro guarda el correo tal cual se
  // escribió, así que quien se registró como "Juan@Gmail.com" no aparecería en una
  // búsqueda en minúsculas. Con la respuesta genérica ese fallo sería invisible:
  // vería "te enviamos el enlace" y no llegaría nunca nada.
  const user = await db.profile.findFirst({
    where: { email: { equals: email, mode: 'insensitive' } },
  });

  if (user) {
    // Anti-spam por usuario
    const recent = await db.passwordResetToken.findFirst({
      where: {
        userId:    user.id,
        usedAt:    null,
        createdAt: { gt: new Date(Date.now() - RESEND_COOLDOWN * 1000) },
      },
    });

    if (!recent) {
      // Invalida los pendientes anteriores (marcándolos usados)
      await db.passwordResetToken.updateMany({
        where: { userId: user.id, usedAt: null },
        data:  { usedAt: new Date() },
      });

      const token = randomBytes(32).toString('hex');
      await db.passwordResetToken.create({
        data: {
          userId:    user.id,
          tokenHash: sha256(token),
          expiresAt: new Date(Date.now() + TOKEN_TTL_MIN * 60 * 1000),
        },
      });

      const link = appUrl(`/restablecer?token=${token}`);
      const nombre = user.fullName ? `Hola ${user.fullName},` : 'Hola,';

      const result = await sendMail({
        to:      user.email,
        subject: 'Restablece tu contraseña de EYWA',
        html: baseTemplate({
          title: 'Restablece tu contraseña',
          bodyHtml: `
            <p style="margin:0 0 12px;">${nombre}</p>
            <p style="margin:0 0 12px;">
              Recibimos una solicitud para restablecer la contraseña de tu cuenta
              <strong>${user.email}</strong>. Pulsa el botón para elegir una nueva.
            </p>
            <p style="margin:0;">
              El enlace vence en ${TOKEN_TTL_MIN} minutos y solo puede usarse una vez.
            </p>`,
          ctaLabel: 'Elegir nueva contraseña',
          ctaUrl:   link,
          footerNote: 'Si tú no pediste este cambio, puedes ignorar este correo: tu contraseña actual sigue siendo válida.',
        }),
        text: [
          nombre,
          '',
          `Recibimos una solicitud para restablecer la contraseña de tu cuenta ${user.email}.`,
          `Abre este enlace para elegir una nueva (vence en ${TOKEN_TTL_MIN} minutos, un solo uso):`,
          link,
          '',
          'Si tú no pediste este cambio, ignora este correo: tu contraseña actual sigue siendo válida.',
        ].join('\n'),
      });

      if (!result.ok) {
        // El envío falló: el token quedaría inservible. Lo invalidamos para que el
        // usuario pueda pedir otro de inmediato (sin chocar con el cooldown).
        await db.passwordResetToken.updateMany({
          where: { userId: user.id, usedAt: null },
          data:  { usedAt: new Date() },
        });
        console.error('[auth] no se pudo enviar el correo de recuperación:', result.error);
      }
    }
  }

  return c.json(GENERIC_FORGOT_RESPONSE);
});

// ── POST /api/auth/reset-password ─────────────────────────────────────────────
const resetSchema = z.object({
  token:    z.string().min(32, 'Token inválido'),
  password: z.string().min(6, 'La contraseña debe tener al menos 6 caracteres'),
});

authRouter.post('/reset-password', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const parsed = resetSchema.safeParse(body);
  if (!parsed.success) {
    throw new ApiError(400, parsed.error.errors[0]?.message ?? 'Datos inválidos');
  }

  const { token, password } = parsed.data;

  const row = await db.passwordResetToken.findUnique({
    where:   { tokenHash: sha256(token) },
    include: { user: true },
  });

  // Mismo mensaje para token inexistente, ya usado o vencido: no damos detalles
  // que ayuden a sondear tokens.
  if (!row || row.usedAt || row.expiresAt < new Date()) {
    throw new ApiError(400, 'El enlace no es válido o ya venció. Solicita uno nuevo.');
  }

  const passwordHash = await bcrypt.hash(password, 12);

  // Cambia la contraseña e invalida TODOS los tokens del usuario en una sola
  // transacción: si algo falla, no queda a medias.
  await db.$transaction([
    db.profile.update({
      where: { id: row.userId },
      data:  { password: passwordHash },
    }),
    db.passwordResetToken.updateMany({
      where: { userId: row.userId, usedAt: null },
      data:  { usedAt: new Date() },
    }),
  ]);

  return c.json({ message: 'Tu contraseña se actualizó. Ya puedes iniciar sesión.' });
});
