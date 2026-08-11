import { Hono } from 'hono';
import { z } from 'zod';
import { authMiddleware } from '@/middleware/auth';
import { getRequestUser, ApiError } from '@/lib/auth-helpers';
import { OrganizationRepository } from '@/repositories/organization-repository';
import { validarRuc } from '@/lib/ruc';
import { db } from '@/lib/db';

export const organizationRouter = new Hono();
const orgRepo = new OrganizationRepository(db);

organizationRouter.use('*', authMiddleware);

// ── Reglas de negocio (§13) ─────────────────────────────────────────────────────
//
// Una persona puede estar detrás de VARIAS personas jurídicas (RUC 20) pero tiene
// UNA SOLA persona natural (RUC 10, se deriva de su DNI).
//
// El límite por cuenta vive aquí y no en el schema a propósito: es una decisión de
// negocio revisable, no una invariante del modelo.
const MAX_ORGS_POR_USUARIO = 3;

const orgSchema = z.object({
  type:            z.string().optional(),
  institutionType: z.string().optional().nullable(),
  name:            z.string().min(1, 'La razón social es obligatoria'),
  tradeName:       z.string().max(200).optional().nullable(), // nombre comercial
  ruc:             z.string().optional().nullable(),
  description:     z.string().optional().nullable(),
  phone:           z.string().optional().nullable(),
  website:         z.string().optional().nullable(),
  externalLinks:   z.array(z.string()).optional(),
  country:         z.string().optional().nullable(),
  sector:          z.string().optional().nullable(),
});

type OrgInput = z.infer<typeof orgSchema>;

/**
 * Normaliza y valida el RUC, y deriva el tipo a partir de él.
 * `excluirId` evita que una organización choque consigo misma al editarse.
 */
async function resolverRuc(data: OrgInput, userId: string, excluirId?: string) {
  if (!data.ruc) return { ruc: null, type: data.type ?? 'empresa' };

  const v = validarRuc(data.ruc);
  if (!v.ok) throw new ApiError(400, v.error!);

  // Único GLOBAL: dos cuentas no pueden reclamar la misma empresa.
  const dueño = await db.organization.findUnique({
    where:  { ruc: v.ruc! },
    select: { id: true, userId: true },
  });
  if (dueño && dueño.id !== excluirId) {
    throw new ApiError(409, dueño.userId === userId
      ? 'Ya registraste una organización con ese RUC'
      : 'Ese RUC ya está registrado en la plataforma. Si es tu empresa, escríbenos.');
  }

  // Una sola persona natural por cuenta: el RUC 10 sale del DNI.
  if (v.tipo === 'persona_natural') {
    const yaTiene = await db.organization.findFirst({
      where:  { userId, type: 'persona_natural', ...(excluirId ? { id: { not: excluirId } } : {}) },
      select: { id: true },
    });
    if (yaTiene) {
      throw new ApiError(409, 'Ya tienes registrada tu persona natural (RUC 10). Solo puede haber una por cuenta.');
    }
  }

  // El tipo lo manda el RUC, no lo que venga en el formulario.
  return { ruc: v.ruc!, type: v.tipo === 'persona_natural' ? 'persona_natural' : (data.type ?? 'empresa') };
}

function serialize(o: {
  id: string; name: string; tradeName: string | null; ruc: string | null; type: string;
  sector: string | null; country: string | null; publicEnabled: boolean; publicSlug: string | null;
  imageUrl: string | null; createdAt: Date;
}) {
  return {
    id:          o.id,
    name:        o.name,        // razón social
    trade_name:  o.tradeName,   // nombre comercial
    ruc:         o.ruc,
    type:        o.type,
    sector:      o.sector,
    country:     o.country,
    has_logo:    !!o.imageUrl,
    public_slug: o.publicEnabled ? o.publicSlug : null,
    created_at:  o.createdAt.toISOString(),
  };
}

// ── GET /api/organization — la PREDETERMINADA (compatibilidad) ─────────────────
// Se conserva tal cual para no romper lo que ya la consume. Devuelve la más
// antigua; el frontend con selector debe usar /all y /:id.
organizationRouter.get('/', async (c) => {
  const user = getRequestUser(c);
  const org = await orgRepo.findByUser(user.sub);
  return c.json({ organization: org ?? null });
});

