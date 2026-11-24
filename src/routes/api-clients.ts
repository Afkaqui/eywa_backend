import { Hono } from 'hono';
import { z } from 'zod';
import { randomBytes } from 'node:crypto';
import { authMiddleware } from '@/middleware/auth';
import { getRequestUser, assertRole, ApiError } from '@/lib/auth-helpers';
import { generarApiKey } from '@/middleware/api-key';
import { API_SCOPES, esScopeValido } from '@/lib/api-scopes';
import { hashPassword } from '@/lib/password';
import { db } from '@/lib/db';

// ══ Clientes de la API externa — administración (solo superadmin) ═══════════════
//
// El proceso completo de una clave, sin tocar la BD a mano:
//   emitir  → crea el cliente y su perfil de servicio, devuelve la clave UNA vez
//   ajustar → permisos y límite por hora
//   rotar   → clave nueva para el MISMO cliente (conserva sus empresas); la
//             anterior deja de funcionar en el acto
//   revocar → la clave deja de funcionar; el cliente y sus empresas se conservan
//
// La clave en claro solo existe en la respuesta de emitir/rotar. EYWA guarda su
// sha256, así que si se pierde no se recupera: se rota.

export const apiClientsRouter = new Hono();

apiClientsRouter.use('*', authMiddleware);
apiClientsRouter.use('*', async (c, next) => {
  assertRole(getRequestUser(c), ['superadmin']);
  await next();
});

const DOMINIO_SERVICIO = 'clientes-api.eywa.local';

function serCliente(a: {
  id: string; name: string; keyPrefix: string; scopes: unknown; active: boolean; revokedAt: Date | null;
  rateLimitPerHour: number; requestCount: number; createdAt: Date; lastUsedAt: Date | null;
  _count?: { organizations: number };
}) {
  return {
    id:                  a.id,
    nombre:              a.name,
    prefijo:             a.keyPrefix,
    permisos:            Array.isArray(a.scopes) ? a.scopes : [],
    activo:              a.active && !a.revokedAt,
    revocado:            a.revokedAt?.toISOString() ?? null,
    limite_por_hora:     a.rateLimitPerHour,
    peticiones:          a.requestCount,
    empresas:            a._count?.organizations ?? 0,
    creado:              a.createdAt.toISOString(),
    ultimo_uso:          a.lastUsedAt?.toISOString() ?? null,
  };
}

// ── GET / — clientes y catálogo de permisos ──────────────────────────────────
apiClientsRouter.get('/', async (c) => {
  const clientes = await db.apiClient.findMany({
    orderBy: { createdAt: 'desc' },
    include: { _count: { select: { organizations: true } } },
  });
  return c.json({
    clientes: clientes.map(serCliente),
    permisos_disponibles: Object.entries(API_SCOPES).map(([clave, descripcion]) => ({ clave, descripcion })),
  });
});

const permisosSchema = z.array(z.string())
  .min(1, 'Elige al menos un permiso')
  .refine((xs) => xs.every(esScopeValido), 'Permiso desconocido')
  .transform((xs) => [...new Set(xs)]);

// ── POST / — emitir ──────────────────────────────────────────────────────────
const emitirSchema = z.object({
  nombre:          z.string().trim().min(2, 'El nombre es obligatorio').max(120),
  permisos:        permisosSchema,
  limite_por_hora: z.number().int().min(1).max(10000).default(120),
});

apiClientsRouter.post('/', async (c) => {
  const user = getRequestUser(c);
  const parsed = emitirSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) throw new ApiError(400, parsed.error.errors[0]?.message ?? 'Datos inválidos');
  const { nombre, permisos, limite_por_hora } = parsed.data;

  const k = generarApiKey();
  // Perfil de servicio: dueño de las empresas que este cliente dé de alta.
  // Contraseña aleatoria que nadie conoce → no puede iniciar sesión.
  const slug = nombre.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '.').replace(/^\.|\.$/g, '').slice(0, 40) || 'cliente';
  const email = `api.${slug}.${randomBytes(3).toString('hex')}@${DOMINIO_SERVICIO}`;
  const password = await hashPassword(randomBytes(32).toString('hex'));

  const cliente = await db.$transaction(async (tx) => {
    const perfil = await tx.profile.create({
      data: { email, fullName: `API · ${nombre}`, company: nombre, password, role: 'user', plan: 'free' },
    });
    return tx.apiClient.create({
      data: {
        name: nombre, keyPrefix: k.prefijo, keyHash: k.hash, profileId: perfil.id,
        scopes: permisos, rateLimitPerHour: limite_por_hora, createdBy: user.sub,
      },
    });
  });

  return c.json({
    cliente: serCliente(cliente),
    clave:   k.clave,
    nota:    'Esta es la única vez que se muestra la clave. EYWA no la guarda en claro.',
  }, 201);
});

// ── PATCH /:id — ajustar permisos y límite ───────────────────────────────────
const ajustarSchema = z.object({
  permisos:        permisosSchema.optional(),
  limite_por_hora: z.number().int().min(1).max(10000).optional(),
});

apiClientsRouter.patch('/:id', async (c) => {
  const parsed = ajustarSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) throw new ApiError(400, parsed.error.errors[0]?.message ?? 'Datos inválidos');
  const existe = await db.apiClient.findUnique({ where: { id: c.req.param('id') }, select: { id: true } });
  if (!existe) throw new ApiError(404, 'Cliente no encontrado');

  const cliente = await db.apiClient.update({
    where: { id: existe.id },
    data: {
      ...(parsed.data.permisos        ? { scopes: parsed.data.permisos } : {}),
      ...(parsed.data.limite_por_hora ? { rateLimitPerHour: parsed.data.limite_por_hora } : {}),
    },
    include: { _count: { select: { organizations: true } } },
  });
  return c.json({ cliente: serCliente(cliente) });
});

// ── POST /:id/rotar — clave nueva, mismo cliente ─────────────────────────────
// También reactiva un cliente revocado: es la forma de devolverle el acceso con
// una clave que no sea la que se expuso.
apiClientsRouter.post('/:id/rotar', async (c) => {
  const existe = await db.apiClient.findUnique({ where: { id: c.req.param('id') }, select: { id: true } });
  if (!existe) throw new ApiError(404, 'Cliente no encontrado');

  const k = generarApiKey();
  const cliente = await db.apiClient.update({
    where:   { id: existe.id },
    data:    { keyPrefix: k.prefijo, keyHash: k.hash, active: true, revokedAt: null },
    include: { _count: { select: { organizations: true } } },
  });
  return c.json({
    cliente: serCliente(cliente),
    clave:   k.clave,
    nota:    'La clave anterior ya no funciona. Esta es la única vez que se muestra la nueva.',
  });
});

// ── POST /:id/revocar ────────────────────────────────────────────────────────
apiClientsRouter.post('/:id/revocar', async (c) => {
  const existe = await db.apiClient.findUnique({ where: { id: c.req.param('id') }, select: { id: true } });
  if (!existe) throw new ApiError(404, 'Cliente no encontrado');

  const cliente = await db.apiClient.update({
    where:   { id: existe.id },
    data:    { active: false, revokedAt: new Date() },
    include: { _count: { select: { organizations: true } } },
  });
  return c.json({ cliente: serCliente(cliente) });
});
