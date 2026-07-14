import { Hono } from 'hono';
import { z } from 'zod';
import { authMiddleware } from '@/middleware/auth';
import { getRequestUser, assertRole, ApiError } from '@/lib/auth-helpers';
import { ActorRepository } from '@/repositories/actor-repository';
import { db } from '@/lib/db';
import type { Actor, ActorCategory } from '@prisma/client';

export const actorsRouter = new Hono();
const actorRepo = new ActorRepository(db);

actorsRouter.use('*', authMiddleware);

const MANAGERS = ['gestor', 'admin', 'superadmin'] as const;
const CATEGORIES = ['proveedores_capital', 'intermediarios', 'bancos', 'gobierno_multilaterales', 'empresa_social'] as const;

// Serializa un actor. La PII (contacto/correo) solo se incluye para gestor/admin.
function serialize(a: Actor, canSeePII: boolean, isFavorite = false) {
  return {
    id:                a.id,
    is_favorite:       isFavorite,
    name:              a.name,
    country:           a.country,
    category:          a.category,
    subcategory:       a.subcategory,
    description:       a.description,
    services:          a.services,
    procedencia:       a.procedencia,
    geo_scope:         a.geoScope,
    instruments:       a.instruments,
    sectors:           a.sectors,
    aum:               a.aum,
    investment_amount: a.investmentAmount,
    website:           a.website,
    source:            a.source,
    // PII — solo gestor/admin
    contact_name:      canSeePII ? a.contactName  : null,
    contact_email:     canSeePII ? a.contactEmail : null,
  };
}

// ── GET /api/actors ───────────────────────────────────────────────────────────
actorsRouter.get('/', async (c) => {
  const user = getRequestUser(c);
  const canSeePII = MANAGERS.includes(user.role as typeof MANAGERS[number]);
  const q = c.req.query();

  const take = Math.min(Number(q.take) || 100, 500);
  const skip = Number(q.skip) || 0;
  const category = CATEGORIES.includes(q.category as ActorCategory) ? (q.category as ActorCategory) : undefined;

  const { items, total } = await actorRepo.list({
    country:    q.country || undefined,
    category,
    sector:     q.sector || undefined,
    instrument: q.instrument || undefined,
    q:          q.q || undefined,
    favoritesOf: q.favorites === 'true' ? user.sub : undefined,
    take, skip,
  });

  const favIds = await actorRepo.getFavoriteIds(user.sub);

  return c.json({
    actors: items.map(a => serialize(a, canSeePII, favIds.has(a.id))),
    total,
    can_see_contact: canSeePII,
    can_edit: MANAGERS.includes(user.role as typeof MANAGERS[number]), // el directorio solo lo edita admin/gestor
  });
});

// ── Favoritos (personales) ────────────────────────────────────────────────────
// El directorio es global y solo lo modifican admin/gestor; marcar favoritos SÍ
// puede hacerlo cualquier usuario, y solo afecta a su propia lista.
actorsRouter.post('/:id/favorite', async (c) => {
  const user = getRequestUser(c);
  const ok = await actorRepo.addFavorite(user.sub, c.req.param('id'));
  if (!ok) throw new ApiError(404, 'Actor no encontrado');
  return c.json({ is_favorite: true });
});

actorsRouter.delete('/:id/favorite', async (c) => {
  const user = getRequestUser(c);
  await actorRepo.removeFavorite(user.sub, c.req.param('id'));
  return c.json({ is_favorite: false });
});

// ── GET /api/actors/facets ────────────────────────────────────────────────────
actorsRouter.get('/facets', async (c) => {
  return c.json(await actorRepo.facets());
});

// ── GET /api/actors/:id ───────────────────────────────────────────────────────
actorsRouter.get('/:id', async (c) => {
  const user = getRequestUser(c);
  const canSeePII = MANAGERS.includes(user.role as typeof MANAGERS[number]);
  const actor = await actorRepo.getById(c.req.param('id'));
  if (!actor) throw new ApiError(404, 'Actor no encontrado');
  const favIds = await actorRepo.getFavoriteIds(user.sub);
  return c.json({ actor: serialize(actor, canSeePII, favIds.has(actor.id)) });
});

// ── Escritura (gestor+) ───────────────────────────────────────────────────────
const actorSchema = z.object({
  name:             z.string().min(1),
  country:          z.string().min(2).max(4),
  category:         z.enum(CATEGORIES),
  subcategory:      z.string().optional().nullable(),
  description:      z.string().optional().nullable(),
  services:         z.string().optional().nullable(),
  procedencia:      z.string().optional().nullable(),
  geoScope:         z.string().optional().nullable(),
  instruments:      z.array(z.string()).optional(),
  sectors:          z.array(z.string()).optional(),
  aum:              z.string().optional().nullable(),
  investmentAmount: z.string().optional().nullable(),
  website:          z.string().optional().nullable(),
  contactName:      z.string().optional().nullable(),
  contactEmail:     z.string().optional().nullable(),
});

actorsRouter.post('/', async (c) => {
  const user = getRequestUser(c);
  assertRole(user, [...MANAGERS]);
  const parsed = actorSchema.safeParse(await c.req.json());
  if (!parsed.success) throw new ApiError(400, parsed.error.errors[0]?.message ?? 'Datos inválidos');
  const actor = await actorRepo.create(user.sub, { ...parsed.data, source: 'manual' });
  return c.json({ actor: serialize(actor, true) }, 201);
});

actorsRouter.patch('/:id', async (c) => {
  const user = getRequestUser(c);
  assertRole(user, [...MANAGERS]);
  const parsed = actorSchema.partial().safeParse(await c.req.json());
  if (!parsed.success) throw new ApiError(400, parsed.error.errors[0]?.message ?? 'Datos inválidos');
  const actor = await actorRepo.update(c.req.param('id'), parsed.data);
  if (!actor) throw new ApiError(404, 'Actor no encontrado');
  return c.json({ actor: serialize(actor, true) });
});

actorsRouter.delete('/:id', async (c) => {
  const user = getRequestUser(c);
  assertRole(user, [...MANAGERS]);
  const ok = await actorRepo.delete(c.req.param('id'));
  if (!ok) throw new ApiError(404, 'Actor no encontrado');
  return c.json({ success: true });
});
