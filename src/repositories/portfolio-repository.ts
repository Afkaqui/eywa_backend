import type { PrismaClient, RiskLevel } from '@prisma/client';

type CreateCompanyData = {
  name:      string;
  sector:    string;
  score:     number;
  status:    string;
  carbon?:   string | null;
  trend?:    string | null;
  lastAudit?: string | null;
  risk:      RiskLevel;
  createdBy?: string | null;
};

export class PortfolioRepository {
  constructor(private db: PrismaClient) {}

  async getAll() {
    return this.db.portfolioCompany.findMany({
      orderBy: { score: 'desc' },
    });
  }

  async create(data: CreateCompanyData) {
    return this.db.portfolioCompany.create({ data });
  }

  async update(id: string, updates: Partial<CreateCompanyData>) {
    await this.db.portfolioCompany.update({
      where: { id },
      data:  updates,
    });
  }

  async delete(id: string) {
    await this.db.portfolioCompany.delete({ where: { id } });
  }
}
