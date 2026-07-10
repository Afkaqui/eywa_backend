import { Hono } from 'hono';
import { z } from 'zod';
import { authMiddleware } from '@/middleware/auth';
import { getRequestUser, ApiError } from '@/lib/auth-helpers';
import { SimbiocreacionRepository } from '@/repositories/simbiocreacion-repository';
import { db } from '@/lib/db';

export const simbiocreacionRouter = new Hono();
const simbiRepo = new SimbiocreacionRepository(db);

simbiocreacionRouter.use('*', authMiddleware);

// Grafo persistido (coincide con StoredGraph del frontend).
// null = el usuario borró su grafo personalizado.
const graphSchema = z.object({
  nodes: z.array(z.object({
    id:     z.string(),
    label:  z.string(),
    type:   z.enum(['center', 'category', 'group', 'person']),
    color:  z.string(),
    userId: z.string().optional(),
  })),
  edges: z.array(z.object({ from: z.string(), to: z.string() })),
});

const simbiSchema = z.object({
  nombre:      z.string().min(1),
  privado:     z.boolean().optional(),
  lugar:       z.string().optional().nullable(),
  fecha:       z.string().optional().nullable(),
  horaInicio:  z.string().optional().nullable(),
  descripcion: z.string().optional().nullable(),
  link:        z.string().optional().nullable(),
  tags:        z.array(z.string()).optional(),
  extraUrls:   z.array(z.string()).optional(),
  ods:         z.array(z.number()).optional(),
  graphData:   graphSchema.nullable().optional(),
});

// GET /api/simbiocreacion
simbiocreacionRouter.get('/', async (c) => {
  const user = getRequestUser(c);
  const items = await simbiRepo.findByUser(user.sub);
  return c.json({ simbiocreaciones: items });
});

// POST /api/simbiocreacion
simbiocreacionRouter.post('/', async (c) => {
  const user = getRequestUser(c);
  const body = await c.req.json();
  const parsed = simbiSchema.safeParse(body);
  if (!parsed.success) throw new ApiError(400, parsed.error.errors[0]?.message ?? 'Datos invalidos');

  const item = await simbiRepo.create(user.sub, parsed.data);
  return c.json({ simbiocreacion: item }, 201);
});

// PATCH /api/simbiocreacion/:id
simbiocreacionRouter.patch('/:id', async (c) => {
  const user = getRequestUser(c);
  const { id } = c.req.param();
  const body = await c.req.json();
  const parsed = simbiSchema.partial().safeParse(body);
  if (!parsed.success) throw new ApiError(400, parsed.error.errors[0]?.message ?? 'Datos invalidos');

  const item = await simbiRepo.update(id, user.sub, parsed.data);
  if (!item) throw new ApiError(404, 'Simbiocreación no encontrada');
  return c.json({ simbiocreacion: item });
});

// DELETE /api/simbiocreacion/:id
simbiocreacionRouter.delete('/:id', async (c) => {
  const user = getRequestUser(c);
  const { id } = c.req.param();
  const deleted = await simbiRepo.delete(id, user.sub);
  if (!deleted) throw new ApiError(404, 'Simbiocreación no encontrada');
  return c.json({ success: true });
});

// GET /api/simbiocreacion/public  — all public simbiocreaciones (for Explora)
simbiocreacionRouter.get('/public', async (_c) => {
  const items = await simbiRepo.findPublic();
  return _c.json({ simbiocreaciones: items });
});

// GET /api/simbiocreacion/ranking — users ranked by puntaje
simbiocreacionRouter.get('/ranking', async (_c) => {
  const ranking = await simbiRepo.getRanking();
  return _c.json({ ranking });
});
