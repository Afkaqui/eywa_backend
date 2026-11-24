import type { PrismaClient } from '@prisma/client';

export class DataroomRepository {
  constructor(private db: PrismaClient) {}

  // Organización PREDETERMINADA del usuario: la más antigua.
  // Un usuario puede tener varias (§13); hasta que exista el selector de
  // organización activa, se opera sobre la primera. Con una sola es idéntico
  // al comportamiento anterior.
  async getOrganizationOf(userId: string) {
    return this.db.organization.findFirst({
      where: { userId }, orderBy: { createdAt: 'asc' },
    });
  }

  /** Todas las organizaciones del usuario (para el selector y los límites). */
  async getOrganizationsOf(userId: string) {
    return this.db.organization.findMany({
      where: { userId }, orderBy: { createdAt: 'asc' },
    });
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

  // ── Completitud vía plataforma (carpeta Sostenibilidad y ASG) ───────────────
  // Ítems que se marcan "Completo vía plataforma" sin archivo (decisión 2026-07-16):
  // - "Reporte de sostenibilidad" ← el dueño hizo el diagnóstico GENES
  // - "Certificaciones de calidad / sostenibilidad" ← certificados de la Academia
  // Devuelve Map<itemId, nota>.
  // El DIAGNÓSTICO se busca por ORGANIZACIÓN, no por dueño (§13): GENES evalúa a
  // la empresa, y un dueño con tres empresas hacía que las tres mostraran el
  // mismo resultado. Los CERTIFICADOS sí son de la persona: los obtiene quien
  // estudia, no la empresa.
  async platformCompletions(ownerUserId: string, organizationId?: string): Promise<Map<string, string>> {
    const [diag, certs] = await Promise.all([
      organizationId
        ? this.db.diagnosticResult.findFirst({ where: { organizationId }, select: { id: true } })
        // Sin organización aún: se cae al comportamiento anterior para no romper
        // los resultados previos a la migración, que pueden tener organization_id nulo.
        : this.db.diagnosticResult.findFirst({ where: { userId: ownerUserId }, select: { id: true } }),
      this.db.certificate.count({ where: { userId: ownerUserId } }),
    ]);
    const wanted: { name: string; note: string }[] = [];
    if (diag) wanted.push({ name: 'Reporte de sostenibilidad', note: 'Diagnóstico ESG (metodología GENES) realizado en la plataforma' });
    if (certs > 0) wanted.push({ name: 'Certificaciones de calidad / sostenibilidad', note: `${certs} certificado(s) de la Academia EYWA` });
    if (!wanted.length) return new Map();

    const items = await this.db.dataroomItem.findMany({
      where:  { name: { in: wanted.map(w => w.name) } },
      select: { id: true, name: true },
    });
    const noteByName = new Map(wanted.map(w => [w.name, w.note]));
    return new Map(items.map(i => [i.id, noteByName.get(i.name)!]));
  }

  // Completitud (sello de confianza). Incluye los ítems completos vía plataforma.
  async completenessOf(organizationId: string, ownerUserId?: string) {
    const [total, docs, platform] = await Promise.all([
      this.db.dataroomItem.count(),
      this.db.dataroomDocument.findMany({ where: { organizationId }, select: { itemId: true } }),
      ownerUserId
        ? this.platformCompletions(ownerUserId, organizationId)
        : Promise.resolve(new Map<string, string>()),
    ]);
    const done = new Set([...docs.map(d => d.itemId), ...platform.keys()]).size;
    return { completed_items: done, total_items: total, percentage: total ? Math.round((done / total) * 100) : 0 };
  }

  // ── Permisos delegados a gestores (solo lectura) ────────────────────────────

  async hasGrant(organizationId: string, gestorId: string) {
    return Boolean(await this.db.dataroomAccessGrant.findFirst({
      where: { organizationId, gestorId }, select: { id: true },
    }));
  }

  async listGrants() {
    return this.db.dataroomAccessGrant.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        organization: { select: { id: true, name: true } },
        gestor:       { select: { id: true, email: true, fullName: true } },
      },
    });
  }

  async createGrant(data: { organizationId: string; gestorId: string; grantedBy: string }) {
    return this.db.dataroomAccessGrant.upsert({
      where:  { organizationId_gestorId: { organizationId: data.organizationId, gestorId: data.gestorId } },
      update: {},
      create: data,
    });
  }

  async deleteGrant(id: string) {
    await this.db.dataroomAccessGrant.delete({ where: { id } });
  }

  // Organizaciones cuyo dataroom puede ver un gestor
  async grantsForGestor(gestorId: string) {
    return this.db.dataroomAccessGrant.findMany({
      where:   { gestorId },
      orderBy: { createdAt: 'desc' },
      include: { organization: { select: { id: true, name: true, sector: true } } },
    });
  }

  // ── Bitácora de accesos ─────────────────────────────────────────────────────

  async logAccess(data: {
    documentId: string; userId: string | null; action: string; invitationId?: string | null;
  }) {
    await this.db.dataroomAccessLog.create({ data }).catch(() => {
      // la bitácora nunca debe romper una descarga
    });
  }

  async accessLogsOf(organizationId: string, limit = 50) {
    return this.db.dataroomAccessLog.findMany({
      where:   { document: { organizationId } },
      orderBy: { createdAt: 'desc' },
      take:    limit,
      include: {
        document:   { select: { fileName: true } },
        user:       { select: { email: true, fullName: true } },
        // Para que una descarga de invitado no aparezca como "Visitante"
        invitation: { select: { email: true, name: true } },
      },
    });
  }

  // ── Invitaciones ────────────────────────────────────────────────────────────
  async createInvitation(data: {
    organizationId: string; email: string; name: string | null;
    tokenHash: string; invitedBy: string; expiresAt: Date;
  }) {
    return this.db.dataroomInvitation.create({ data });
  }

  async invitationsOf(organizationId: string) {
    return this.db.dataroomInvitation.findMany({
      where:   { organizationId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getInvitation(id: string) {
    return this.db.dataroomInvitation.findUnique({ where: { id } });
  }

  // Busca por hash del token y devuelve la organización, para la vista del invitado.
  async findInvitationByHash(tokenHash: string) {
    return this.db.dataroomInvitation.findUnique({
      where:   { tokenHash },
      include: { organization: true },
    });
  }

  async revokeInvitation(id: string) {
    return this.db.dataroomInvitation.update({
      where: { id },
      data:  { revokedAt: new Date() },
    });
  }

  async touchInvitation(id: string) {
    await this.db.dataroomInvitation
      .update({ where: { id }, data: { lastAccessAt: new Date() } })
      .catch(() => { /* registrar el acceso nunca debe romper la vista */ });
  }
}
