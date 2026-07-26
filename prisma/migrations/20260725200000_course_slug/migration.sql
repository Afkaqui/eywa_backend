-- Slug del curso: clave estable para IMPORTAR sin duplicar.
-- Los seeds de actores y fondos hacen DELETE FROM y borran lo agregado a mano;
-- con un slug único, re-importar un curso lo ACTUALIZA en vez de duplicarlo.
-- Nullable: los cursos ya existentes no tienen slug y siguen siendo válidos
-- (en Postgres un índice UNIQUE admite varios NULL, así que no estorba).
ALTER TABLE "courses" ADD COLUMN IF NOT EXISTS "slug" TEXT;

-- Índice NO parcial a propósito: uno parcial (WHERE slug IS NOT NULL) obliga a
-- repetir el predicado en cada ON CONFLICT y el importador falla sin él.
DROP INDEX IF EXISTS "courses_slug_key";
CREATE UNIQUE INDEX IF NOT EXISTS "courses_slug_key" ON "courses"("slug");
