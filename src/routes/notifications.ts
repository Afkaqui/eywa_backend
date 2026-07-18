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

  // ── Caso 2: sin diagnóstico ESG (teniendo organización) ────────────────────
  if (org) {
    const diag = await db.diagnosticResult.findFirst({
      where: { userId: user.sub }, select: { id: true },
    });
    if (!diag) {
      notices.push({
        id:      'diagnostic-missing',
        type:    'action',
        title:   'Aún no tienes tu Índice ESG',
        message: 'Completa el Diagnóstico ESG (metodología GENES) para obtener tu índice, aparecer con score ante inversionistas en el portfolio y cubrir el ítem de sostenibilidad de tu Dataroom.',
        view:    'diagnostic',
        cta:     'Hacer el diagnóstico',
      });
    }
  }

  // ── Caso 3: fondo por cerrar en los próximos 15 días ───────────────────────
  const now = new Date();
  const in15 = new Date(now.getTime() + 15 * 24 * 3600 * 1000);
  const closing = await db.fund.findMany({
    where:   { deadline: { gte: now, lte: in15 } },
    orderBy: { deadline: 'asc' },
    take:    3,
    select:  { name: true, deadline: true },
  });
  if (closing.length) {
    const first = closing[0];
    const dias = Math.max(0, Math.ceil((first.deadline!.getTime() - now.getTime()) / (24 * 3600 * 1000)));
    notices.push({
      id:      'funds-closing',
      type:    'info',
      title:   closing.length === 1
        ? 'Una convocatoria cierra pronto'
        : `${closing.length} convocatorias cierran pronto`,
      message: `"${first.name}" cierra en ${dias} día${dias === 1 ? '' : 's'}.` +
               (closing.length > 1 ? ` Y ${closing.length - 1} más en los próximos 15 días.` : ''),
      view:    'portfolio',
      cta:     'Ver fondos',
    });
  }

  return c.json({ notifications: notices });
});
