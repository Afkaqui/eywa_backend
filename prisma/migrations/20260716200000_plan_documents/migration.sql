-- Documentos reales del Validador de Proyectos (archivo en el volumen del VPS).
CREATE TABLE IF NOT EXISTS "plan_documents" (
  "id"           UUID NOT NULL DEFAULT gen_random_uuid(),
  "plan_id"      UUID NOT NULL,
  "file_name"    TEXT NOT NULL,
  "mime"         TEXT NOT NULL,
  "size"         INTEGER NOT NULL,
  "storage_path" TEXT NOT NULL,
  "created_at"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "plan_documents_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "plan_documents_plan_id_fkey" FOREIGN KEY ("plan_id")
    REFERENCES "project_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "plan_documents_plan_id_idx" ON "plan_documents"("plan_id");
