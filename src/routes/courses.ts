import { Hono } from 'hono';
import { z } from 'zod';
import { authMiddleware } from '@/middleware/auth';
import { getRequestUser, assertRole, ApiError } from '@/lib/auth-helpers';
import { CourseRepository } from '@/repositories/course-repository';
import { AcademyRepository } from '@/repositories/academy-repository';
import { serializeCourse, serializeEnrollment, serializeSection } from '@/lib/serializers';
import { db } from '@/lib/db';

export const coursesRouter = new Hono();
const courseRepo  = new CourseRepository(db);
const academyRepo = new AcademyRepository(db);

coursesRouter.use('*', authMiddleware);

// ── GET /api/courses ──────────────────────────────────────────────────────────
// Gestores ven todos; usuarios solo publicados
coursesRouter.get('/', async (c) => {
  const user = getRequestUser(c);
  const isManager = ['gestor', 'admin', 'superadmin'].includes(user.role);
  const courses = isManager
    ? await courseRepo.getAll()
    : await courseRepo.getPublished();
  return c.json({ courses: courses.map(serializeCourse) });
});

// ── GET /api/courses/enrollments/me ──────────────────────────────────────────
coursesRouter.get('/enrollments/me', async (c) => {
  const user = getRequestUser(c);
  const enrollments = await courseRepo.getUserEnrollments(user.sub);
  return c.json({ enrollments: enrollments.map(serializeEnrollment) });
});

// ── PATCH /api/courses/enrollments/:id ────────────────────────────────────────
const progressSchema = z.object({
  progress:  z.number().int().min(0).max(100),
  completed: z.boolean(),
});

coursesRouter.patch('/enrollments/:id', async (c) => {
  const { id: enrollmentId } = c.req.param();
  const body = await c.req.json();
  const parsed = progressSchema.safeParse(body);
  if (!parsed.success) throw new ApiError(400, 'Datos inválidos');

  await courseRepo.updateProgress(enrollmentId, parsed.data.progress, parsed.data.completed);
  return c.json({ success: true });
});

// ── POST /api/courses/sections/:sectionId/complete ────────────────────────────
// Marca una sección como vista/completada (auto-inscribe si hace falta)
coursesRouter.post('/sections/:sectionId/complete', async (c) => {
  const user = getRequestUser(c);
  const { sectionId } = c.req.param();

  const result = await academyRepo.completeSection(user.sub, sectionId);
  if (!result) throw new ApiError(404, 'Sección no encontrada');

  return c.json({
    course_id:          result.courseId,
    completed_sections: result.completedSections,
    total_sections:     result.totalSections,
    progress:           result.progress,
  });
});

// ── GET /api/courses/:id/sections ─────────────────────────────────────────────
// Secciones + recursos + progreso del usuario + estado del examen (una sola llamada)
coursesRouter.get('/:id/sections', async (c) => {
  const user = getRequestUser(c);
  const { id: courseId } = c.req.param();

  const course = await db.course.findUnique({ where: { id: courseId } });
  if (!course) throw new ApiError(404, 'Curso no encontrado');

  const [sections, completedIds, questionsCount, lastAttempt, certificate] = await Promise.all([
    academyRepo.getSections(courseId),
    academyRepo.getCompletedSectionIds(user.sub, courseId),
    db.examQuestion.count({ where: { courseId } }),
    academyRepo.getLastAttempt(user.sub, courseId),
    academyRepo.getCertificate(user.sub, courseId),
  ]);

  const completedSet = new Set(completedIds);
  const total = sections.length;
  const done  = sections.filter(s => completedSet.has(s.id)).length;
  const allDone = total > 0 && done === total;

  return c.json({
    sections: sections.map(s => serializeSection(s, completedSet)),
    progress: {
      completed_sections: done,
      total_sections:     total,
      percentage:         total > 0 ? Math.round((done / total) * 100) : 0,
    },
    exam: {
      questions_count: questionsCount,
      pass_threshold:  course.passThreshold,
      unlocked:        allDone && questionsCount > 0,   // solo con TODO el contenido completado
      passed:          Boolean(certificate),
      last_attempt: lastAttempt ? {
        percentage: lastAttempt.percentage,
        passed:     lastAttempt.passed,
        created_at: lastAttempt.createdAt.toISOString(),
      } : null,
      certificate: certificate ? {
        code:       certificate.code,
        percentage: certificate.percentage,
        issued_at:  certificate.issuedAt.toISOString(),
      } : null,
    },
  });
});

