import { Hono } from 'hono';
import { randomUUID } from 'crypto';
import { mkdir, writeFile, readFile, unlink } from 'fs/promises';
import path from 'path';
import { authMiddleware } from '@/middleware/auth';
import { getRequestUser, ApiError } from '@/lib/auth-helpers';
import { db } from '@/lib/db';

export const mediaRouter = new Hono();

// Mismo volumen del VPS que usa el Dataroom (sobrevive a los redeploys).
const UPLOAD_DIR = process.env.UPLOAD_DIR ?? '/app/uploads';
const MAX_SIZE   = 5 * 1024 * 1024; // 5 MB (imágenes de perfil)

// Formato permitido → extensión con la que guardamos en disco.
const IMAGE_EXT: Record<string, string> = {
  'image/png':  '.png',
  'image/jpeg': '.jpg',
  'image/webp': '.webp',
};

function mimeFromPath(p: string): string {
  const ext = path.extname(p).toLowerCase();
  if (ext === '.png')  return 'image/png';
  if (ext === '.webp') return 'image/webp';
  return 'image/jpeg';
}

// Lee la imagen del multipart (campo "file"), validando tipo y tamaño.
async function readImage(c: { req: { parseBody: () => Promise<Record<string, unknown>> } }) {
  const body = await c.req.parseBody();
  const file = body['file'] as { size: number; type: string; arrayBuffer: () => Promise<ArrayBuffer> } | undefined;
  if (!file || typeof file === 'string' || typeof file.arrayBuffer !== 'function') {
    throw new ApiError(400, 'Falta el archivo (campo "file")');
  }
  if (file.size > MAX_SIZE) throw new ApiError(400, 'La imagen supera el límite de 5 MB');
  const ext = IMAGE_EXT[file.type];
  if (!ext) throw new ApiError(400, 'Formato no permitido. Usa PNG, JPG o WebP.');
  return { buf: Buffer.from(await file.arrayBuffer()), ext };
}

// ══ RUTAS PÚBLICAS (sin sesión) ══════════════════════════════════════════════
// Las imágenes se sirven sin auth: un <img src> del navegador no envía cabeceras
// Authorization, y el logo debe verse también en la mini-landing pública. No son
// datos sensibles (a diferencia de los documentos del Dataroom).

mediaRouter.get('/organization/:id/logo', async (c) => {
  const org = await db.organization.findUnique({
    where: { id: c.req.param('id') }, select: { imageUrl: true },
  });
  if (!org?.imageUrl) throw new ApiError(404, 'Sin logo');
  let data: Buffer;
  try { data = await readFile(org.imageUrl); }
  catch { throw new ApiError(404, 'Sin logo'); }
  c.header('Content-Type', mimeFromPath(org.imageUrl));
  c.header('Cache-Control', 'public, max-age=300');
  return c.body(new Uint8Array(data));
});

mediaRouter.get('/profile/:id/avatar', async (c) => {
  const p = await db.profile.findUnique({
    where: { id: c.req.param('id') }, select: { avatarUrl: true },
  });
  if (!p?.avatarUrl) throw new ApiError(404, 'Sin avatar');
  let data: Buffer;
  try { data = await readFile(p.avatarUrl); }
  catch { throw new ApiError(404, 'Sin avatar'); }
  c.header('Content-Type', mimeFromPath(p.avatarUrl));
  c.header('Cache-Control', 'public, max-age=300');
  return c.body(new Uint8Array(data));
});

// ══ De aquí en adelante, todo exige sesión ═══════════════════════════════════
mediaRouter.use('*', authMiddleware);

// Logo de la organización del usuario en sesión
mediaRouter.post('/organization/logo', async (c) => {
  const user = getRequestUser(c);
  const org = await db.organization.findUnique({ where: { userId: user.sub } });
  if (!org) throw new ApiError(400, 'Primero crea el perfil de tu organización');

  const { buf, ext } = await readImage(c);
  const dir  = path.join(UPLOAD_DIR, 'org-logos', org.id);
  await mkdir(dir, { recursive: true });
  const full = path.join(dir, `${randomUUID()}${ext}`);
  await writeFile(full, buf);
  if (org.imageUrl && org.imageUrl !== full) await unlink(org.imageUrl).catch(() => {});
  await db.organization.update({ where: { id: org.id }, data: { imageUrl: full } });

  return c.json({ image_url: `/api/media/organization/${org.id}/logo`, version: Date.now() }, 201);
});

// Avatar del usuario en sesión
mediaRouter.post('/profile/avatar', async (c) => {
  const user = getRequestUser(c);

  const { buf, ext } = await readImage(c);
  const dir  = path.join(UPLOAD_DIR, 'avatars', user.sub);
  await mkdir(dir, { recursive: true });
  const full = path.join(dir, `${randomUUID()}${ext}`);
  await writeFile(full, buf);
  const prev = await db.profile.findUnique({ where: { id: user.sub }, select: { avatarUrl: true } });
  if (prev?.avatarUrl && prev.avatarUrl !== full) await unlink(prev.avatarUrl).catch(() => {});
  await db.profile.update({ where: { id: user.sub }, data: { avatarUrl: full } });

  return c.json({ avatar_url: `/api/media/profile/${user.sub}/avatar`, version: Date.now() }, 201);
});
