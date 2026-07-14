-- Favoritos de actores por usuario (el directorio sigue siendo global/admin)

CREATE TABLE IF NOT EXISTS "actor_favorites" (
  "id"         UUID         NOT NULL DEFAULT gen_random_uuid(),
  "user_id"    UUID         NOT NULL,
  "actor_id"   UUID         NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "actor_favorites_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "actor_favorites_user_actor_key" ON "actor_favorites" ("user_id", "actor_id");
CREATE INDEX IF NOT EXISTS "actor_favorites_user_idx" ON "actor_favorites" ("user_id");

DO $$ BEGIN
  ALTER TABLE "actor_favorites" ADD CONSTRAINT "actor_favorites_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "actor_favorites" ADD CONSTRAINT "actor_favorites_actor_id_fkey"
    FOREIGN KEY ("actor_id") REFERENCES "actors"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
