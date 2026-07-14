import { Hono } from 'hono';
import { randomUUID } from 'crypto';
import { mkdir, writeFile, readFile, unlink } from 'fs/promises';
import path from 'path';
import { authMiddleware } from '@/middleware/auth';
import { getRequestUser, ApiError } from '@/lib/auth-helpers';
import { DataroomRepository } from '@/repositories/dataroom-repository';
import { db } from '@/lib/db';

export const dataroomRouter = new Hono();
const repo = new DataroomRepository(db);

// ══ RUTAS PÚBLICAS (sin sesión) ══════════════════════════════════════════════
// Registradas ANTES del authMiddleware a propósito. Solo exponen lo que el dueño
// marcó explícitamente como público. Nunca los documentos privados.

// Descarga de un documento PÚBLICO (la ruta específica va antes que /public/:slug)
dataroomRouter.get('/public/documents/:id/download', async (c) => {
  const doc = await repo.getDocument(c.req.param('id'));
  if (!doc || !doc.isPublic) throw new ApiError(404, 'Documento no disponible');

  const org = await repo.getOrganizationById(doc.organizationId);
  if (!org?.publicEnabled) throw new ApiError(404, 'Documento no disponible');

  let data: Buffer;
  try { data = await readFile(doc.storagePath); }
  catch { throw new ApiError(404, 'El archivo ya no está disponible'); }

  c.header('Content-Type', doc.mime);
  c.header('Content-Disposition', `attachment; filename="${encodeURIComponent(doc.fileName)}"`);
  return c.body(new Uint8Array(data));
});

// Datos de la mini-landing de una empresa
dataroomRouter.get('/public/:slug', async (c) => {
  const org = await repo.findBySlug(c.req.param('slug'));
  if (!org || !org.publicEnabled) throw new ApiError(404, 'Empresa no encontrada');

  const [docs, completeness] = await Promise.all([
    repo.getPublicDocumentsOf(org.id),
    repo.completenessOf(org.id),
  ]);

  return c.json({
    organization: {
      name:          org.name,
      type:          org.type,
      description:   org.description,
      sector:        org.sector,
      country:       org.country,
      website:       org.website,
      externalLinks: org.externalLinks,
    },
    completeness, // sello de confianza (no revela QUÉ documentos faltan)
    documents: docs.map(d => ({
      id:         d.id,
      file_name:  d.fileName,
      mime:       d.mime,
      size:       d.size,
      folder:     d.item.folder.name,
      item:       d.item.name,
      created_at: d.createdAt.toISOString(),
    })),
  });
});

// ══ De aquí en adelante, todo exige sesión ═══════════════════════════════════
dataroomRouter.use('*', authMiddleware);

// Disco del VPS (volumen montado; ver docker-compose). Fuera del contenedor sobrevive
// a los redeploys, que recrean el contenedor.
const UPLOAD_DIR = process.env.UPLOAD_DIR ?? '/app/uploads';
const MAX_SIZE   = 20 * 1024 * 1024; // 20 MB
const ALLOWED_MIME = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'image/png', 'image/jpeg', 'image/webp',
  'text/plain', 'text/csv',
];

// Sanea el nombre para que nunca escape del directorio (path traversal)
function safeName(name: string) {
  return path.basename(name).replace(/[^\w.\-() ]+/g, '_').slice(0, 120) || 'archivo';
}

function serializeDoc(d: {
  id: string; itemId: string; fileName: string; mime: string; size: number;
  isPublic: boolean; createdAt: Date;
}) {
  return {
    id:         d.id,
    item_id:    d.itemId,
    file_name:  d.fileName,
    mime:       d.mime,
    size:       d.size,
    is_public:  d.isPublic,
    created_at: d.createdAt.toISOString(),
  };
}

// Resuelve la organización sobre la que se opera y valida permisos de lectura.
// Dueño siempre; superadmin ve todo. (Gestor con permiso delegado: PENDIENTE.)
async function resolveOrg(userId: string, role: string) {
  const org = await repo.getOrganizationOf(userId);
  return { org, isSuperadmin: role === 'superadmin' };
}

// ── GET /api/dataroom ─────────────────────────────────────────────────────────
// Plantilla + documentos de mi organización + % de completitud.
dataroomRouter.get('/', async (c) => {
  const user = getRequestUser(c);
  const org = await repo.getOrganizationOf(user.sub);

  const folders = await repo.getTemplate();
  const docs = org ? await repo.getDocumentsOf(org.id) : [];
  const byItem = new Map<string, typeof docs>();
  for (const d of docs) {
    const list = byItem.get(d.itemId) ?? [];
    list.push(d);
    byItem.set(d.itemId, list);
  }

  let totalItems = 0;
  let completedItems = 0;

  const payload = folders.map(f => {
    const items = f.items.map(i => {
      const itemDocs = byItem.get(i.id) ?? [];
      totalItems++;
      if (itemDocs.length > 0) completedItems++;
      return {
        id:        i.id,
        name:      i.name,
        hint:      i.hint,
        completed: itemDocs.length > 0,
        documents: itemDocs.map(serializeDoc),
      };
    });
    const done = items.filter(i => i.completed).length;
    return {
      id:          f.id,
      key:         f.key,
      name:        f.name,
      description: f.description,
      items,
      completed_items: done,
      total_items:     items.length,
      percentage:      items.length ? Math.round((done / items.length) * 100) : 0,
    };
  });

  return c.json({
    has_organization: Boolean(org),
    organization: org ? { id: org.id, name: org.name } : null,
    folders: payload,
    completeness: {
      completed_items: completedItems,
      total_items:     totalItems,
      percentage:      totalItems ? Math.round((completedItems / totalItems) * 100) : 0,
    },
  });
});

