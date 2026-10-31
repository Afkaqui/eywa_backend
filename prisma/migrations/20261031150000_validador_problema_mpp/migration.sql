-- Validador: definición estructurada del problema y Máximo Producto Posible (PLAN C1, C2).
ALTER TABLE "project_plans"
  ADD COLUMN IF NOT EXISTS "problema" JSONB,  -- {actor, dolor, causa_raiz, urgencia, consecuencia, unidad_validacion}
  ADD COLUMN IF NOT EXISTS "mpp"      JSONB;  -- {insumo, subproductos:[{nombre, uso, sector, estado}]}
