-- Dataroom por empresa (plantilla global + documentos por organización)

CREATE TABLE IF NOT EXISTS "dataroom_folders" (
  "id"          UUID NOT NULL DEFAULT gen_random_uuid(),
  "key"         TEXT NOT NULL,
  "sort_order"  INTEGER NOT NULL,
  "name"        TEXT NOT NULL,
  "description" TEXT,
  CONSTRAINT "dataroom_folders_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "dataroom_folders_key_key" ON "dataroom_folders" ("key");

CREATE TABLE IF NOT EXISTS "dataroom_items" (
  "id"         UUID NOT NULL DEFAULT gen_random_uuid(),
  "folder_id"  UUID NOT NULL,
  "sort_order" INTEGER NOT NULL,
  "name"       TEXT NOT NULL,
  "hint"       TEXT,
  CONSTRAINT "dataroom_items_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "dataroom_items_folder_idx" ON "dataroom_items" ("folder_id");

CREATE TABLE IF NOT EXISTS "dataroom_documents" (
  "id"              UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "item_id"         UUID NOT NULL,
  "file_name"       TEXT NOT NULL,
  "storage_path"    TEXT NOT NULL,
  "mime"            TEXT NOT NULL,
  "size"            INTEGER NOT NULL,
  "is_public"       BOOLEAN NOT NULL DEFAULT false,
  "uploaded_by"     UUID,
  "created_at"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "dataroom_documents_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "dataroom_documents_org_idx"  ON "dataroom_documents" ("organization_id");
CREATE INDEX IF NOT EXISTS "dataroom_documents_item_idx" ON "dataroom_documents" ("item_id");

DO $$ BEGIN
  ALTER TABLE "dataroom_items" ADD CONSTRAINT "dataroom_items_folder_fkey"
    FOREIGN KEY ("folder_id") REFERENCES "dataroom_folders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "dataroom_documents" ADD CONSTRAINT "dataroom_documents_org_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "dataroom_documents" ADD CONSTRAINT "dataroom_documents_item_fkey"
    FOREIGN KEY ("item_id") REFERENCES "dataroom_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "dataroom_documents" ADD CONSTRAINT "dataroom_documents_uploader_fkey"
    FOREIGN KEY ("uploaded_by") REFERENCES "profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
