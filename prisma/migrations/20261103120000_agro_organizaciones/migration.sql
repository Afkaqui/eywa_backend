-- Agro: organizaciones (cooperativas, asociaciones, agroindustrias) con miembros y roles.
-- Los productores pasan a pertenecer a una organización. Las tablas agro estaban
-- vacías al aplicar esto (verificado 2026-11-03), por eso organizacion_id es NOT NULL.

CREATE TABLE IF NOT EXISTS "agro_organizaciones" (
  "id"           UUID PRIMARY KEY,
  "nombre"       TEXT NOT NULL,
  "ruc"          TEXT,
  "tipo"         TEXT NOT NULL DEFAULT 'cooperativa',  -- cooperativa | asociacion | agroindustria | comprador | otro
  "cadena"       TEXT NOT NULL DEFAULT 'cacao',        -- cadena productiva principal
  "region"       TEXT,
  "created_by"   UUID REFERENCES "profiles"("id") ON DELETE SET NULL,
  "created_at"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "agro_miembros" (
  "id"              UUID PRIMARY KEY,
  "organizacion_id" UUID NOT NULL REFERENCES "agro_organizaciones"("id") ON DELETE CASCADE,
  "profile_id"      UUID NOT NULL REFERENCES "profiles"("id") ON DELETE CASCADE,
  "rol"             TEXT NOT NULL DEFAULT 'tecnico',     -- admin | tecnico | lector
  "created_at"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE ("organizacion_id", "profile_id")
);
CREATE INDEX IF NOT EXISTS "agro_miembros_profile_idx" ON "agro_miembros"("profile_id");

ALTER TABLE "agro_productores"
  ADD COLUMN IF NOT EXISTS "organizacion_id" UUID NOT NULL REFERENCES "agro_organizaciones"("id") ON DELETE CASCADE,
  ALTER COLUMN "owner_id" DROP NOT NULL;  -- queda como "quién lo registró"
CREATE INDEX IF NOT EXISTS "agro_productores_org_idx" ON "agro_productores"("organizacion_id");
-- Evita duplicar al mismo productor (por DNI) dentro de una organización.
CREATE UNIQUE INDEX IF NOT EXISTS "agro_productores_org_dni_key"
  ON "agro_productores"("organizacion_id", "dni") WHERE "dni" IS NOT NULL;

-- Borrar una cuenta NO debe borrar los productores que registró: pertenecen a la
-- organización. Antes era ON DELETE CASCADE.
ALTER TABLE "agro_productores" DROP CONSTRAINT IF EXISTS "agro_productores_owner_id_fkey";
ALTER TABLE "agro_productores" ADD CONSTRAINT "agro_productores_owner_id_fkey"
  FOREIGN KEY ("owner_id") REFERENCES "profiles"("id") ON DELETE SET NULL;
