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

  // Lista los planes de un usuario (más recientes primero)
  async listByUser(userId: string) {
    return this.db.projectPlan.findMany({
      where:   { userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  // Obtiene un plan concreto (validando propiedad)
  async getByIdForUser(id: string, userId: string) {
    return this.db.projectPlan.findFirst({ where: { id, userId } });
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
    });
  }

  async setStatus(id: string, status: ValidationStatus) {
    return this.db.projectPlan.update({ where: { id }, data: { status } });
  }

  // Guarda el reporte generado y marca como analizado
  async saveReport(id: string, report: object) {
    return this.db.projectPlan.update({
      where: { id },
      data:  { report: report as Prisma.InputJsonValue, status: 'analyzed', analyzedAt: new Date() },
    });
  }

  async delete(id: string) {
    await this.db.projectPlan.delete({ where: { id } });
  }
}
