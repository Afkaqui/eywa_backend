-- Enlace de una organización de Agro con su organización de EYWA (la misma empresa).
ALTER TABLE "agro_organizaciones" ADD COLUMN IF NOT EXISTS "organization_id" UUID;
CREATE UNIQUE INDEX IF NOT EXISTS "agro_organizaciones_organization_id_key" ON "agro_organizaciones"("organization_id");
DO $$ BEGIN
  ALTER TABLE "agro_organizaciones" ADD CONSTRAINT "agro_organizaciones_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
