-- Solicitudes de baja de cuenta (Ley 29733, derecho de cancelación).
CREATE TABLE IF NOT EXISTS "solicitudes_baja" (
  "id"           UUID PRIMARY KEY,
  "email"        TEXT NOT NULL,
  "nombre"       TEXT,
  "motivo"       TEXT,
  "estado"       TEXT NOT NULL DEFAULT 'pendiente',
  "profile_id"   UUID REFERENCES "profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  "nota"         TEXT,
  "resuelta_por" TEXT,
  "resuelta_at"  TIMESTAMP(3),
  "created_at"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "solicitudes_baja_estado_created_at_idx" ON "solicitudes_baja"("estado", "created_at");