// ── POST /api/dataroom/items/:itemId/documents ────────────────────────────────
// Sube un archivo al disco del VPS y lo asocia al documento requerido.
dataroomRouter.post('/items/:itemId/documents', async (c) => {
  const user = getRequestUser(c);
  const org = await repo.getOrganizationOf(user.sub);
  if (!org) throw new ApiError(400, 'Primero crea el perfil de tu organización');

  const item = await repo.getItem(c.req.param('itemId'));
  if (!item) throw new ApiError(404, 'Documento requerido no encontrado');

  const body = await c.req.parseBody();
  const file = body['file'];
  if (!(file instanceof File)) throw new ApiError(400, 'No se recibió ningún archivo');
  if (file.size === 0)       throw new ApiError(400, 'El archivo está vacío');
  if (file.size > MAX_SIZE)  throw new ApiError(400, 'El archivo supera el límite de 20 MB');
  if (!ALLOWED_MIME.includes(file.type)) {
    throw new ApiError(400, `Tipo de archivo no permitido (${file.type || 'desconocido'})`);
  }

  const dir = path.join(UPLOAD_DIR, 'dataroom', org.id);
  await mkdir(dir, { recursive: true });

  const stored = `${randomUUID()}-${safeName(file.name)}`;
  const full   = path.join(dir, stored);
  await writeFile(full, Buffer.from(await file.arrayBuffer()));

  const doc = await repo.createDocument({
    organizationId: org.id,
    itemId:         item.id,
    fileName:       file.name,
    storagePath:    full,
    mime:           file.type,
    size:           file.size,
    uploadedBy:     user.sub,
  });

  return c.json({ document: serializeDoc(doc) }, 201);
});

// ── GET /api/dataroom/documents/:id/download ──────────────────────────────────
dataroomRouter.get('/documents/:id/download', async (c) => {
  const user = getRequestUser(c);
  const doc = await repo.getDocument(c.req.param('id'));
  if (!doc) throw new ApiError(404, 'Documento no encontrado');

  const { org, isSuperadmin } = await resolveOrg(user.sub, user.role);
  const isOwner = org?.id === doc.organizationId;
  if (!isOwner && !isSuperadmin) throw new ApiError(403, 'Sin acceso a este documento');

  let data: Buffer;
  try {
    data = await readFile(doc.storagePath);
  } catch {
    throw new ApiError(404, 'El archivo ya no está disponible');
  }

  c.header('Content-Type', doc.mime);
  c.header('Content-Disposition', `attachment; filename="${encodeURIComponent(doc.fileName)}"`);
  return c.body(new Uint8Array(data));
});

// ── DELETE /api/dataroom/documents/:id ────────────────────────────────────────
dataroomRouter.delete('/documents/:id', async (c) => {
  const user = getRequestUser(c);
  const doc = await repo.getDocument(c.req.param('id'));
  if (!doc) throw new ApiError(404, 'Documento no encontrado');

  const org = await repo.getOrganizationOf(user.sub);
  if (org?.id !== doc.organizationId) throw new ApiError(403, 'Solo el dueño puede borrar');

  await unlink(doc.storagePath).catch(() => { /* el archivo ya no está; borra la fila igual */ });
  await repo.deleteDocument(doc.id);
  return c.json({ success: true });
});

// ── PATCH /api/dataroom/documents/:id ─────────────────────────────────────────
// Publicar/despublicar en la mini-landing. Todo documento NACE PRIVADO.
dataroomRouter.patch('/documents/:id', async (c) => {
  const user = getRequestUser(c);
  const doc = await repo.getDocument(c.req.param('id'));
  if (!doc) throw new ApiError(404, 'Documento no encontrado');

  const org = await repo.getOrganizationOf(user.sub);
  if (org?.id !== doc.organizationId) throw new ApiError(403, 'Solo el dueño puede publicar');

  const body = await c.req.json().catch(() => ({}));
  const isPublic = Boolean(body?.is_public);
  const updated = await repo.setPublic(doc.id, isPublic);
  return c.json({ document: serializeDoc(updated) });
});

// ── GET/PATCH /api/dataroom/landing ───────────────────────────────────────────
// Estado y activación de la mini-landing pública de mi empresa.
function slugify(name: string) {
  return name
    .normalize('NFD').replace(/[̀-ͯ]/g, '') // quita tildes
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'empresa';
}

dataroomRouter.get('/landing', async (c) => {
  const user = getRequestUser(c);
  const org = await repo.getOrganizationOf(user.sub);
  if (!org) throw new ApiError(400, 'Primero crea el perfil de tu organización');
  return c.json({ enabled: org.publicEnabled, slug: org.publicSlug });
});

dataroomRouter.patch('/landing', async (c) => {
  const user = getRequestUser(c);
  const org = await repo.getOrganizationOf(user.sub);
  if (!org) throw new ApiError(400, 'Primero crea el perfil de tu organización');

  const body = await c.req.json().catch(() => ({}));
  const enabled = Boolean(body?.enabled);

  // Genera el slug la primera vez que se publica (y lo conserva después)
  let slug = org.publicSlug;
  if (enabled && !slug) {
    const base = slugify(org.name);
    slug = base;
    let n = 1;
    while (await repo.slugTaken(slug)) slug = `${base}-${++n}`;
  }

  const updated = await repo.setLanding(org.id, { publicEnabled: enabled, ...(slug ? { publicSlug: slug } : {}) });
  return c.json({ enabled: updated.publicEnabled, slug: updated.publicSlug });
});
