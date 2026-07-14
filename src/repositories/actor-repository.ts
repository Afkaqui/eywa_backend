import type { PrismaClient, Prisma, ActorCategory } from '@prisma/client';

export type ActorFilters = {
  country?: string;
  category?: ActorCategory;
  sector?: string;
  instrument?: string;
  q?: string;
  take?: number;
  skip?: number;
  favoritesOf?: string; // userId → solo los favoritos de ese usuario
};

export type ActorInput = {
  name: string;
  country: string;
  category: ActorCategory;
  subcategory?: string | null;
  description?: string | null;
  services?: string | null;
  procedencia?: string | null;
  geoScope?: string | null;
  instruments?: Prisma.InputJsonValue;
  sectors?: Prisma.InputJsonValue;
  aum?: string | null;
  investmentAmount?: string | null;
  website?: string | null;
  contactName?: string | null;
  contactEmail?: string | null;
  source?: string;
};

export class ActorRepository {
  constructor(private db: PrismaClient) {}

  private buildWhere(f: ActorFilters): Prisma.ActorWhereInput {
    const where: Prisma.ActorWhereInput = {};
    if (f.country)  where.country  = f.country;
    if (f.category) where.category = f.category;
    // instruments/sectors son Json arrays → filtro por contenido
    if (f.sector)     where.sectors     = { array_contains: [f.sector] };
    if (f.instrument) where.instruments = { array_contains: [f.instrument] };
    if (f.q) {
      where.OR = [
        { name:        { contains: f.q, mode: 'insensitive' } },
        { description: { contains: f.q, mode: 'insensitive' } },
        { subcategory: { contains: f.q, mode: 'insensitive' } },
      ];
    }
    if (f.favoritesOf) where.favorites = { some: { userId: f.favoritesOf } };
    return where;
  }

  // ── Favoritos (personales; el directorio en sí es global/admin) ──────────────

  async getFavoriteIds(userId: string): Promise<Set<string>> {
    const rows = await this.db.actorFavorite.findMany({
      where:  { userId },
      select: { actorId: true },
    });
    return new Set(rows.map(r => r.actorId));
  }

  // Idempotente: marcar un favorito que ya existe no falla.
  async addFavorite(userId: string, actorId: string) {
    const actor = await this.db.actor.findUnique({ where: { id: actorId }, select: { id: true } });
    if (!actor) return false;
    await this.db.actorFavorite.upsert({
      where:  { userId_actorId: { userId, actorId } },
      update: {},
      create: { userId, actorId },
    });
    return true;
  }

  async removeFavorite(userId: string, actorId: string) {
    const { count } = await this.db.actorFavorite.deleteMany({ where: { userId, actorId } });
    return count > 0;
  }

  async list(f: ActorFilters) {
    const where = this.buildWhere(f);
    const [items, total] = await Promise.all([
      this.db.actor.findMany({
        where,
        orderBy: [{ country: 'asc' }, { name: 'asc' }],
        take: f.take ?? 100,
        skip: f.skip ?? 0,
      }),
      this.db.actor.count({ where }),
    ]);
    return { items, total };
  }

  async getById(id: string) {
    return this.db.actor.findUnique({ where: { id } });
  }

  async create(userId: string, data: ActorInput) {
    return this.db.actor.create({
      data: {
        ...data,
        source:      data.source ?? 'manual',
        instruments: data.instruments ?? [],
        sectors:     data.sectors ?? [],
        createdBy:   userId,
      } as Prisma.ActorUncheckedCreateInput,
    });
  }

  async update(id: string, data: Partial<ActorInput>) {
    const exists = await this.db.actor.findUnique({ where: { id }, select: { id: true } });
    if (!exists) return null;
    return this.db.actor.update({ where: { id }, data: data as Prisma.ActorUncheckedUpdateInput });
  }

  async delete(id: string) {
    const { count } = await this.db.actor.deleteMany({ where: { id } });
    return count > 0;
  }

  // Facetas para los filtros del frontend (valores distintos existentes)
  async facets() {
    const rows = await this.db.actor.findMany({
      select: { country: true, category: true, sectors: true, instruments: true },
    });
    const countries = new Set<string>();
    const categories = new Set<string>();
    const sectors = new Set<string>();
    const instruments = new Set<string>();
    for (const r of rows) {
      countries.add(r.country);
      categories.add(r.category);
      for (const s of (r.sectors as string[] | null) ?? []) sectors.add(s);
      for (const i of (r.instruments as string[] | null) ?? []) instruments.add(i);
    }
    return {
      countries:   [...countries].sort(),
      categories:  [...categories].sort(),
      sectors:     [...sectors].sort(),
      instruments: [...instruments].sort(),
    };
  }
}
