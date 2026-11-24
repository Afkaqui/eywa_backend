import { randomBytes } from 'crypto';
import type { PrismaClient } from '@prisma/client';

// Genera un código de certificado tipo EYWA-3F9A2C1B (verificable públicamente)
function generateCertCode(): string {
  return `EYWA-${randomBytes(4).toString('hex').toUpperCase()}`;
}

export class AcademyRepository {
  constructor(private db: PrismaClient) {}

  // ── Secciones ────────────────────────────────────────────────────────────────

  async getSections(courseId: string) {
    return this.db.courseSection.findMany({
      where:   { courseId },
      orderBy: { sortOrder: 'asc' },
      include: { resources: { orderBy: { sortOrder: 'asc' } } },
    });
  }

  async getSectionById(sectionId: string) {
    return this.db.courseSection.findUnique({ where: { id: sectionId } });
  }

  async getCompletedSectionIds(userId: string, courseId: string): Promise<string[]> {
    const rows = await this.db.sectionProgress.findMany({
      where: { userId, section: { courseId } },
      select: { sectionId: true },
    });
    return rows.map(r => r.sectionId);
  }

  // Marca una sección como completada y recalcula el progreso de la inscripción.
  // Auto-inscribe al usuario si todavía no tiene enrollment (mejor UX).
  async completeSection(userId: string, sectionId: string) {
    const section = await this.db.courseSection.findUnique({
      where: { id: sectionId },
      select: { id: true, courseId: true },
    });
    if (!section) return null;

    await this.db.sectionProgress.upsert({
      where:  { userId_sectionId: { userId, sectionId } },
      update: {},
      create: { userId, sectionId },
    });

    const [total, done] = await Promise.all([
      this.db.courseSection.count({ where: { courseId: section.courseId } }),
      this.db.sectionProgress.count({ where: { userId, section: { courseId: section.courseId } } }),
    ]);
    const progress = total > 0 ? Math.round((done / total) * 100) : 0;

    // upsert de enrollment (el "completed" final lo define aprobar el examen)
    const existing = await this.db.courseEnrollment.findUnique({
      where: { userId_courseId: { userId, courseId: section.courseId } },
    });
    if (existing) {
      await this.db.courseEnrollment.update({
        where: { id: existing.id },
        data:  { progress },
      });
    } else {
      await this.db.courseEnrollment.create({
        data: { userId, courseId: section.courseId, progress, completed: false },
      });
    }

    return { courseId: section.courseId, completedSections: done, totalSections: total, progress };
  }

  // ── Examen ───────────────────────────────────────────────────────────────────

  async countSections(courseId: string) {
    return this.db.courseSection.count({ where: { courseId } });
  }

  // Preguntas SIN la respuesta correcta (para servir al cliente)
  async getExamQuestionsPublic(courseId: string) {
    return this.db.examQuestion.findMany({
      where:   { courseId },
      orderBy: { sortOrder: 'asc' },
      select:  { id: true, sortOrder: true, question: true, options: true },
    });
  }

  // Preguntas CON la respuesta correcta (solo para corregir en servidor)
  async getExamQuestionsFull(courseId: string) {
    return this.db.examQuestion.findMany({
      where:   { courseId },
      orderBy: { sortOrder: 'asc' },
    });
  }

  async recordAttempt(data: {
    userId: string; courseId: string; score: number; total: number;
    percentage: number; passed: boolean; answers: Record<string, number>;
  }) {
    return this.db.examAttempt.create({ data });
  }

  async getLastAttempt(userId: string, courseId: string) {
    return this.db.examAttempt.findFirst({
      where:   { userId, courseId },
      orderBy: { createdAt: 'desc' },
    });
  }

  // ── Certificados ─────────────────────────────────────────────────────────────

  async getCertificate(userId: string, courseId: string) {
    return this.db.certificate.findUnique({
      where: { userId_courseId: { userId, courseId } },
    });
  }

  // Emite el certificado (idempotente) y marca la inscripción como completada
  async issueCertificate(userId: string, courseId: string, percentage: number) {
    const existing = await this.getCertificate(userId, courseId);
    if (existing) return existing;

    // reintento simple ante colisión improbable del código único
    let cert = null;
    for (let i = 0; i < 3 && !cert; i++) {
      try {
        cert = await this.db.certificate.create({
          data: { userId, courseId, percentage, code: generateCertCode() },
        });
      } catch { /* colisión de código; reintenta */ }
    }
    if (!cert) throw new Error('No se pudo generar el código del certificado');

    await this.db.courseEnrollment.upsert({
      where:  { userId_courseId: { userId, courseId } },
      update: { progress: 100, completed: true, completedAt: new Date() },
      create: { userId, courseId, progress: 100, completed: true, completedAt: new Date() },
    });

    return cert;
  }

  async getUserCertificates(userId: string) {
    return this.db.certificate.findMany({
      where:   { userId },
      orderBy: { issuedAt: 'desc' },
      include: { course: { select: { title: true, category: true, level: true, instructor: true } } },
    });
  }

  // Verificación pública por código
  async getCertificateByCode(code: string) {
    return this.db.certificate.findUnique({
      where:   { code },
      include: {
        course: { select: { title: true, instructor: true } },
        user:   { select: { fullName: true, email: true } },
      },
    });
  }
}
