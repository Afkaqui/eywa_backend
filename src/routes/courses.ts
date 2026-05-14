import { Hono } from 'hono';
import { z } from 'zod';
import { authMiddleware } from '@/middleware/auth';
import { getRequestUser, assertRole, ApiError } from '@/lib/auth-helpers';
import { CourseRepository } from '@/repositories/course-repository';
import { db } from '@/lib/db';

export const coursesRouter = new Hono();
const courseRepo = new CourseRepository(db);

coursesRouter.use('*', authMiddleware);

// ── GET /api/courses ──────────────────────────────────────────────────────────
// Gestores ven todos; usuarios solo publicados
coursesRouter.get('/', async (c) => {
  const user = getRequestUser(c);
  const isManager = ['gestor', 'admin', 'superadmin'].includes(user.role);
  const courses = isManager
    ? await courseRepo.getAll()
    : await courseRepo.getPublished();
  return c.json({ courses });
});

// ── GET /api/courses/enrollments/me ──────────────────────────────────────────
coursesRouter.get('/enrollments/me', async (c) => {
  const user = getRequestUser(c);
  const enrollments = await courseRepo.getUserEnrollments(user.sub);
  return c.json({ enrollments });
});

// ── POST /api/courses/:id/enroll ──────────────────────────────────────────────
coursesRouter.post('/:id/enroll', async (c) => {
  const user = getRequestUser(c);
  const { id: courseId } = c.req.param();

  const enrollment = await courseRepo.enroll(user.sub, courseId);
  return c.json({ enrollment }, 201);
});

// ── PATCH /api/courses/enrollments/:id ────────────────────────────────────────
const progressSchema = z.object({
  progress:  z.number().int().min(0).max(100),
  completed: z.boolean(),
});

coursesRouter.patch('/enrollments/:id', async (c) => {
  const user = getRequestUser(c);
  const { id: enrollmentId } = c.req.param();
  const body = await c.req.json();
  const parsed = progressSchema.safeParse(body);
  if (!parsed.success) throw new ApiError(400, 'Datos inválidos');

  await courseRepo.updateProgress(enrollmentId, parsed.data.progress, parsed.data.completed);
  return c.json({ success: true });
});

// ── POST /api/courses  (gestor+) ──────────────────────────────────────────────
const courseSchema = z.object({
  title:         z.string().min(1),
  description:   z.string().min(1),
  category:      z.enum(['agrotech', 'edutech', 'banca_sostenible', 'esg', 'general']),
  level:         z.enum(['basico', 'intermedio', 'avanzado']),
  duration_hours: z.number().int().min(1),
  image_url:     z.string().optional().nullable(),
  instructor:    z.string().optional(),
  lessons_count: z.number().int().min(1).optional(),
  is_published:  z.boolean().optional(),
});

coursesRouter.post('/', async (c) => {
  const user = getRequestUser(c);
  assertRole(user, ['gestor', 'admin', 'superadmin']);

  const body = await c.req.json();
  const parsed = courseSchema.safeParse(body);
  if (!parsed.success) throw new ApiError(400, parsed.error.errors[0]?.message ?? 'Datos inválidos');

  const course = await courseRepo.create({
    ...parsed.data,
    durationHours: parsed.data.duration_hours,
    imageUrl:      parsed.data.image_url ?? null,
    instructor:    parsed.data.instructor ?? 'EYWA Academy',
    lessonsCount:  parsed.data.lessons_count ?? 1,
    isPublished:   parsed.data.is_published ?? false,
    createdBy:     user.sub,
  });

  return c.json({ course }, 201);
});
