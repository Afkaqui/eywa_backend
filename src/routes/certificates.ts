import { Hono } from 'hono';
import { authMiddleware } from '@/middleware/auth';
import { getRequestUser } from '@/lib/auth-helpers';
import { AcademyRepository } from '@/repositories/academy-repository';
import { serializeCertificate } from '@/lib/serializers';
import { db } from '@/lib/db';

export const certificatesRouter = new Hono();
const academyRepo = new AcademyRepository(db);

// ── GET /api/certificates/verify/:code  (PÚBLICO) ─────────────────────────────
// Verificación de autenticidad de un certificado por su código.
// Registrado ANTES del authMiddleware a propósito: cualquier tercero
// (empleador, inversor) puede validar un certificado EYWA.
certificatesRouter.get('/verify/:code', async (c) => {
  const { code } = c.req.param();
  const cert = await academyRepo.getCertificateByCode(code.toUpperCase());

  if (!cert) return c.json({ valid: false }, 404);

  return c.json({
    valid:        true,
    code:         cert.code,
    holder_name:  cert.user.fullName ?? cert.user.email,
    course_title: cert.course.title,
    instructor:   cert.course.instructor,
    percentage:   cert.percentage,
    issued_at:    cert.issuedAt.toISOString(),
  });
});

// Resto de rutas: autenticadas
certificatesRouter.use('*', authMiddleware);

// ── GET /api/certificates ─────────────────────────────────────────────────────
// Certificados del usuario autenticado
certificatesRouter.get('/', async (c) => {
  const user = getRequestUser(c);
  const certs = await academyRepo.getUserCertificates(user.sub);
  return c.json({ certificates: certs.map(serializeCertificate) });
});
