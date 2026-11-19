import { Hono } from 'hono';
import { z } from 'zod';
import { unlink, rm } from 'fs/promises';
import path from 'path';
import { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { authMiddleware } from '@/middleware/auth';
import { getRequestUser, assertRole, ApiError } from '@/lib/auth-helpers';
import { sendMail, baseTemplate, appUrl } from '@/lib/mailer';

// ══ Solicitudes de baja de cuenta (Ley 29733, derecho de cancelación) ════════
//
//  · POST /api/bajas              público: cualquiera pide la baja con su correo.
//  · GET  /api/bajas              superadmin: lista de solicitudes.
//  · POST /api/bajas/:id/eliminar superadmin: borra la cuenta y avisa por correo.
//  · POST /api/bajas/:id/rechazar superadmin: rechaza con una nota y avisa.
//
// Nunca se borra nada solo por pedirlo: lo decide un superadmin. La respuesta
// pública es SIEMPRE la misma, exista o no la cuenta (no revela qué correos están
// registrados). Si la cuenta existe, se le escribe a ESE correo: si alguien pide la
// baja de una cuenta ajena, el dueño se entera.

export const bajasRouter = new Hono();
const UPLOAD_DIR = process.env.UPLOAD_DIR ?? '/app/uploads';
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

// Límite simple por IP: 5 solicitudes por hora.
const porIp = new Map<string, number[]>();
function limitar(ip: string) {
  const ahora = Date.now();
  const recientes = (porIp.get(ip) ?? []).filter((t) => ahora - t < 3_600_000);
  if (recientes.length >= 5) throw new ApiError(429, 'Demasiadas solicitudes. Inténtalo en una hora.');
  recientes.push(ahora); porIp.set(ip, recientes);
  if (porIp.size > 5000) porIp.clear();
}

const solicitudSchema = z.object({
  email:  z.string().trim().toLowerCase().email('Correo inválido').max(200),
  nombre: z.string().trim().max(150).nullish(),
  motivo: z.string().trim().max(2000).nullish(),
  confirmo: z.literal(true, { errorMap: () => ({ message: 'Confirma que entiendes que la baja es definitiva' }) }),
});

bajasRouter.post('/', async (c) => {
  limitar((c.req.header('x-forwarded-for') ?? '').split(',')[0].trim() || 'desconocida');
  const parsed = solicitudSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) throw new ApiError(400, parsed.error.errors[0]?.message ?? 'Datos inválidos');
  const d = parsed.data;

  const perfil = await db.profile.findFirst({
    where: { email: { equals: d.email, mode: 'insensitive' } }, select: { id: true, email: true, fullName: true },
  });
  // Una sola solicitud pendiente por correo.
  const ya = await db.solicitudBaja.findFirst({ where: { email: d.email, estado: 'pendiente' } });
  if (!ya) {
    await db.solicitudBaja.create({
      data: { email: d.email, nombre: d.nombre ?? null, motivo: d.motivo ?? null, profileId: perfil?.id ?? null },
    });
    if (perfil) {
      await sendMail({
        to: perfil.email,
        subject: 'Recibimos tu solicitud de baja de EYWA',
        html: baseTemplate({
          title: 'Recibimos tu solicitud de baja',
          bodyHtml: `<p>Hola${perfil.fullName ? ' ' + esc(perfil.fullName) : ''}:</p>
            <p>Recibimos una solicitud para eliminar tu cuenta de EYWA. La revisaremos y te escribiremos cuando se complete.</p>
            <p><strong>¿No la pediste tú?</strong> Responde a este correo y no eliminaremos nada.</p>`,
        }),
        text: 'Recibimos una solicitud para eliminar tu cuenta de EYWA. La revisaremos y te escribiremos cuando se complete. Si no la pediste tú, responde a este correo y no eliminaremos nada.',
      }).catch(() => {});
    }
  }
  return c.json({ ok: true, mensaje: 'Recibimos tu solicitud. Si hay una cuenta con ese correo, te escribiremos para confirmarlo.' });
});

// ── Superadmin ────────────────────────────────────────────────────────────────
bajasRouter.use('/*', async (c, next) => {
  if (c.req.method === 'POST' && c.req.path.replace(/\/+$/, '') === '/api/bajas') return next();
  return authMiddleware(c, next);
});

bajasRouter.get('/', async (c) => {
  assertRole(getRequestUser(c), ['superadmin']);
  const l = await db.solicitudBaja.findMany({
    orderBy: [{ estado: 'asc' }, { createdAt: 'desc' }], take: 200,
    include: { profile: { select: {
      id: true, email: true, fullName: true, role: true, plan: true, lastLoginAt: true, createdAt: true,
      _count: { select: { organizations: true, projectPlans: true } },
    } } },
  });
  return c.json({ solicitudes: l.map((s) => ({
    id: s.id, email: s.email, nombre: s.nombre, motivo: s.motivo, estado: s.estado, nota: s.nota,
    resuelta_por: s.resueltaPor, resuelta_at: s.resueltaAt?.toISOString() ?? null, created_at: s.createdAt.toISOString(),
    cuenta: s.profile ? {
      id: s.profile.id, email: s.profile.email, nombre: s.profile.fullName, rol: s.profile.role, plan: s.profile.plan,
      ultimo_acceso: s.profile.lastLoginAt?.toISOString() ?? null, creada: s.profile.createdAt.toISOString(),
      organizaciones: s.profile._count.organizations, proyectos: s.profile._count.projectPlans,
    } : null,
  })) });
});

