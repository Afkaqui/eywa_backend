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

  // Ranking con métricas REALES y transparentes (se eliminó el "puntaje" sintético
  // total×10 por la regla de honestidad, 2026-07-16): simbiocreaciones totales,
  // cuántas son públicas y cuántos actores (personas/instituciones) mapearon en sus grafos.
  async getRanking() {
    const groups = await this.db.simbiocreacion.groupBy({
      by:      ['userId'],
      _count:  { id: true },
      orderBy: { _count: { id: 'desc' } },
      take:    30,
    });
    const userIds = groups.map(g => g.userId);
    const [users, rows] = await Promise.all([
      this.db.profile.findMany({
        where:  { id: { in: userIds } },
        select: { id: true, fullName: true, company: true },
      }),
      this.db.simbiocreacion.findMany({
        where:  { userId: { in: userIds } },
        select: { userId: true, privado: true, graphData: true },
      }),
    ]);

    const byUser = new Map<string, { publicas: number; actores: number }>();
    for (const r of rows) {
      const acc = byUser.get(r.userId) ?? { publicas: 0, actores: 0 };
      if (!r.privado) acc.publicas++;
      const nodes = (r.graphData as { nodes?: { type?: string }[] } | null)?.nodes ?? [];
      acc.actores += nodes.filter(n => n.type === 'person' || n.type === 'institution').length;
      byUser.set(r.userId, acc);
    }

    return groups.map((g, i) => ({
      rank:     i + 1,
      userId:   g.userId,
      total:    g._count.id,
      publicas: byUser.get(g.userId)?.publicas ?? 0,
      actores:  byUser.get(g.userId)?.actores ?? 0,
      user:     users.find(u => u.id === g.userId) ?? null,
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
