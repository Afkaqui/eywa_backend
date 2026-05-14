import type { PrismaClient } from '@prisma/client';

export class DiagnosticRepository {
  constructor(private db: PrismaClient) {}

  async getQuestions() {
    return this.db.diagnosticQuestion.findMany({
      orderBy: { sortOrder: 'asc' },
      include: {
        options: { orderBy: { sortOrder: 'asc' } },
      },
    });
  }

  async getLatestResult(userId: string) {
    return this.db.diagnosticResult.findFirst({
      where:   { userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async saveResult(data: {
    userId:     string;
    score:      number;
    maxScore:   number;
    percentage: number;
    level:      string;
    breakdown:  object;
  }) {
    await this.db.diagnosticResult.create({ data });
  }

  async createQuestion(data: {
    sortOrder:          number;
    title:              string;
    description:        string;
    contextTitle:       string | null;
    contextDescription: string | null;
    contextImpact:      string | null;
    contextImage:       string | null;
    createdBy:          string;
    options: { label: string; value: string; score: number; sort_order?: number }[];
  }) {
    const { options, ...questionData } = data;
    return this.db.diagnosticQuestion.create({
      data: {
        ...questionData,
        options: {
          createMany: {
            data: options.map((o, i) => ({
              label:     o.label,
              value:     o.value,
              score:     o.score,
              sortOrder: o.sort_order ?? i,
            })),
          },
        },
      },
      include: { options: { orderBy: { sortOrder: 'asc' } } },
    });
  }

  async deleteQuestion(id: string) {
    await this.db.diagnosticQuestion.delete({ where: { id } });
  }
}