async function pendiente(id: string) {
  const s = await db.solicitudBaja.findUnique({ where: { id } });
  if (!s) throw new ApiError(404, 'Solicitud no encontrada');
  if (s.estado !== 'pendiente') throw new ApiError(409, 'Esta solicitud ya se resolvió');
  return s;
}

bajasRouter.post('/:id/eliminar', async (c) => {
  const yo = getRequestUser(c);
  assertRole(yo, ['superadmin']);
  const s = await pendiente(c.req.param('id'));
  if (!s.profileId) throw new ApiError(409, 'No hay ninguna cuenta con ese correo. Recházala con una nota.');
  if (s.profileId === yo.sub) throw new ApiError(409, 'No puedes eliminar tu propia cuenta desde aquí');

  const p = await db.profile.findUnique({
    where: { id: s.profileId },
    select: { id: true, email: true, fullName: true, role: true, avatarUrl: true,
      organizations: { select: { id: true, imageUrl: true, documents: { select: { storagePath: true } } } },
      projectPlans: { select: { id: true } } },
  });
  if (!p) throw new ApiError(404, 'La cuenta ya no existe');
  if (p.role === 'superadmin') throw new ApiError(409, 'Una cuenta superadmin no se elimina desde aquí: primero quítale el rol.');

  const archivos = [p.avatarUrl, ...p.organizations.flatMap((o) => [o.imageUrl, ...o.documents.map((d) => d.storagePath)])]
    .filter((x): x is string => !!x);
  const carpetas = [
    path.join(UPLOAD_DIR, 'avatars', p.id),
    ...p.organizations.map((o) => path.join(UPLOAD_DIR, 'org-logos', o.id)),
    ...p.projectPlans.map((pl) => path.join(UPLOAD_DIR, 'validator', pl.id)),
  ];

  try {
    await db.$transaction(async (tx) => {
      // Organizaciones de Agro donde era el ÚNICO miembro: nadie más puede verlas,
      // se borran con sus productores y registros. Las compartidas se conservan.
      const agro = await tx.agroMiembro.findMany({ where: { profileId: p.id }, select: { organizacionId: true } });
      for (const { organizacionId } of agro) {
        const n = await tx.agroMiembro.count({ where: { organizacionId } });
        if (n === 1) await tx.agroOrganizacion.delete({ where: { id: organizacionId } });
      }
      await tx.profile.delete({ where: { id: p.id } });
      await tx.solicitudBaja.update({
        where: { id: s.id },
        data: { estado: 'eliminada', resueltaPor: yo.email ?? yo.sub, resueltaAt: new Date(), profileId: null },
      });
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2003') {
      throw new ApiError(409, 'La cuenta tiene claves de API de terceros asociadas. Revócalas en Administración y vuelve a intentarlo.');
    }
    throw e;
  }

  // Archivos en disco (avatar, logos, documentos): después del borrado en BD.
  await Promise.all([
    ...archivos.map((f) => unlink(path.isAbsolute(f) ? f : path.join(UPLOAD_DIR, f)).catch(() => {})),
    ...carpetas.map((d) => rm(d, { recursive: true, force: true }).catch(() => {})),
  ]);

  const correo = await sendMail({
    to: p.email,
    subject: 'Tu cuenta de EYWA fue eliminada',
    html: baseTemplate({
      title: 'Tu cuenta fue eliminada',
      bodyHtml: `<p>Hola${p.fullName ? ' ' + esc(p.fullName) : ''}:</p>
        <p>Atendimos tu solicitud: eliminamos tu cuenta de EYWA con sus organizaciones, documentos y diagnósticos.</p>
        <p>Si quieres volver, puedes crear una cuenta nueva cuando lo desees.</p>`,
    }),
    text: 'Atendimos tu solicitud: eliminamos tu cuenta de EYWA con sus organizaciones, documentos y diagnósticos.',
  });
  return c.json({ ok: true, correo_enviado: correo.ok });
});

const rechazoSchema = z.object({ nota: z.string().trim().min(5, 'Escribe el motivo del rechazo (se enviará por correo)').max(2000) });
bajasRouter.post('/:id/rechazar', async (c) => {
  const yo = getRequestUser(c);
  assertRole(yo, ['superadmin']);
  const s = await pendiente(c.req.param('id'));
  const parsed = rechazoSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) throw new ApiError(400, parsed.error.errors[0]?.message ?? 'Nota inválida');

  await db.solicitudBaja.update({
    where: { id: s.id },
    data: { estado: 'rechazada', nota: parsed.data.nota, resueltaPor: yo.email ?? yo.sub, resueltaAt: new Date() },
  });
  // Solo se escribe si la cuenta existe (a su correo registrado).
  let correo = false;
  if (s.profileId) {
    const p = await db.profile.findUnique({ where: { id: s.profileId }, select: { email: true } });
    if (p) {
      correo = (await sendMail({
        to: p.email,
        subject: 'Sobre tu solicitud de baja de EYWA',
        html: baseTemplate({
          title: 'No eliminamos tu cuenta',
          bodyHtml: `<p>Revisamos la solicitud de baja de tu cuenta y no la eliminamos por este motivo:</p>
            <blockquote style="border-left:3px solid #d1d5db;margin:0;padding-left:12px;color:#374151;">${esc(parsed.data.nota)}</blockquote>
            <p>Si tienes dudas, responde a este correo.</p>`,
          ctaLabel: 'Ir a EYWA', ctaUrl: appUrl('/'),
        }),
        text: `No eliminamos tu cuenta de EYWA por este motivo: ${parsed.data.nota}`,
      })).ok;
    }
  }
  return c.json({ ok: true, correo_enviado: correo });
});
