import type { PrismaClient, Prisma, ValidationStatus } from '@prisma/client';

export interface CreatePlanInput {
  userId:       string;
  name:         string;
  type:         string;
  description:  string;
  budget:       number;
  duration:     number;
  carbonGoal:   number;
  objectives:   string | null;
  stakeholders: string | null;
  documents:    { name: string; size: number; type: string }[];
}

export class ValidatorRepository {
  constructor(private db: PrismaClient) {}

  // Lista los planes de un usuario (más recientes primero), con sus documentos reales
  async listByUser(userId: string) {
    return this.db.projectPlan.findMany({
      where:   { userId },
      orderBy: { createdAt: 'desc' },
      include: { planDocuments: { orderBy: { createdAt: 'asc' } } },
    });
  }

  // Obtiene un plan concreto (validando propiedad)
  async getByIdForUser(id: string, userId: string) {
    return this.db.projectPlan.findFirst({
      where:   { id, userId },
      include: { planDocuments: { orderBy: { createdAt: 'asc' } } },
    });
  }

  // ── Documentos reales (archivo en disco) ──────────────────────────────────
  async addDocument(data: { planId: string; fileName: string; mime: string; size: number; storagePath: string }) {
    return this.db.planDocument.create({ data });
  }

  async getDocument(docId: string, planId: string) {
    return this.db.planDocument.findFirst({ where: { id: docId, planId } });
  }

  async deleteDocument(docId: string) {
    await this.db.planDocument.delete({ where: { id: docId } });
  }

  async countDocuments(planId: string) {
    return this.db.planDocument.count({ where: { planId } });
  }

  async create(data: CreatePlanInput) {
    return this.db.projectPlan.create({
      data: {
        userId:       data.userId,
        name:         data.name,
        type:         data.type,
        description:  data.description,
        budget:       data.budget,
        duration:     data.duration,
        carbonGoal:   data.carbonGoal,
        objectives:   data.objectives,
        stakeholders: data.stakeholders,
        documents:    data.documents as unknown as Prisma.InputJsonValue,
        status:       'pending',
      },
      include: { planDocuments: true },
    });
  }

  async setStatus(id: string, status: ValidationStatus) {
    return this.db.projectPlan.update({ where: { id }, data: { status } });
  }

  // Guarda el reporte generado y marca como analizado
  async saveReport(id: string, report: object) {
    return this.db.projectPlan.update({
      where:   { id },
      data:    { report: report as Prisma.InputJsonValue, status: 'analyzed', analyzedAt: new Date() },
      include: { planDocuments: { orderBy: { createdAt: 'asc' } } },
    });
  }

  async delete(id: string) {
    await this.db.projectPlan.delete({ where: { id } });
  }
}
