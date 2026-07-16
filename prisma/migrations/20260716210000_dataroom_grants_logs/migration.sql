-- Dataroom: permisos delegados a gestores (solo lectura) + bitácora de accesos.
CREATE TABLE IF NOT EXISTS "dataroom_access_grants" (
  "id"              UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "gestor_id"       UUID NOT NULL,
  "granted_by"      UUID NOT NULL,
  "created_at"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "dataroom_access_grants_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "dataroom_access_grants_organization_id_fkey" FOREIGN KEY ("organization_id")
    REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "dataroom_access_grants_gestor_id_fkey" FOREIGN KEY ("gestor_id")
    REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "dataroom_access_grants_organization_id_gestor_id_key"
  ON "dataroom_access_grants"("organization_id", "gestor_id");

CREATE TABLE IF NOT EXISTS "dataroom_access_logs" (
  "id"          UUID NOT NULL DEFAULT gen_random_uuid(),
  "document_id" UUID NOT NULL,
  "user_id"     UUID,
  "action"      TEXT NOT NULL DEFAULT 'download',
  "created_at"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "dataroom_access_logs_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "dataroom_access_logs_document_id_fkey" FOREIGN KEY ("document_id")
    REFERENCES "dataroom_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "dataroom_access_logs_user_id_fkey" FOREIGN KEY ("user_id")
    REFERENCES "profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "dataroom_access_logs_document_id_idx" ON "dataroom_access_logs"("document_id");