// ── GET /api/organization/all — todas las del usuario ──────────────────────────
organizationRouter.get('/all', async (c) => {
  const user = getRequestUser(c);
  const orgs = await orgRepo.findAllByUser(user.sub);
  return c.json({
    organizations: orgs.map(serialize),
    limit:         MAX_ORGS_POR_USUARIO,
    can_add:       orgs.length < MAX_ORGS_POR_USUARIO,
    // La predeterminada es la más antigua mientras no exista selector persistente.
    default_id:    orgs[0]?.id ?? null,
  });
});

// ── POST /api/organization — crear una NUEVA ───────────────────────────────────
organizationRouter.post('/', async (c) => {
  const user = getRequestUser(c);
  const parsed = orgSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) throw new ApiError(400, parsed.error.errors[0]?.message ?? 'Datos inválidos');

  const actuales = await orgRepo.findAllByUser(user.sub);
  if (actuales.length >= MAX_ORGS_POR_USUARIO) {
    throw new ApiError(409,
      `Tu cuenta admite hasta ${MAX_ORGS_POR_USUARIO} organizaciones. Si necesitas más, escríbenos.`);
  }

  const { ruc, type } = await resolverRuc(parsed.data, user.sub);
  const { ruc: _omitir, type: _omitir2, ...resto } = parsed.data;

  const org = await db.organization.create({
    data: { userId: user.sub, ...resto, ruc, type },
  });
  return c.json({ organization: serialize(org) }, 201);
});

// ── PUT /api/organization — editar la PREDETERMINADA (compatibilidad) ──────────
organizationRouter.put('/', async (c) => {
  const user = getRequestUser(c);
  const parsed = orgSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) throw new ApiError(400, parsed.error.errors[0]?.message ?? 'Datos inválidos');

  const actual = await orgRepo.findByUser(user.sub);
  const { ruc, type } = await resolverRuc(parsed.data, user.sub, actual?.id);
  const { ruc: _o, type: _o2, ...resto } = parsed.data;

  const org = actual
    ? await db.organization.update({ where: { id: actual.id }, data: { ...resto, ruc, type } })
    : await db.organization.create({ data: { userId: user.sub, ...resto, ruc, type } });

  return c.json({ organization: org });
});

// ── PATCH /api/organization/:id — editar UNA concreta ──────────────────────────
organizationRouter.patch('/:id', async (c) => {
  const user = getRequestUser(c);
  const { id } = c.req.param();

  // Verificar propiedad ANTES de tocar nada: sin esto se podría editar la
  // organización de otra cuenta pasando su id.
  const actual = await db.organization.findFirst({ where: { id, userId: user.sub } });
  if (!actual) throw new ApiError(404, 'Organización no encontrada');

  const parsed = orgSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) throw new ApiError(400, parsed.error.errors[0]?.message ?? 'Datos inválidos');

  const { ruc, type } = await resolverRuc(parsed.data, user.sub, id);
  const { ruc: _o, type: _o2, ...resto } = parsed.data;

  const org = await db.organization.update({ where: { id }, data: { ...resto, ruc, type } });
  return c.json({ organization: serialize(org) });
});

// ── GET /api/organization/:id/impacto — qué se perdería al borrarla ────────────
// Se consulta ANTES de borrar. Un dataroom con documentos y un diagnóstico son
// trabajo real; el usuario merece ver qué desaparece antes de confirmarlo.
organizationRouter.get('/:id/impacto', async (c) => {
  const user = getRequestUser(c);
  const { id } = c.req.param();
  const org = await db.organization.findFirst({ where: { id, userId: user.sub } });
  if (!org) throw new ApiError(404, 'Organización no encontrada');

  const [documentos, diagnosticos, invitaciones] = await Promise.all([
    db.dataroomDocument.count({ where: { organizationId: id } }),
    db.diagnosticResult.count({ where: { organizationId: id } }),
    db.dataroomInvitation.count({ where: { organizationId: id, revokedAt: null } }),
  ]);
  return c.json({
    organization: serialize(org),
    se_perderia: { documentos, diagnosticos, invitaciones_activas: invitaciones },
  });
});

// ── DELETE /api/organization/:id ───────────────────────────────────────────────
organizationRouter.delete('/:id', async (c) => {
  const user = getRequestUser(c);
  const { id } = c.req.param();

  const org = await db.organization.findFirst({ where: { id, userId: user.sub } });
  if (!org) throw new ApiError(404, 'Organización no encontrada');

  // Borrar arrastra en cascada el dataroom, sus documentos, los diagnósticos y las
  // invitaciones de esa organización. Los ARCHIVOS del disco NO se borran aquí:
  // se limpian aparte para no perderlos por un clic (ver PENDIENTES §13).
  await db.organization.delete({ where: { id } });
  return c.json({ success: true });
});