// Valida en servidor que el usuario pueda rendir el examen
async function assertExamUnlocked(userId: string, courseId: string) {
  const course = await db.course.findUnique({ where: { id: courseId } });
  if (!course) throw new ApiError(404, 'Curso no encontrado');

  const [total, completedIds, questionsCount] = await Promise.all([
    academyRepo.countSections(courseId),
    academyRepo.getCompletedSectionIds(userId, courseId),
    db.examQuestion.count({ where: { courseId } }),
  ]);
  if (questionsCount === 0) throw new ApiError(400, 'Este curso no tiene examen configurado');
  if (total === 0 || completedIds.length < total) {
    throw new ApiError(403, 'Debes completar todo el contenido del curso antes de rendir el examen');
  }
  return course;
}

// ── GET /api/courses/:id/exam ─────────────────────────────────────────────────
// Preguntas SIN respuestas correctas. Bloqueado hasta completar el contenido.
coursesRouter.get('/:id/exam', async (c) => {
  const user = getRequestUser(c);
  const { id: courseId } = c.req.param();

  const course = await assertExamUnlocked(user.sub, courseId);
  const questions = await academyRepo.getExamQuestionsPublic(courseId);

  return c.json({
    course_title:   course.title,
    pass_threshold: course.passThreshold,
    questions: questions.map(q => ({
      id:       q.id,
      question: q.question,
      options:  q.options,
    })),
  });
});

// ── POST /api/courses/:id/exam/submit ─────────────────────────────────────────
// Corrige en SERVIDOR. Si supera el umbral, emite certificado.
const submitSchema = z.object({
  answers: z.record(z.string(), z.number().int().min(0)),
});

coursesRouter.post('/:id/exam/submit', async (c) => {
  const user = getRequestUser(c);
  const { id: courseId } = c.req.param();

  const course = await assertExamUnlocked(user.sub, courseId);

  const body = await c.req.json();
  const parsed = submitSchema.safeParse(body);
  if (!parsed.success) throw new ApiError(400, 'Respuestas inválidas');
  const answers = parsed.data.answers;

  const questions = await academyRepo.getExamQuestionsFull(courseId);
  let score = 0;
  for (const q of questions) {
    if (answers[q.id] === q.correctIndex) score++;
  }
  const total = questions.length;
  const percentage = total > 0 ? Math.round((score / total) * 100) : 0;
  const passed = percentage >= course.passThreshold;

  await academyRepo.recordAttempt({
    userId: user.sub, courseId, score, total, percentage, passed, answers,
  });

  let certificate = null;
  if (passed) {
    const cert = await academyRepo.issueCertificate(user.sub, courseId, percentage);
    certificate = {
      code:       cert.code,
      percentage: cert.percentage,
      issued_at:  cert.issuedAt.toISOString(),
    };
  }

  return c.json({
    score,
    total,
    percentage,
    passed,
    pass_threshold: course.passThreshold,
    certificate,
  });
});

// ── POST /api/courses/:id/enroll ──────────────────────────────────────────────
coursesRouter.post('/:id/enroll', async (c) => {
  const user = getRequestUser(c);
  const { id: courseId } = c.req.param();

  const enrollment = await courseRepo.enroll(user.sub, courseId);
  return c.json({ enrollment: serializeEnrollment(enrollment) }, 201);
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
    title:         parsed.data.title,
    description:   parsed.data.description,
    category:      parsed.data.category,
    level:         parsed.data.level,
    durationHours: parsed.data.duration_hours,
    imageUrl:      parsed.data.image_url ?? null,
    instructor:    parsed.data.instructor ?? 'EYWA Academy',
    lessonsCount:  parsed.data.lessons_count ?? 1,
    isPublished:   parsed.data.is_published ?? false,
    createdBy:     user.sub,
  });

  return c.json({ course: serializeCourse(course) }, 201);
});
