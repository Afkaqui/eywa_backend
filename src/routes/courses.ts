import { Hono } from 'hono';
import { z } from 'zod';
import { authMiddleware } from '@/middleware/auth';
import { getRequestUser, assertRole, ApiError } from '@/lib/auth-helpers';
import { CourseRepository } from '@/repositories/course-repository';
import { AcademyRepository } from '@/repositories/academy-repository';
import { serializeCourse, serializeEnrollment, serializeSection } from '@/lib/serializers';
import { db } from '@/lib/db';
import { servirArchivo } from '@/lib/file-response';
import path from 'path';
import { mkdir, writeFile, unlink } from 'fs/promises';
import { randomUUID } from 'crypto';

export const coursesRouter = new Hono();
const courseRepo  = new CourseRepository(db);
const academyRepo = new AcademyRepository(db);

coursesRouter.use('*', authMiddleware);

// ── GET /api/courses/material/:archivo ───────────────────────────────────────
// Sirve el material de las secciones desde el disco del VPS.
//
// Hasta ahora los recursos eran enlaces externos (Drive), que daban 401 a quien
// no tuviera permiso en la carpeta ajena. Sirviéndolos desde aquí el acceso lo
// decide UNANCHA: authMiddleware ya exige sesión para llegar a esta ruta.
const NOMBRE_SEGURO = /^[A-Za-z0-9._-]+$/;

