-- Directorio de Actores del ecosistema (aditivo)

-- Enum de categorías unificadas
DO $$ BEGIN
  CREATE TYPE "ActorCategory" AS ENUM (
    'proveedores_capital', 'intermediarios', 'bancos', 'gobierno_multilaterales', 'empresa_social'
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS "actors" (
  "id"                UUID          NOT NULL DEFAULT gen_random_uuid(),
  "name"              TEXT          NOT NULL,
  "country"           TEXT          NOT NULL,
  "category"          "ActorCategory" NOT NULL,
  "subcategory"       TEXT,
  "description"       TEXT,
  "services"          TEXT,
  "procedencia"       TEXT,
  "geo_scope"         TEXT,
  "instruments"       JSONB         NOT NULL DEFAULT '[]',
  "sectors"           JSONB         NOT NULL DEFAULT '[]',
  "aum"               TEXT,
  "investment_amount" TEXT,
  "website"           TEXT,
  "contact_name"      TEXT,
  "contact_email"     TEXT,
  "source"            TEXT          NOT NULL,
  "created_by"        UUID,
  "created_at"        TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"        TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "actors_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "actors_name_country_key" ON "actors" ("name", "country");
CREATE INDEX IF NOT EXISTS "actors_country_idx"  ON "actors" ("country");
CREATE INDEX IF NOT EXISTS "actors_category_idx" ON "actors" ("category");

DO $$ BEGIN
  ALTER TABLE "actors" ADD CONSTRAINT "actors_created_by_fkey"
    FOREIGN KEY ("created_by") REFERENCES "profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
