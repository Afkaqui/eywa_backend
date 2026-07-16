import { Hono } from 'hono';
import { authMiddleware } from '@/middleware/auth';
import { getRequestUser } from '@/lib/auth-helpers';
import { db } from '@/lib/db';

// Notificaciones DERIVADAS DEL ESTADO del usuario (no hay tabla): cada caso se
// calcula al momento y desaparece solo cuando el usuario completa la acción.
// Primer caso (decisión 2026-07-16): registro incompleto (empresa declarada al
// registrarse pero Mi Organización sin completar). Casos futuros se suman aquí.

export const notificationsRouter = new Hono();

notificationsRouter.use('*', authMiddleware);

interface Notice {
  id:      string; // estable por caso (el frontend puede usarla como key)
  type:    'action' | 'info';
  title:   string;
  message: string;
  view:    string | null; // vista del nav a la que lleva el CTA
  cta:     string | null;
}

// GET /api/notifications — avisos activos del usuario en sesión
notificationsRouter.get('/', async (c) => {
  const user = getRequestUser(c);

  const [profile, org] = await Promise.all([
    db.profile.findUnique({ where: { id: user.sub }, select: { company: true } }),
    db.organization.findUnique({ where: { userId: user.sub }, select: { id: true } }),
  ]);

  const notices: Notice[] = [];

  // ── Caso 1: registro incompleto (sin organización creada) ──────────────────
  if (!org) {
    const empresa = (profile?.company ?? '').trim();
    notices.push({
      id:      'org-incomplete',
      type:    'action',
      title:   'Completa el perfil de tu organización',
      message: empresa
        ? `Declaraste "${empresa}" al registrarte, pero aún no has completado Mi Organización. Hasta entonces apareces como "Registro incompleto" en el portfolio y no puedes usar el Dataroom ni tener índice ESG.`
        : 'Aún no has creado el perfil de tu organización. Complétalo para aparecer en el portfolio, usar el Dataroom y tener tu índice ESG.',
      view:    'organization',
      cta:     'Completar Mi Organización',
    });
  }

  return c.json({ notifications: notices });
});
