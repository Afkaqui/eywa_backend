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

  async findByUser(userId: string) {
    return this.db.organization.findUnique({ where: { userId } });
  }

  async upsert(userId: string, data: OrgData) {
    return this.db.organization.upsert({
      where:  { userId },
      create: { userId, ...data },
      update: data,
    });
  }
}
