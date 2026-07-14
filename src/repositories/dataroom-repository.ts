import type { PrismaClient } from '@prisma/client';

export class DataroomRepository {
  constructor(private db: PrismaClient) {}

  // La organización del usuario (1:1). El dataroom cuelga de ella.
  async getOrganizationOf(userId: string) {
    return this.db.organization.findUnique({ where: { userId } });
  }

  async getOrganizationById(id: string) {
    return this.db.organization.findUnique({ where: { id } });
  }

  // Plantilla global (10 carpetas con sus documentos requeridos)
  async getTemplate() {
    return this.db.dataroomFolder.findMany({
      orderBy: { sortOrder: 'asc' },
      include: { items: { orderBy: { sortOrder: 'asc' } } },
    });
  }

  // Documentos ya subidos por una organización
  async getDocumentsOf(organizationId: string) {
    return this.db.dataroomDocument.findMany({
      where:   { organizationId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getItem(itemId: string) {
    return this.db.dataroomItem.findUnique({ where: { id: itemId } });
  }

  async getDocument(id: string) {
    return this.db.dataroomDocument.findUnique({ where: { id } });
  }

  async createDocument(data: {
    organizationId: string; itemId: string; fileName: string;
    storagePath: string; mime: string; size: number; uploadedBy: string;
  }) {
    return this.db.dataroomDocument.create({ data });
  }

  async deleteDocument(id: string) {
    return this.db.dataroomDocument.delete({ where: { id } });
  }

  async setPublic(id: string, isPublic: boolean) {
    return this.db.dataroomDocument.update({ where: { id }, data: { isPublic } });
  }

  // ── Mini-landing pública ────────────────────────────────────────────────────

  async findBySlug(slug: string) {
    return this.db.organization.findUnique({ where: { publicSlug: slug } });
  }

  async slugTaken(slug: string) {
    return Boolean(await this.db.organization.findUnique({ where: { publicSlug: slug }, select: { id: true } }));
  }

  async setLanding(orgId: string, data: { publicEnabled?: boolean; publicSlug?: string }) {
    return this.db.organization.update({ where: { id: orgId }, data });
  }

  // SOLO los documentos que el dueño marcó como públicos, con su carpeta/item.
  async getPublicDocumentsOf(organizationId: string) {
    return this.db.dataroomDocument.findMany({
      where:   { organizationId, isPublic: true },
      orderBy: { createdAt: 'desc' },
      include: { item: { include: { folder: true } } },
    });
  }

  // Completitud (para el sello de confianza de la landing)
  async completenessOf(organizationId: string) {
    const [total, docs] = await Promise.all([
      this.db.dataroomItem.count(),
      this.db.dataroomDocument.findMany({ where: { organizationId }, select: { itemId: true } }),
    ]);
    const done = new Set(docs.map(d => d.itemId)).size;
    return { completed_items: done, total_items: total, percentage: total ? Math.round((done / total) * 100) : 0 };
  }
}
