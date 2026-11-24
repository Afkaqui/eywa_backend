import { Hono } from 'hono';
import { z } from 'zod';
import { authMiddleware } from '@/middleware/auth';
import { getRequestUser, assertRole, ApiError } from '@/lib/auth-helpers';
import { ProfileRepository } from '@/repositories/profile-repository';
import { db } from '@/lib/db';
import { NO_ES_PERFIL_DE_SERVICIO } from '@/lib/api-scopes';
import { hashPassword } from '@/lib/password';
import { sendMail, baseTemplate, appUrl, isMailConfigured } from '@/lib/mailer';

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

// ── POST /api/users/:id/password — fijar la contraseña de otro (SOLO superadmin)
//
// Decisión del usuario (2026-08-22): el superadmin fija la contraseña él mismo,
// en vez de mandar un enlace de restablecimiento. Es más directo para dar de alta
// a gente que no puede recibir el correo, pero significa que el administrador
// PASA A CONOCER la clave de esa cuenta. Por eso el endpoint hace tres cosas que
// no son opcionales:
//
//   1. deja constancia de QUIÉN la fijó (`passwordChangedBy`), porque
//      `passwordChangedAt` solo no distingue al dueño de un administrador;
//   2. invalida los enlaces de recuperación pendientes, para que un correo viejo
//      no deshaga el cambio;
//   3. avisa al dueño de la cuenta por correo.
//
// La contraseña NO se registra en ningún log.
const adminPasswordSchema = z.object({
  new_password: z.string().min(6, 'La contraseña debe tener al menos 6 caracteres'),
});

usersRouter.post('/:id/password', async (c) => {
  const admin = getRequestUser(c);
  assertRole(admin, ['superadmin']);

  const parsed = adminPasswordSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) throw new ApiError(400, parsed.error.errors[0]?.message ?? 'Datos inválidos');

  const objetivo = await db.profile.findUnique({
    where:  { id: c.req.param('id') },
    select: { id: true, email: true, fullName: true },
  });
  if (!objetivo) throw new ApiError(404, 'Usuario no encontrado');

  const hash = await hashPassword(parsed.data.new_password);
  await db.$transaction([
    db.profile.update({
      where: { id: objetivo.id },
      data:  { password: hash, passwordChangedAt: new Date(), passwordChangedBy: admin.sub },
    }),
    // Un enlace de "olvidé mi contraseña" pedido antes seguiría siendo válido y
    // permitiría revertir esto sin que el administrador se entere.
    db.passwordResetToken.updateMany({
      where: { userId: objetivo.id, usedAt: null },
      data:  { usedAt: new Date() },
    }),
  ]);

  // El dueño de la cuenta se entera de que su clave cambió. Si el correo falla,
  // el cambio ya está hecho: no se revierte, pero se dice que no se avisó.
  let avisado = false;
  if (isMailConfigured()) {
    const saludo = objetivo.fullName ? `Hola ${objetivo.fullName},` : 'Hola,';
    const r = await sendMail({
      to:      objetivo.email,
      subject: 'Un administrador cambió la contraseña de tu cuenta EYWA',
      html: baseTemplate({
        title: 'Tu contraseña fue cambiada',
        bodyHtml: `
          <p style="margin:0 0 12px;">${saludo}</p>
          <p style="margin:0 0 12px;">
            Un administrador de EYWA fijó una contraseña nueva para tu cuenta
            <strong>${objetivo.email}</strong>. Debería habértela entregado por otro medio.
          </p>
          <p style="margin:0 0 12px;">
            Cuando entres, cámbiala desde <em>Configuración</em> para que solo tú la conozcas.
          </p>
          <p style="margin:0 0 12px;">
            <strong>Si no esperabas este cambio</strong>, escríbenos de inmediato.
          </p>
          <p style="margin:0;"><a href="${appUrl('/')}">Ir a EYWA</a></p>`,
      }),
      text: `${saludo}

Un administrador de EYWA fijó una contraseña nueva para tu cuenta `
          + `${objetivo.email}. Cámbiala desde Configuración cuando entres. `
          + `Si no esperabas este cambio, escríbenos de inmediato.`,
    }).catch(() => ({ ok: false }));
    avisado = !!(r as { ok?: boolean }).ok;
  }

  return c.json({ success: true, email: objetivo.email, notificado: avisado });
});

