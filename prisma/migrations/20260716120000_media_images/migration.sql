-- Imágenes: logo de organización y avatar de usuario.
-- Guardamos la RUTA en disco (volumen VPS /app/uploads); se sirven vía /api/media/*.
ALTER TABLE "profiles"      ADD COLUMN IF NOT EXISTS "avatar_url" TEXT;
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "image_url"  TEXT;
