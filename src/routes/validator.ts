import { Hono } from 'hono';
import { z } from 'zod';
import { randomUUID } from 'crypto';
import { mkdir, writeFile, readFile, unlink, rm } from 'fs/promises';
import path from 'path';
import { authMiddleware } from '@/middleware/auth';
import { getRequestUser, ApiError } from '@/lib/auth-helpers';
import { ValidatorRepository } from '@/repositories/validator-repository';
import { analyzeProjectPlan } from '@/services/validator-service';
import { db } from '@/lib/db';

export const validatorRouter = new Hono();
const validatorRepo = new ValidatorRepository(db);

validatorRouter.use('*', authMiddleware);

// ── Storage de documentos (mismo volumen del VPS que Dataroom/imágenes) ───────
const UPLOAD_DIR = process.env.UPLOAD_DIR ?? '/app/uploads';
const MAX_DOC_SIZE = 10 * 1024 * 1024; // 10 MB
const DOC_MIME = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'image/png', 'image/jpeg', 'image/webp',
  'text/plain', 'text/csv',
];
// Límite de documentos por plan según el plan de la cuenta (free=1, premium/staff=10)
const FREE_LIMIT = 1;
const PREMIUM_LIMIT = 10;

function safeName(name: string) {
  return path.basename(name).replace(/[^\w.\-() ]+/g, '_').slice(0, 120) || 'documento';
}

function serializeDoc(d: { id: string; fileName: string; mime: string; size: number; createdAt: Date }) {
  return {
    id:         d.id,
    name:       d.fileName,
    type:       d.mime,
    size:       d.size,
    created_at: d.createdAt.toISOString(),
  };
}

// Serializa un plan al formato que espera el frontend.
// `documents` sale de la tabla plan_documents (archivos reales); el Json legado
// de project_plans.documents (solo metadata, sin archivo) queda ignorado.
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
    documents:    (plan.planDocuments ?? []).map(serializeDoc),
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

// ── POST /api/validator/plans/:id/documents  (multipart, campo "file") ────────
validatorRouter.post('/plans/:id/documents', async (c) => {
  const user = getRequestUser(c);
  const { id } = c.req.param();
  const plan = await validatorRepo.getByIdForUser(id, user.sub);
  if (!plan) throw new ApiError(404, 'Proyecto no encontrado');

  // Límite por plan de la cuenta (verificado contra BD, no el JWT)
  const profile = await db.profile.findUnique({
    where: { id: user.sub }, select: { plan: true, role: true },
  });
  const staff = ['gestor', 'admin', 'superadmin'].includes(profile?.role ?? '');
  const limit = profile?.plan === 'premium' || staff ? PREMIUM_LIMIT : FREE_LIMIT;
  const current = await validatorRepo.countDocuments(id);
  if (current >= limit) {
    throw new ApiError(400, limit === FREE_LIMIT
      ? 'El Plan Gratuito permite 1 documento por proyecto. Actualiza a Premium para subir más.'
      : `Máximo ${PREMIUM_LIMIT} documentos por proyecto`);
  }

  const body = await c.req.parseBody();
  const file = body['file'] as { name: string; size: number; type: string; arrayBuffer: () => Promise<ArrayBuffer> } | undefined;
  if (!file || typeof file === 'string' || typeof file.arrayBuffer !== 'function') {
    throw new ApiError(400, 'Falta el archivo (campo "file")');
  }
  if (file.size > MAX_DOC_SIZE) throw new ApiError(400, 'El archivo supera el límite de 10 MB');
  if (!DOC_MIME.includes(file.type)) {
    throw new ApiError(400, 'Formato no permitido. Usa PDF, Word, Excel, imagen, TXT o CSV.');
  }

  const dir = path.join(UPLOAD_DIR, 'validator', plan.id);
  await mkdir(dir, { recursive: true });
  const stored = `${randomUUID()}-${safeName(file.name)}`;
  const full = path.join(dir, stored);
  await writeFile(full, Buffer.from(await file.arrayBuffer()));

  const doc = await validatorRepo.addDocument({
    planId:      plan.id,
    fileName:    safeName(file.name),
    mime:        file.type,
    size:        file.size,
    storagePath: full,
  });

  return c.json({ document: serializeDoc(doc) }, 201);
});

// ── GET /api/validator/plans/:id/documents/:docId/download ───────────────────
validatorRouter.get('/plans/:id/documents/:docId/download', async (c) => {
  const user = getRequestUser(c);
  const { id, docId } = c.req.param();
  const plan = await validatorRepo.getByIdForUser(id, user.sub);
  if (!plan) throw new ApiError(404, 'Proyecto no encontrado');

  const doc = await validatorRepo.getDocument(docId, plan.id);
  if (!doc) throw new ApiError(404, 'Documento no encontrado');

  let data: Buffer;
  try { data = await readFile(doc.storagePath); }
  catch { throw new ApiError(404, 'El archivo ya no está disponible'); }

  c.header('Content-Type', doc.mime);
  c.header('Content-Disposition', `attachment; filename="${encodeURIComponent(doc.fileName)}"`);
  return c.body(new Uint8Array(data));
});

// ── DELETE /api/validator/plans/:id/documents/:docId ─────────────────────────
validatorRouter.delete('/plans/:id/documents/:docId', async (c) => {
  const user = getRequestUser(c);
  const { id, docId } = c.req.param();
  const plan = await validatorRepo.getByIdForUser(id, user.sub);
  if (!plan) throw new ApiError(404, 'Proyecto no encontrado');

  const doc = await validatorRepo.getDocument(docId, plan.id);
  if (!doc) throw new ApiError(404, 'Documento no encontrado');

  await unlink(doc.storagePath).catch(() => {}); // el archivo puede ya no existir
  await validatorRepo.deleteDocument(docId);
  return c.json({ success: true });
});

// ── DELETE /api/validator/plans/:id ──────────────────────────────────────────
validatorRouter.delete('/plans/:id', async (c) => {
  const user = getRequestUser(c);
  const { id } = c.req.param();
  const plan = await validatorRepo.getByIdForUser(id, user.sub);
  if (!plan) throw new ApiError(404, 'Proyecto no encontrado');
  await validatorRepo.delete(id); // cascade borra las filas de plan_documents
  // Limpia los archivos del disco (la carpeta del plan completa)
  await rm(path.join(UPLOAD_DIR, 'validator', id), { recursive: true, force: true }).catch(() => {});
  return c.json({ success: true });
});