// ── GET /api/users/audit — control y auditoría (SOLO superadmin) ──────────────
// Reúne en una sola llamada lo que un superadmin necesita para vigilar la
// plataforma: quién entró y cuándo, quién cambió su contraseña, quién tiene
// acceso a documentos sensibles desde fuera, y qué se ha descargado.
//
// HONESTIDAD DEL DATO: `last_login_at` y `password_changed_at` empezaron a
// registrarse el 2026-07-26. Para las cuentas anteriores llegan en null y la UI
// dice "Sin registro" — NO se rellenan con created_at, que sería inventar un
// dato justo en el panel donde más importa que sea cierto.
usersRouter.get('/audit', async (c) => {
  const user = getRequestUser(c);
  assertRole(user, ['superadmin']);

  const logLimit = Math.min(Math.max(Number(c.req.query('logs') ?? 50), 1), 200);
  const now = new Date();

  const [profiles, orgs, logs, invitations, resetTokens] = await Promise.all([
    db.profile.findMany({
      where:   NO_ES_PERFIL_DE_SERVICIO,
      orderBy: { createdAt: 'asc' },
      select: {
        id: true, email: true, fullName: true, role: true, plan: true,
        createdAt: true, lastLoginAt: true, passwordChangedAt: true,
        passwordChangedBy: true,
        // Varias por usuario (§13); el panel muestra cuántas y sus nombres.
        organizations: { select: { id: true, name: true }, orderBy: { createdAt: 'asc' } },
      },
    }),
    db.organization.count(),
    // Bitácora GLOBAL: el dueño ve la suya; el superadmin ve la de todas.
    db.dataroomAccessLog.findMany({
      orderBy: { createdAt: 'desc' },
      take:    logLimit,
      include: {
        document:   { select: { fileName: true, organization: { select: { name: true } } } },
        user:       { select: { email: true, fullName: true } },
        invitation: { select: { email: true, name: true } },
      },
    }),
    // Accesos externos VIGENTES: gente ajena a la plataforma que ahora mismo
    // puede abrir el dataroom de alguna empresa. Es el dato más sensible aquí.
    db.dataroomInvitation.findMany({
      where:   { revokedAt: null, expiresAt: { gt: now } },
      orderBy: { createdAt: 'desc' },
      include: { organization: { select: { name: true } } },
    }),
    // Solicitudes de recuperación de contraseña sin usar todavía
    db.passwordResetToken.count({ where: { usedAt: null, expiresAt: { gt: now } } }),
  ]);

  // Nombres de los administradores que fijaron alguna contraseña. Se resuelve
  // aquí y no con un include por fila para no hacer N consultas.
  const idsAdmin = [...new Set(profiles.map(p => p.passwordChangedBy).filter((x): x is string => !!x))];
  const adminsPorId = new Map(
    (idsAdmin.length
      ? await db.profile.findMany({ where: { id: { in: idsAdmin } }, select: { id: true, email: true, fullName: true } })
      : []
    ).map(a => [a.id, a.fullName || a.email]),
  );

  return c.json({
    // Desde cuándo son fiables los campos de sesión/contraseña
    tracking_since: '2026-07-26',
    summary: {
      users:            profiles.length,
      organizations:    orgs,
      never_logged_in:  profiles.filter(p => !p.lastLoginAt).length,
      staff:            profiles.filter(p => ['superadmin', 'admin', 'gestor'].includes(p.role)).length,
      external_access:  invitations.length,
      pending_resets:   resetTokens,
    },
    users: profiles.map(p => ({
      id:                  p.id,
      email:               p.email,
      name:                p.fullName,
      role:                p.role,
      plan:                p.plan,
      created_at:          p.createdAt.toISOString(),
      last_login_at:       p.lastLoginAt?.toISOString() ?? null,
      password_changed_at: p.passwordChangedAt?.toISOString() ?? null,
      // Quién la fijó. null = la cambió el propio usuario. Se resuelve el UUID a
      // un nombre: un identificador en el panel de auditoría no dice nada.
      password_set_by: p.passwordChangedBy
        ? (adminsPorId.get(p.passwordChangedBy) ?? 'Administrador dado de baja')
        : null,
      organizations:       p.organizations.map(o => o.name),
      organization:        p.organizations[0]?.name ?? null, // compat: la predeterminada
    })),
    access_log: logs.map(l => ({
      id:           l.id,
      action:       l.action,
      file_name:    l.document.fileName,
      organization: l.document.organization?.name ?? null,
      // Mismo orden que la bitácora del dueño: cuenta → invitado → anónimo
      who: l.user
        ? (l.user.fullName || l.user.email)
        : l.invitation
          ? `${l.invitation.name || l.invitation.email} (invitado)`
          : 'Visitante (landing pública)',
      created_at:   l.createdAt.toISOString(),
    })),
    external_access: invitations.map(i => ({
      id:             i.id,
      email:          i.email,
      name:           i.name,
      organization:   i.organization.name,
      expires_at:     i.expiresAt.toISOString(),
      last_access_at: i.lastAccessAt?.toISOString() ?? null,
    })),
  });
});
