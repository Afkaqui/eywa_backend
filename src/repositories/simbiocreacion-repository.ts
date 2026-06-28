import type { PrismaClient, Prisma } from '@prisma/client';

type SimbiData = {
  nombre: string;
  privado?: boolean;
  lugar?: string | null;
  fecha?: string | null;
  horaInicio?: string | null;
  descripcion?: string | null;
  link?: string | null;
  tags?: Prisma.InputJsonValue;
  extraUrls?: Prisma.InputJsonValue;
  ods?: Prisma.InputJsonValue;
  graphData?: Prisma.InputJsonValue;
};

export class SimbiocreacionRepository {
  constructor(private db: PrismaClient) {}

  async findByUser(userId: string) {
    return this.db.simbiocreacion.findMany({
      where:   { userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findPublic() {
    return this.db.simbiocreacion.findMany({
      where:   { privado: false },
      orderBy: { updatedAt: 'desc' },
      take:    60,
      include: {
        user: { select: { id: true, fullName: true, company: true } },
      },
    });
  }

  async getRanking() {
    const groups = await this.db.simbiocreacion.groupBy({
      by:      ['userId'],
      _count:  { id: true },
      orderBy: { _count: { id: 'desc' } },
      take:    30,
    });
    const userIds = groups.map(g => g.userId);
    const users = await this.db.profile.findMany({
      where:  { id: { in: userIds } },
      select: { id: true, fullName: true, company: true },
    });
    return groups.map((g, i) => ({
      rank:    i + 1,
      userId:  g.userId,
      puntaje: g._count.id * 10,
      total:   g._count.id,
      user:    users.find(u => u.id === g.userId) ?? null,
    }));
  }

  async create(userId: string, data: SimbiData) {
    return this.db.simbiocreacion.create({ data: { userId, ...data } });
  }

  async update(id: string, userId: string, data: Partial<SimbiData>) {
    return this.db.simbiocreacion.updateMany({
      where: { id, userId },
      data,
    });
  }

  async delete(id: string, userId: string) {
    return this.db.simbiocreacion.deleteMany({
      where: { id, userId },
    });
  }
}
