import type { PrismaClient, Prisma } from '@prisma/client';

type OrgData = {
  type?: string;
  institutionType?: string | null;
  name: string;
  description?: string | null;
  phone?: string | null;
  website?: string | null;
  externalLinks?: Prisma.InputJsonValue;
  country?: string | null;
  sector?: string | null;
};

export class OrganizationRepository {
  constructor(private db: PrismaClient) {}

  /** Organización predeterminada (la más antigua). Ver §13. */
  async findByUser(userId: string) {
    return this.db.organization.findFirst({
      where: { userId }, orderBy: { createdAt: 'asc' },
    });
  }

  /** Todas las del usuario, en orden estable. */
  async findAllByUser(userId: string) {
    return this.db.organization.findMany({
      where: { userId }, orderBy: { createdAt: 'asc' },
    });
  }

  // Ya no se puede hacer upsert por userId (dejó de ser único). Se busca la
  // organización predeterminada y se actualiza; si no hay ninguna, se crea.
  async upsert(userId: string, data: OrgData) {
    const actual = await this.findByUser(userId);
    if (actual) {
      return this.db.organization.update({ where: { id: actual.id }, data });
    }
    return this.db.organization.create({ data: { userId, ...data } });
  }
}
