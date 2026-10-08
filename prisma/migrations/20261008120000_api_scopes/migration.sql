-- API externa: permisos por clave, revocación y conteo de uso (PENDIENTES §9 y §15).
-- Aditivo. El cliente que ya existe (Katy) conserva todo lo que podía hacer: el
-- DEFAULT le da los cuatro permisos de las rutas que ya usaba.
ALTER TABLE "api_clients"
  ADD COLUMN IF NOT EXISTS "scopes"        JSONB        NOT NULL
    DEFAULT '["criterios:leer","organizaciones:escribir","organizaciones:leer","empresas:leer"]',
  ADD COLUMN IF NOT EXISTS "revoked_at"    TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "created_by"    UUID,
  ADD COLUMN IF NOT EXISTS "request_count" INTEGER      NOT NULL DEFAULT 0;

COMMENT ON COLUMN "api_clients"."scopes" IS
  'Permisos de la clave. Una ruta sin su permiso responde 403 aunque la clave sea válida.';
