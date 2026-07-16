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
diagnosticRouter.get('/results/me', async (c) => {
  const user = getRequestUser(c);
  const result = await diagnosticRepo.getLatestResult(user.sub);
  return c.json({ result });
});

// ── POST /api/diagnostic/results ─────────────────────────────────────────────
const resultSchema = z.object({
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

  await diagnosticRepo.saveResult({
    userId:     user.sub,
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
