import { Hono } from 'hono';
import { z } from 'zod';
import { authMiddleware } from '@/middleware/auth';
import { getRequestUser, ApiError } from '@/lib/auth-helpers';
import { ValidatorRepository } from '@/repositories/validator-repository';
import { analyzeProjectPlan } from '@/services/validator-service';
import { db } from '@/lib/db';

export const validatorRouter = new Hono();
const validatorRepo = new ValidatorRepository(db);

validatorRouter.use('*', authMiddleware);

// Serializa un plan al formato que espera el frontend
function serialize(plan: Awaited<ReturnType<ValidatorRepository['getByIdForUser']>>) {
  if (!plan) return null;
  return {
    id:           plan.id,
    name:         plan.name,
    type:         plan.type,
    description:  plan.description,
    budget:       plan.budget,
    duration:     plan.duration,
    carbonGoal:   plan.carbonGoal,
    objectives:   plan.objectives,
    stakeholders: plan.stakeholders,
    documents:    plan.documents,
    status:       plan.status,
    report:       plan.report,
    analyzedAt:   plan.analyzedAt?.toISOString() ?? null,
    createdAt:    plan.createdAt.toISOString(),
  };
}

// ── GET /api/validator/plans ─────────────────────────────────────────────────
validatorRouter.get('/plans', async (c) => {
  const user = getRequestUser(c);
  const plans = await validatorRepo.listByUser(user.sub);
  return c.json({ plans: plans.map(serialize) });
});

// ── GET /api/validator/plans/:id ─────────────────────────────────────────────
validatorRouter.get('/plans/:id', async (c) => {
  const user = getRequestUser(c);
  const { id } = c.req.param();
  const plan = await validatorRepo.getByIdForUser(id, user.sub);
  if (!plan) throw new ApiError(404, 'Proyecto no encontrado');
  return c.json({ plan: serialize(plan) });
});

// ── POST /api/validator/plans ────────────────────────────────────────────────
const createSchema = z.object({
  name:         z.string().min(1, 'El nombre es obligatorio'),
  type:         z.string().min(1, 'El tipo es obligatorio'),
  description:  z.string().min(1, 'La descripción es obligatoria'),
  budget:       z.number().int().min(0),
  duration:     z.number().int().min(0),
  carbonGoal:   z.number().int().min(0),
  objectives:   z.string().optional().nullable(),
  stakeholders: z.string().optional().nullable(),
  documents: z.array(z.object({
    name: z.string(),
    size: z.number(),
    type: z.string(),
  })).optional(),
});

validatorRouter.post('/plans', async (c) => {
  const user = getRequestUser(c);
  const body = await c.req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) throw new ApiError(400, parsed.error.errors[0]?.message ?? 'Datos inválidos');

  const plan = await validatorRepo.create({
    userId:       user.sub,
    name:         parsed.data.name,
    type:         parsed.data.type,
    description:  parsed.data.description,
    budget:       parsed.data.budget,
    duration:     parsed.data.duration,
    carbonGoal:   parsed.data.carbonGoal,
    objectives:   parsed.data.objectives ?? null,
    stakeholders: parsed.data.stakeholders ?? null,
    documents:    parsed.data.documents ?? [],
  });

  return c.json({ plan: serialize(plan) }, 201);
});

// ── POST /api/validator/plans/:id/analyze ────────────────────────────────────
// Ejecuta el análisis (IA o heurístico) y guarda el reporte.
validatorRouter.post('/plans/:id/analyze', async (c) => {
  const user = getRequestUser(c);
  const { id } = c.req.param();

  const plan = await validatorRepo.getByIdForUser(id, user.sub);
  if (!plan) throw new ApiError(404, 'Proyecto no encontrado');

  await validatorRepo.setStatus(id, 'analyzing');
  try {
    const report = await analyzeProjectPlan(plan);
    const updated = await validatorRepo.saveReport(id, report);
    return c.json({ plan: serialize(updated) });
  } catch (err) {
    await validatorRepo.setStatus(id, 'failed');
    console.error('[validator] análisis falló:', err);
    throw new ApiError(500, 'No se pudo generar el análisis');
  }
});

// ── DELETE /api/validator/plans/:id ──────────────────────────────────────────
validatorRouter.delete('/plans/:id', async (c) => {
  const user = getRequestUser(c);
  const { id } = c.req.param();
  const plan = await validatorRepo.getByIdForUser(id, user.sub);
  if (!plan) throw new ApiError(404, 'Proyecto no encontrado');
  await validatorRepo.delete(id);
  return c.json({ success: true });
});