coursesRouter.get('/material/:archivo', async (c) => {
  const nombre = c.req.param('archivo');

  // Sin esto, un nombre como "../../.env" saldría del directorio de material.
  if (!NOMBRE_SEGURO.test(nombre) || nombre.includes('..')) {
    throw new ApiError(400, 'Nombre de archivo inválido');
  }

  const base = process.env.UPLOAD_DIR || '/app/uploads';
  const mimes: Record<string, string> = {
    '.pdf': 'application/pdf', '.mp4': 'video/mp4', '.m4a': 'audio/mp4',
    '.jpeg': 'image/jpeg', '.jpg': 'image/jpeg', '.png': 'image/png',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  };
  const ext = path.extname(nombre).toLowerCase();

  const res = await servirArchivo({
    ruta:      path.join(base, 'academia', nombre),
    nombre,
    rango:     c.req.header('range') ?? null,
    mime:      mimes[ext] ?? 'application/octet-stream',
    // Los PDF y los vídeos se abren en el navegador; el resto se descarga.
    descargar: !['.pdf', '.mp4', '.m4a', '.jpeg', '.jpg', '.png'].includes(ext),
  });
  if (!res) throw new ApiError(404, 'Material no encontrado');
  return res;
});

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

  // Tareas de cada sección + la entrega de ESTE usuario (si la hay).
  const tareas = await db.courseTask.findMany({
    where: { section: { courseId } }, orderBy: { sortOrder: 'asc' },
    include: { entregas: { where: { userId: user.sub } } },
  });
  const porSeccion = new Map<string, ReturnType<typeof serTarea>[]>();
  for (const t of tareas) {
    if (!porSeccion.has(t.sectionId)) porSeccion.set(t.sectionId, []);
    porSeccion.get(t.sectionId)!.push(serTarea(t, t.entregas[0] ?? null));
  }

  return c.json({
    sections: sections.map(s => ({ ...serializeSection(s, completedSet), tareas: porSeccion.get(s.id) ?? [] })),
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

// ══ Tareas y entregas ═══════════════════════════════════════════════════════
const STAFF = ['gestor', 'admin', 'superadmin'];
const UPLOAD_BASE = process.env.UPLOAD_DIR || '/app/uploads';
const MAX_ENTREGA = 10 * 1024 * 1024; // 10 MB
const MIME_ENTREGA = [
  'application/pdf', 'image/png', 'image/jpeg', 'image/webp', 'text/plain',
  'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
];

type TareaRow = { id: string; titulo: string; instrucciones: string; imagenUrl: string | null; permiteTexto: boolean; permiteArchivo: boolean };
type EntregaRow = { id: string; texto: string | null; archivoNombre: string | null; archivoSize: number | null; estado: string; comentario: string | null; revisadaAt: Date | null; updatedAt: Date };

function serEntrega(e: EntregaRow) {
  return {
    id: e.id, texto: e.texto, estado: e.estado, comentario: e.comentario,
    archivo: e.archivoNombre ? { nombre: e.archivoNombre, tamano: e.archivoSize, url: `/api/proxy/courses/entregas/${e.id}/archivo` } : null,
    revisada_at: e.revisadaAt?.toISOString() ?? null, enviada_at: e.updatedAt.toISOString(),
  };
}
function serTarea(t: TareaRow, e: EntregaRow | null) {
  return {
    id: t.id, titulo: t.titulo, instrucciones: t.instrucciones, imagen_url: t.imagenUrl,
    permite_texto: t.permiteTexto, permite_archivo: t.permiteArchivo,
    mi_entrega: e ? serEntrega(e) : null,
  };
}
const nombreSeguro = (n: string) => path.basename(n).replace(/[^\w.\-() ]+/g, '_').slice(0, 120) || 'archivo';

// ── POST /api/courses/tasks/:taskId/entrega  (multipart: texto?, file?) ─────
// Una entrega por persona y tarea; volver a enviar la reemplaza y la deja
// "enviada" otra vez (para que se revise de nuevo).
coursesRouter.post('/tasks/:taskId/entrega', async (c) => {
  const user = getRequestUser(c);
  const tarea = await db.courseTask.findUnique({ where: { id: c.req.param('taskId') }, include: { section: true } });
  if (!tarea) throw new ApiError(404, 'Tarea no encontrada');
  const inscrito = await db.courseEnrollment.findFirst({ where: { userId: user.sub, courseId: tarea.section.courseId } });
  if (!inscrito && !STAFF.includes(user.role)) throw new ApiError(403, 'Inscríbete en el curso para entregar la tarea');

  const body = await c.req.parseBody();
  const texto = typeof body['texto'] === 'string' ? body['texto'].trim().slice(0, 10000) : '';
  const file = body['file'] as { name: string; size: number; type: string; arrayBuffer: () => Promise<ArrayBuffer> } | undefined;
  const hayArchivo = !!file && typeof file !== 'string' && typeof file.arrayBuffer === 'function' && file.size > 0;
  const previa = await db.taskSubmission.findUnique({ where: { taskId_userId: { taskId: tarea.id, userId: user.sub } } });
  if (!texto && !hayArchivo && !previa?.archivoPath) throw new ApiError(400, 'Escribe tu respuesta o adjunta un archivo');
  if (texto && !tarea.permiteTexto) throw new ApiError(400, 'Esta tarea solo acepta archivos');
  if (hayArchivo && !tarea.permiteArchivo) throw new ApiError(400, 'Esta tarea solo acepta texto');

  let archivo: { archivoPath: string; archivoNombre: string; archivoMime: string; archivoSize: number } | null = null;
  if (hayArchivo) {
    if (file!.size > MAX_ENTREGA) throw new ApiError(400, 'El archivo supera los 10 MB');
    if (!MIME_ENTREGA.includes(file!.type)) throw new ApiError(400, 'Formato no permitido. Usa PDF, Word, Excel, PowerPoint, imagen o texto.');
    const dir = path.join(UPLOAD_BASE, 'academia-entregas', tarea.id);
    await mkdir(dir, { recursive: true });
    const destino = path.join(dir, `${user.sub}-${randomUUID().slice(0, 8)}-${nombreSeguro(file!.name)}`);
    await writeFile(destino, Buffer.from(await file!.arrayBuffer()));
    archivo = { archivoPath: destino, archivoNombre: nombreSeguro(file!.name), archivoMime: file!.type, archivoSize: file!.size };
    if (previa?.archivoPath) await unlink(previa.archivoPath).catch(() => {});
  }

  const datos = {
    texto: texto || null,
    ...(archivo ?? {}),
    estado: 'enviada', revisadaPor: null, revisadaAt: null,
  };
  const e = await db.taskSubmission.upsert({
    where:  { taskId_userId: { taskId: tarea.id, userId: user.sub } },
    create: { taskId: tarea.id, userId: user.sub, ...datos },
    update: datos,
  });
  return c.json({ entrega: serEntrega(e) }, previa ? 200 : 201);
});

// ── GET /api/courses/entregas/:id/archivo  (dueño de la entrega o staff) ────
coursesRouter.get('/entregas/:id/archivo', async (c) => {
  const user = getRequestUser(c);
  const e = await db.taskSubmission.findUnique({ where: { id: c.req.param('id') } });
  if (!e || !e.archivoPath) throw new ApiError(404, 'Archivo no encontrado');
  if (e.userId !== user.sub && !STAFF.includes(user.role)) throw new ApiError(403, 'No puedes ver esta entrega');
  const res = await servirArchivo({
    ruta: e.archivoPath, nombre: e.archivoNombre ?? 'entrega', rango: c.req.header('range') ?? null,
    mime: e.archivoMime ?? 'application/octet-stream',
    descargar: !['application/pdf', 'image/png', 'image/jpeg', 'image/webp', 'text/plain'].includes(e.archivoMime ?? ''),
  });
  if (!res) throw new ApiError(404, 'Archivo no encontrado');
  return res;
});

// ── GET /api/courses/:id/entregas  (staff: todas las entregas del curso) ────
coursesRouter.get('/:id/entregas', async (c) => {
  const user = getRequestUser(c);
  assertRole(user, ['gestor', 'admin', 'superadmin']);
  const l = await db.taskSubmission.findMany({
    where: { tarea: { section: { courseId: c.req.param('id') } } },
    orderBy: [{ estado: 'asc' }, { updatedAt: 'desc' }],
    include: {
      user: { select: { fullName: true, email: true, company: true } },
      tarea: { select: { titulo: true, section: { select: { title: true } } } },
    },
  });
  return c.json({ entregas: l.map((e) => ({
    ...serEntrega(e),
    alumno: { nombre: e.user.fullName, email: e.user.email, empresa: e.user.company },
    tarea: e.tarea.titulo, seccion: e.tarea.section.title, revisada_por: e.revisadaPor,
  })) });
});

// ── POST /api/courses/entregas/:id/revision  { estado, comentario } (staff) ──
const revisionSchema = z.object({
  estado: z.enum(['revisada', 'por_corregir']),
  comentario: z.string().trim().max(4000).nullish(),
});
coursesRouter.post('/entregas/:id/revision', async (c) => {
  const user = getRequestUser(c);
  assertRole(user, ['gestor', 'admin', 'superadmin']);
  const parsed = revisionSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) throw new ApiError(400, 'Revisión inválida');
  if (parsed.data.estado === 'por_corregir' && !parsed.data.comentario) {
    throw new ApiError(400, 'Escribe qué debe corregir');
  }
  const revisor = await db.profile.findUnique({ where: { id: user.sub }, select: { fullName: true, email: true } });
  try {
    const e = await db.taskSubmission.update({
      where: { id: c.req.param('id') },
      data: {
        estado: parsed.data.estado, comentario: parsed.data.comentario || null,
        revisadaPor: revisor?.fullName || revisor?.email || user.sub, revisadaAt: new Date(),
      },
    });
    return c.json({ entrega: serEntrega(e) });
  } catch {
    throw new ApiError(404, 'Entrega no encontrada');
  }
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
    instructor:    parsed.data.instructor ?? 'Academia UNANCHA',
    lessonsCount:  parsed.data.lessons_count ?? 1,
    isPublished:   parsed.data.is_published ?? false,
    createdBy:     user.sub,
  });

  return c.json({ course: serializeCourse(course) }, 201);
});
