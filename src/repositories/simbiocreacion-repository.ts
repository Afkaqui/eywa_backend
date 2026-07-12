import { Prisma, type PrismaClient } from '@prisma/client';

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
  graphData?: Prisma.InputJsonValue | null;
};

// Prisma exige Prisma.DbNull (no `null`) para poner en NULL un campo Json?.
// El frontend envía graphData: null al borrar el grafo personalizado.
function normalizeGraphData<T extends Partial<SimbiData>>(data: T) {
  if (!('graphData' in data)) return data;
  const { graphData, ...rest } = data;
  return { ...rest, graphData: graphData === null ? Prisma.DbNull : graphData };
}

export class SimbiocreacionRepository {
  constructor(private db: PrismaClient) {}

  async findByUser(userId: string) {
    return this.db.simbiocreacion.findMany({
      where:   { userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  // Una sola simbiocreación pública, por id (para enlaces compartidos).
  // Devuelve null si no existe o es privada.
  async findPublicById(id: string) {
    return this.db.simbiocreacion.findFirst({
      where:   { id, privado: false },
      include: { user: { select: { fullName: true, company: true } } },
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
    return this.db.simbiocreacion.create({
      data: { userId, ...normalizeGraphData(data) } as Prisma.SimbiocreacionUncheckedCreateInput,
    });
  }

  // Devuelve la fila actualizada, o null si no existe o no es del usuario (=> 404).
  async update(id: string, userId: string, data: Partial<SimbiData>) {
    const owned = await this.db.simbiocreacion.findFirst({
      where:  { id, userId },
      select: { id: true },
    });
    if (!owned) return null;

    return this.db.simbiocreacion.update({
      where: { id },
      data:  normalizeGraphData(data) as Prisma.SimbiocreacionUncheckedUpdateInput,
    });
  }

  // Devuelve true si borró algo; false si no existía o no era del usuario (=> 404).
  async delete(id: string, userId: string) {
    const { count } = await this.db.simbiocreacion.deleteMany({
      where: { id, userId },
    });
    return count > 0;
  }
}
