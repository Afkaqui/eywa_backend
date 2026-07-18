-- Etiquetas temáticas normalizadas de los fondos (taxonomía EYWA).
-- El texto libre original se conserva en `sectors` para trazabilidad.
ALTER TABLE "funds" ADD COLUMN IF NOT EXISTS "sector_tags" JSONB NOT NULL DEFAULT '[]';
