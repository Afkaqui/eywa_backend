import type { PrismaClient, UserRole, UserPlan } from '@prisma/client';
import { hashPassword, verifyPassword } from '@/lib/password';

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

  async updateProfile(userId: string, data: { fullName?: string; company?: string }) {
    return this.db.profile.update({
      where: { id: userId },
      data:  {
        ...(data.fullName !== undefined && { fullName: data.fullName }),
        ...(data.company  !== undefined && { company:  data.company  }),
      },
      omit: { password: true },
    });
  }

  async changePassword(userId: string, currentPassword: string, newPassword: string): Promise<{ error?: string }> {
    const row = await this.db.profile.findUnique({
      where:  { id: userId },
      select: { password: true },
    });
    if (!row) return { error: 'Usuario no encontrado' };

    const valid = await verifyPassword(currentPassword, row.password);
    if (!valid) return { error: 'La contraseña actual es incorrecta' };

    const hash = await hashPassword(newPassword);
    await this.db.profile.update({
      where: { id: userId },
      // passwordChangedAt va aparte de updatedAt: este último cambia con
      // cualquier edición del perfil y no serviría para auditar la clave.
      data:  { password: hash, passwordChangedAt: new Date() },
    });
    return {};
  }

  async search(q: string): Promise<Array<{id: string; fullName: string | null; company: string | null}>> {
    return this.db.profile.findMany({
      where: {
        OR: [
          { fullName: { contains: q, mode: 'insensitive' } },
          { email:    { contains: q, mode: 'insensitive' } },
          { company:  { contains: q, mode: 'insensitive' } },
        ],
      },
      take:   10,
      select: { id: true, fullName: true, company: true },
    });
  }
}
