import { Hono } from 'hono';
import { z } from 'zod';
import { randomUUID, randomBytes, createHash } from 'crypto';
import { mkdir, writeFile, readFile, unlink } from 'fs/promises';
import path from 'path';
import { authMiddleware } from '@/middleware/auth';
import { getRequestUser, assertRole, ApiError } from '@/lib/auth-helpers';
import { DataroomRepository } from '@/repositories/dataroom-repository';
import { sendMail, baseTemplate, appUrl, isMailConfigured } from '@/lib/mailer';
import { db } from '@/lib/db';

export const dataroomRouter = new Hono();
const repo = new DataroomRepository(db);

// El token de invitación viaja solo en el correo; en la BD va su SHA-256.
const sha256 = (v: string) => createHash('sha256').update(v).digest('hex');

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

  // Bitácora: descarga pública (sin sesión) desde la mini-landing
  await repo.logAccess({ documentId: doc.id, userId: null, action: 'download_public' });

  c.header('Content-Type', doc.mime);
  c.header('Content-Disposition', `attachment; filename="${encodeURIComponent(doc.fileName)}"`);
  return c.body(new Uint8Array(data));
});

// ── Acceso por INVITACIÓN (sin sesión, con token del correo) ─────────────────
// OJO: esto NO es la mini-landing. La landing muestra solo lo marcado como
// público; el invitado ve el dataroom COMPLETO en solo lectura. Por eso el token
// se valida en cada petición y toda descarga queda en la bitácora.

// Resuelve el token a una invitación válida. Un token inexistente, revocado o
// vencido da el MISMO error: no damos pistas sobre cuál de los tres fue.
async function resolveInvitation(token: string) {
  if (!token || token.length < 32) throw new ApiError(404, 'Invitación no válida o expirada');
  const inv = await repo.findInvitationByHash(sha256(token));
  if (!inv || inv.revokedAt || inv.expiresAt < new Date()) {
    throw new ApiError(404, 'Invitación no válida o expirada');
  }
  return inv;
}

// Dataroom completo en solo lectura, para el invitado
dataroomRouter.get('/invited/:token', async (c) => {
  const inv = await resolveInvitation(c.req.param('token'));
  const org = inv.organization;

  await repo.touchInvitation(inv.id); // deja constancia de que lo abrió

  const { folders, completeness } = await buildFolders(org);
  return c.json({
    organization: { id: org.id, name: org.name, sector: org.sector ?? null },
    invited_as:   { email: inv.email, name: inv.name },
    expires_at:   inv.expiresAt.toISOString(),
    read_only:    true,
    folders,
    completeness,
  });
});

