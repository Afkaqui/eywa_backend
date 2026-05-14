import type { PrismaClient, UserRole, UserPlan } from '@prisma/client';

export class ProfileRepository {
  constructor(private db: PrismaClient) {}

  async getById(userId: string) {
    return this.db.profile.findUnique({
      where: { id: userId },
      omit:  { password: true },
    });
  }

  async getAll() {
    return this.db.profile.findMany({
      orderBy: { createdAt: 'desc' },
      omit:    { password: true },
    });
  }

  async updateRole(userId: string, role: UserRole) {
    await this.db.profile.update({
      where: { id: userId },
      data:  { role },
    });
  }

  async updatePlan(userId: string, plan: UserPlan) {
    await this.db.profile.update({
      where: { id: userId },
      data:  { plan },
    });
  }
}
