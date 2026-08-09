-- Indice faltante: era la unica columna de filtro por usuario sin indice.
-- Hoy da igual (pocas filas), pero la bitacora solo crece.
CREATE INDEX IF NOT EXISTS "dataroom_access_logs_user_id_idx"
  ON "dataroom_access_logs"("user_id");
