-- Invitaciones al Dataroom: el dueño invita a un tercero (inversor, auditor) a
-- VER su dataroom sin que ese tercero tenga que crear cuenta.
-- El token viaja SOLO en el correo; aquí se guarda su SHA-256.
CREATE TABLE IF NOT EXISTS "dataroom_invitations" (
  "id"              UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "email"           TEXT NOT NULL,
  "name"            TEXT,
  "token_hash"      TEXT NOT NULL,
  "invited_by"      UUID NOT NULL,
  "expires_at"      TIMESTAMP(3) NOT NULL,
  "last_access_at"  TIMESTAMP(3),
  "revoked_at"      TIMESTAMP(3),
  "created_at"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "dataroom_invitations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "dataroom_invitations_organization_id_fkey" FOREIGN KEY ("organization_id")
    REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "dataroom_invitations_invited_by_fkey" FOREIGN KEY ("invited_by")
    REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "dataroom_invitations_token_hash_key"
  ON "dataroom_invitations"("token_hash");
CREATE INDEX IF NOT EXISTS "dataroom_invitations_organization_id_idx"
  ON "dataroom_invitations"("organization_id");

-- La bitácora debe poder decir QUIÉN se llevó el documento cuando fue un invitado
-- (que no tiene user_id). Sin esto quedaría como "Visitante" y el registro de
-- accesos perdería justo el caso más sensible.
ALTER TABLE "dataroom_access_logs" ADD COLUMN IF NOT EXISTS "invitation_id" UUID;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'dataroom_access_logs_invitation_id_fkey') THEN
    ALTER TABLE "dataroom_access_logs"
      ADD CONSTRAINT "dataroom_access_logs_invitation_id_fkey" FOREIGN KEY ("invitation_id")
      REFERENCES "dataroom_invitations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