// Descarga de un documento por parte del invitado (queda registrada a SU nombre)
dataroomRouter.get('/invited/:token/documents/:id/download', async (c) => {
  const inv = await resolveInvitation(c.req.param('token'));

  const doc = await repo.getDocument(c.req.param('id'));
  // El documento tiene que ser de LA organización que invitó: si no, un invitado
  // podría pedir el id de un documento de otra empresa con su token válido.
  if (!doc || doc.organizationId !== inv.organizationId) {
    throw new ApiError(404, 'Documento no encontrado');
  }

  let data: Buffer;
  try { data = await readFile(doc.storagePath); }
  catch { throw new ApiError(404, 'El archivo ya no está disponible'); }

  await repo.logAccess({
    documentId:   doc.id,
    userId:       null,
    invitationId: inv.id,
    action:       'download_invited',
  });

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
    repo.completenessOf(org.id, org.userId), // incluye ítems completos vía plataforma
  ]);

  return c.json({
    organization: {
      id:            org.id,
      name:          org.name,
      type:          org.type,
      description:   org.description,
      sector:        org.sector,
      country:       org.country,
      website:       org.website,
      externalLinks: org.externalLinks,
      has_logo:      !!org.imageUrl,
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

// Arma el árbol de carpetas/ítems/documentos con el % de completitud.
// Compartido por la vista del dueño, la delegada y la del invitado, para que las
// tres muestren EXACTAMENTE lo mismo y no se desincronicen.
async function buildFolders(org: { id: string; userId: string } | null) {
  const folders = await repo.getTemplate();
  const docs = org ? await repo.getDocumentsOf(org.id) : [];
  // Ítems ASG completos vía plataforma (diagnóstico GENES / certificados Academia)
  const platform = org ? await repo.platformCompletions(org.userId) : new Map<string, string>();
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
      const platformNote = platform.get(i.id) ?? null;
      const completed = itemDocs.length > 0 || Boolean(platformNote);
      totalItems++;
      if (completed) completedItems++;
      return {
        id:        i.id,
        name:      i.name,
        hint:      i.hint,
        completed,
        platform_complete: Boolean(platformNote),
        platform_note:     platformNote,
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

  return {
    folders: payload,
    completeness: {
      completed_items: completedItems,
      total_items:     totalItems,
      percentage:      totalItems ? Math.round((completedItems / totalItems) * 100) : 0,
    },
  };
}

// Resuelve la organización sobre la que se opera y valida permisos de lectura.
// Dueño siempre; superadmin ve todo; gestor solo las que le hayan delegado.
async function resolveOrg(userId: string, role: string) {
  const org = await repo.getOrganizationOf(userId);
  return { org, isSuperadmin: role === 'superadmin' };
}

// ¿Puede este usuario LEER (ver/descargar) el dataroom de esta organización?
async function canRead(userId: string, role: string, organizationId: string): Promise<boolean> {
  if (role === 'superadmin') return true;
  const own = await repo.getOrganizationOf(userId);
  if (own?.id === organizationId) return true;
  if (['gestor', 'admin'].includes(role)) return repo.hasGrant(organizationId, userId);
  return false;
}

// ── GET /api/dataroom ─────────────────────────────────────────────────────────
// Plantilla + documentos + % de completitud. Sin ?orgId= opera sobre MI organización;
// con ?orgId= permite a superadmin (todo) o gestor con permiso delegado (solo lectura).
dataroomRouter.get('/', async (c) => {
  const user = getRequestUser(c);
  const ownOrg = await repo.getOrganizationOf(user.sub);

  const requestedOrgId = c.req.query('orgId');
  let org = ownOrg;
  let readOnly = false;
  if (requestedOrgId && requestedOrgId !== ownOrg?.id) {
    if (!(await canRead(user.sub, user.role, requestedOrgId))) {
      throw new ApiError(403, 'Sin acceso a este dataroom');
    }
    org = await repo.getOrganizationById(requestedOrgId);
    if (!org) throw new ApiError(404, 'Organización no encontrada');
    readOnly = true; // vista delegada: solo ver y descargar
  }

  const { folders: payload, completeness } = await buildFolders(org);

  return c.json({
    has_organization: Boolean(org),
    organization: org ? { id: org.id, name: org.name } : null,
    read_only: readOnly,
    folders: payload,
    completeness,
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
// Dueño, superadmin, o gestor con permiso delegado sobre esa organización.
dataroomRouter.get('/documents/:id/download', async (c) => {
  const user = getRequestUser(c);
  const doc = await repo.getDocument(c.req.param('id'));
  if (!doc) throw new ApiError(404, 'Documento no encontrado');

  if (!(await canRead(user.sub, user.role, doc.organizationId))) {
    throw new ApiError(403, 'Sin acceso a este documento');
  }

  let data: Buffer;
  try {
    data = await readFile(doc.storagePath);
  } catch {
    throw new ApiError(404, 'El archivo ya no está disponible');
  }

  // Bitácora: quién descargó qué y cuándo
  await repo.logAccess({ documentId: doc.id, userId: user.sub, action: 'download' });

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

// ══ Permisos delegados a gestores (solo superadmin administra) ════════════════

// GET /api/dataroom/grants — lista de permisos + opciones para el selector
dataroomRouter.get('/grants', async (c) => {
  const user = getRequestUser(c);
  assertRole(user, ['superadmin']);

  const [grants, organizations, gestores] = await Promise.all([
    repo.listGrants(),
    db.organization.findMany({ select: { id: true, name: true }, orderBy: { name: 'asc' } }),
    db.profile.findMany({
      where:   { role: { in: ['gestor', 'admin'] } },
      select:  { id: true, email: true, fullName: true, role: true },
      orderBy: { email: 'asc' },
    }),
  ]);

  return c.json({
    grants: grants.map(g => ({
      id:           g.id,
      organization: g.organization,
      gestor:       { id: g.gestor.id, email: g.gestor.email, name: g.gestor.fullName },
      created_at:   g.createdAt.toISOString(),
    })),
    organizations,
    gestores,
  });
});

// POST /api/dataroom/grants { organization_id, gestor_id }
dataroomRouter.post('/grants', async (c) => {
  const user = getRequestUser(c);
  assertRole(user, ['superadmin']);

  const body = await c.req.json().catch(() => ({}));
  const organizationId = String(body?.organization_id ?? '');
  const gestorId = String(body?.gestor_id ?? '');
  if (!organizationId || !gestorId) throw new ApiError(400, 'organization_id y gestor_id son obligatorios');

  const [org, gestor] = await Promise.all([
    repo.getOrganizationById(organizationId),
    db.profile.findUnique({ where: { id: gestorId }, select: { id: true, role: true } }),
  ]);
  if (!org) throw new ApiError(404, 'Organización no encontrada');
  if (!gestor || !['gestor', 'admin'].includes(gestor.role)) {
    throw new ApiError(400, 'El usuario debe tener rol gestor o admin');
  }

  const grant = await repo.createGrant({ organizationId, gestorId, grantedBy: user.sub });
  return c.json({ grant: { id: grant.id } }, 201);
});

// DELETE /api/dataroom/grants/:id
dataroomRouter.delete('/grants/:id', async (c) => {
  const user = getRequestUser(c);
  assertRole(user, ['superadmin']);
  try {
    await repo.deleteGrant(c.req.param('id'));
  } catch {
    throw new ApiError(404, 'Permiso no encontrado');
  }
  return c.json({ success: true });
});

// GET /api/dataroom/granted — datarooms que ME delegaron (gestor/admin)
dataroomRouter.get('/granted', async (c) => {
  const user = getRequestUser(c);
  assertRole(user, ['gestor', 'admin', 'superadmin']);

  // Superadmin ve todos los datarooms; gestor/admin solo los delegados
  if (user.role === 'superadmin') {
    const orgs = await db.organization.findMany({
      select: { id: true, name: true, sector: true }, orderBy: { name: 'asc' },
    });
    return c.json({ organizations: orgs });
  }
  const grants = await repo.grantsForGestor(user.sub);
  return c.json({ organizations: grants.map(g => g.organization) });
});

// ══ Bitácora de accesos (dueño o superadmin) ══════════════════════════════════
// GET /api/dataroom/access-log[?orgId=] — quién descargó qué y cuándo
dataroomRouter.get('/access-log', async (c) => {
  const user = getRequestUser(c);
  const ownOrg = await repo.getOrganizationOf(user.sub);

  const requestedOrgId = c.req.query('orgId');
  let orgId = ownOrg?.id ?? null;
  if (requestedOrgId && requestedOrgId !== ownOrg?.id) {
    if (user.role !== 'superadmin') throw new ApiError(403, 'Solo el dueño ve su bitácora');
    orgId = requestedOrgId;
  }
  if (!orgId) throw new ApiError(400, 'Primero crea el perfil de tu organización');

  const logs = await repo.accessLogsOf(orgId);
  return c.json({
    logs: logs.map(l => ({
      id:        l.id,
      file_name: l.document.fileName,
      action:    l.action,
      // Orden deliberado: usuario con cuenta → invitado → visitante anónimo.
      // Un invitado tiene nombre y correo en la invitación: mostrarlo como
      // "Visitante" borraría justo el rastro más sensible del dataroom.
      user: l.user
        ? (l.user.fullName || l.user.email)
        : l.invitation
          ? `${l.invitation.name || l.invitation.email} (invitado)`
          : 'Visitante (mini-landing pública)',
      created_at: l.createdAt.toISOString(),
    })),
  });
});

// ══ INVITACIONES (solo el DUEÑO del dataroom) ════════════════════════════════
// Un gestor con acceso delegado NO puede invitar: su permiso es de lectura, y
// dejarle repartir accesos a documentos ajenos rompería esa regla.

const INVITE_TTL_DAYS = 30;

// ── GET /api/dataroom/invitations ────────────────────────────────────────────
dataroomRouter.get('/invitations', async (c) => {
  const user = getRequestUser(c);
  const org = await repo.getOrganizationOf(user.sub);
  if (!org) throw new ApiError(400, 'Primero crea el perfil de tu organización');

  const now = new Date();
  const list = await repo.invitationsOf(org.id);
  return c.json({
    invitations: list.map(i => ({
      id:             i.id,
      email:          i.email,
      name:           i.name,
      created_at:     i.createdAt.toISOString(),
      expires_at:     i.expiresAt.toISOString(),
      last_access_at: i.lastAccessAt?.toISOString() ?? null,
      revoked:        Boolean(i.revokedAt),
      // Estado ya resuelto para que la UI no reimplemente la lógica de vencimiento
      status: i.revokedAt ? 'revocada'
            : i.expiresAt < now ? 'vencida'
            : i.lastAccessAt ? 'activa'
            : 'enviada',
    })),
  });
});

// ── POST /api/dataroom/invitations ───────────────────────────────────────────
const inviteSchema = z.object({
  email: z.string().email('Correo inválido'),
  name:  z.string().max(120).optional().nullable(),
});

dataroomRouter.post('/invitations', async (c) => {
  const user = getRequestUser(c);
  const org = await repo.getOrganizationOf(user.sub);
  if (!org) throw new ApiError(400, 'Primero crea el perfil de tu organización');

  const parsed = inviteSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) throw new ApiError(400, parsed.error.errors[0]?.message ?? 'Datos inválidos');

  // Sin correo configurado la invitación sería un token que nadie recibe: se dice
  // claro en vez de crear una fila inútil.
  if (!isMailConfigured()) {
    throw new ApiError(503, 'El envío de correo no está configurado. Avisa al administrador.');
  }

  const email = parsed.data.email.trim().toLowerCase();
  const token = randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + INVITE_TTL_DAYS * 24 * 3600 * 1000);

  const inv = await repo.createInvitation({
    organizationId: org.id,
    email,
    name:           parsed.data.name?.trim() || null,
    tokenHash:      sha256(token),
    invitedBy:      user.sub,
    expiresAt,
  });

  const link = appUrl(`/dataroom/invitacion/${token}`);
  const saluda = parsed.data.name ? `Hola ${parsed.data.name},` : 'Hola,';

  const result = await sendMail({
    to:      email,
    subject: `${org.name} te invitó a revisar su dataroom en EYWA`,
    html: baseTemplate({
      title: `${org.name} compartió su dataroom contigo`,
      bodyHtml: `
        <p style="margin:0 0 12px;">${saluda}</p>
        <p style="margin:0 0 12px;">
          <strong>${org.name}</strong> te dio acceso a su dataroom en EYWA para que
          revises su documentación. Podrás <strong>ver y descargar</strong> los
          documentos, pero no modificarlos.
        </p>
        <p style="margin:0;">
          El acceso vence en ${INVITE_TTL_DAYS} días y la empresa puede retirarlo
          en cualquier momento.
        </p>`,
      ctaLabel: 'Abrir el dataroom',
      ctaUrl:   link,
      footerNote: 'Por transparencia con la empresa, cada documento que descargues queda registrado en su bitácora de accesos.',
    }),
    text: [
      saluda,
      '',
      `${org.name} te dio acceso a su dataroom en EYWA para que revises su documentación.`,
      `Puedes ver y descargar los documentos, pero no modificarlos. El acceso vence en ${INVITE_TTL_DAYS} días.`,
      '',
      link,
      '',
      'Por transparencia con la empresa, cada documento que descargues queda registrado en su bitácora.',
    ].join('\n'),
  });

  if (!result.ok) {
    // El correo no salió: la invitación es inservible, así que se revoca en vez
    // de dejarla figurando como "enviada" en el panel del dueño.
    await repo.revokeInvitation(inv.id);
    throw new ApiError(502, 'No se pudo enviar el correo de invitación. Inténtalo de nuevo.');
  }

  return c.json({
    invitation: {
      id: inv.id, email: inv.email, name: inv.name,
      expires_at: inv.expiresAt.toISOString(), status: 'enviada',
    },
  }, 201);
});

// ── DELETE /api/dataroom/invitations/:id  (revocar) ──────────────────────────
dataroomRouter.delete('/invitations/:id', async (c) => {
  const user = getRequestUser(c);
  const org = await repo.getOrganizationOf(user.sub);
  if (!org) throw new ApiError(400, 'No tienes una organización');

  const inv = await repo.getInvitation(c.req.param('id'));
  // Verificar la propiedad: si no, cualquiera podría revocar invitaciones ajenas.
  if (!inv || inv.organizationId !== org.id) throw new ApiError(404, 'Invitación no encontrada');

  await repo.revokeInvitation(inv.id);
  return c.json({ success: true });
});
