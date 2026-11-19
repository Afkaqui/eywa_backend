-- El productor decide si su nombre completo sale en el pasaporte público (por defecto, no).
ALTER TABLE "agro_productores"
  ADD COLUMN IF NOT EXISTS "mostrar_nombre"    BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "mostrar_nombre_at" TIMESTAMP(3);
