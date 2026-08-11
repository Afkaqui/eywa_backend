import { Hono } from 'hono';
import { z } from 'zod';
import { authMiddleware } from '@/middleware/auth';
import { getRequestUser, assertRole, ApiError } from '@/lib/auth-helpers';
import { DiagnosticRepository } from '@/repositories/diagnostic-repository';
import { db } from '@/lib/db';

export const diagnosticRouter = new Hono();
const diagnosticRepo = new DiagnosticRepository(db);

diagnosticRouter.use('*', authMiddleware);

// ── GET /api/diagnostic/questions ────────────────────────────────────────────
diagnosticRouter.get('/questions', async (_c) => {
  const questions = await diagnosticRepo.getQuestions();
  return _c.json({ questions });
});

// ── GET /api/diagnostic/results/me ───────────────────────────────────────────
// ?orgId= devuelve el diagnóstico de ESA empresa. Sin él, el de la predeterminada.
diagnosticRouter.get('/results/me', async (c) => {
  const user = getRequestUser(c);
  const orgId = c.req.query('orgId');

  if (orgId) {
    // Verificar propiedad: no se puede leer el diagnóstico de una empresa ajena.
    const propia = await db.organization.findFirst({
      where: { id: orgId, userId: user.sub }, select: { id: true },
    });
    if (!propia) throw new ApiError(404, 'Organización no encontrada');
    const result = await db.diagnosticResult.findFirst({
      where: { organizationId: orgId }, orderBy: { createdAt: 'desc' },
    });
    return c.json({ result });
  }

  const result = await diagnosticRepo.getLatestResult(user.sub);
  return c.json({ result });
});

// ── GET /api/diagnostic/results/history ──────────────────────────────────────
// Serie histórica del índice ESG del usuario. Sustituye al viejo esg_history
// (panel manual, deprecado): aquí el historial es REAL, sale de cada diagnóstico.
diagnosticRouter.get('/results/history', async (c) => {
  const user = getRequestUser(c);
  const orgIdHist = c.req.query('orgId');
  const results = await db.diagnosticResult.findMany({
    where:   orgIdHist
      ? { organizationId: orgIdHist, user: { id: user.sub } }
      : { userId: user.sub },
    orderBy: { createdAt: 'asc' },
    take:    50,
    select:  { id: true, score: true, maxScore: true, percentage: true, level: true, createdAt: true },
  });

  return c.json({
    history: results.map((r) => ({
      id:         r.id,
      score:      r.score,
      max_score:  r.maxScore,
      percentage: r.percentage,
      level:      r.level,
      created_at: r.createdAt.toISOString(),
    })),
  });
});

// ── POST /api/diagnostic/results ─────────────────────────────────────────────
const resultSchema = z.object({
  // Empresa a la que corresponde el diagnóstico. Opcional por compatibilidad,
  // pero el backend verifica que sea del usuario antes de guardarla.
  organization_id: z.string().uuid().optional().nullable(),
  score:      z.number().int().min(0),
  max_score:  z.number().int().min(0),
  percentage: z.number().int().min(0).max(100),
  level:      z.string(),
  breakdown:  z.array(z.object({
    label:    z.string(),
    score:    z.number(),
    maxScore: z.number(),
    category: z.string().optional(),
  })),
});

diagnosticRouter.post('/results', async (c) => {
  const user = getRequestUser(c);
  const body = await c.req.json();
  const parsed = resultSchema.safeParse(body);
  if (!parsed.success) throw new ApiError(400, parsed.error.errors[0]?.message ?? 'Datos inválidos');

  // Resolver la organización: la enviada (verificando que sea del usuario) o,
  // si no viene, la predeterminada. Verificar la propiedad importa: sin esto se
  // podría colgar un diagnóstico de la empresa de otra cuenta.
  let organizationId: string | null = null;
  if (parsed.data.organization_id) {
    const propia = await db.organization.findFirst({
      where:  { id: parsed.data.organization_id, userId: user.sub },
      select: { id: true },
    });
    if (!propia) throw new ApiError(404, 'Organización no encontrada');
    organizationId = propia.id;
  } else {
    const pred = await db.organization.findFirst({
      where: { userId: user.sub }, orderBy: { createdAt: 'asc' }, select: { id: true },
    });
    organizationId = pred?.id ?? null;
  }

  await diagnosticRepo.saveResult({
    userId:     user.sub,
    organizationId,
    score:      parsed.data.score,
    maxScore:   parsed.data.max_score,
    percentage: parsed.data.percentage,
    level:      parsed.data.level,
    breakdown:  parsed.data.breakdown,
  });

  return c.json({ success: true }, 201);
});

// ── POST /api/diagnostic/questions  (gestor+) ────────────────────────────────
const questionSchema = z.object({
  title:              z.string().min(1),
  description:        z.string().min(1),
  sort_order:         z.number().int().optional(),
  context_title:      z.string().optional().nullable(),
  context_description: z.string().optional().nullable(),
  context_impact:     z.string().optional().nullable(),
  context_image:      z.string().optional().nullable(),
  options: z.array(z.object({
    label:      z.string(),
    value:      z.string(),
    score:      z.number().int(),
    sort_order: z.number().int().optional(),
  })),
});

diagnosticRouter.post('/questions', async (c) => {
  const user = getRequestUser(c);
  assertRole(user, ['gestor', 'admin', 'superadmin']);

  const body = await c.req.json();
  const parsed = questionSchema.safeParse(body);
  if (!parsed.success) throw new ApiError(400, parsed.error.errors[0]?.message ?? 'Datos inválidos');

  const question = await diagnosticRepo.createQuestion({
    sortOrder:          parsed.data.sort_order ?? 0,
    title:              parsed.data.title,
    description:        parsed.data.description,
    contextTitle:       parsed.data.context_title ?? null,
    contextDescription: parsed.data.context_description ?? null,
    contextImpact:      parsed.data.context_impact ?? null,
    contextImage:       parsed.data.context_image ?? null,
    createdBy:          user.sub,
    options:            parsed.data.options,
  });

  return c.json({ question }, 201);
});

// ── DELETE /api/diagnostic/questions/:id  (gestor+) ──────────────────────────
diagnosticRouter.delete('/questions/:id', async (c) => {
  const user = getRequestUser(c);
  assertRole(user, ['gestor', 'admin', 'superadmin']);

  const { id } = c.req.param();
  await diagnosticRepo.deleteQuestion(id);
  return c.json({ success: true });
});
