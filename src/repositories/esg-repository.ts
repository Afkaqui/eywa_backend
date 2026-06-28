import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export class EsgRepository {
  async getByUser(userId: string) {
    const record = await prisma.esgScore.findUnique({ where: { userId } });
    return record;
  }

  async upsert(userId: string, scores: Record<string, number>) {
    return prisma.esgScore.upsert({
      where: { userId },
      update: { scores },
      create: { userId, scores },
    });
  }

  async addHistory(userId: string, scores: Record<string, number>) {
    return prisma.esgHistory.create({
      data: { userId, scores },
    });
  }

  async getHistory(userId: string) {
    return prisma.esgHistory.findMany({
      where: { userId },
      orderBy: { createdAt: "asc" },
      take: 50,
    });
  }
}
