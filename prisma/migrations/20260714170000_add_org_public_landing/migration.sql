-- Mini-landing pública por empresa
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "public_enabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "public_slug" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "organizations_public_slug_key" ON "organizations" ("public_slug");
