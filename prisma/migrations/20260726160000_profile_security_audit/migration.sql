-- Auditoría de seguridad por usuario, para el panel de superadmin.
-- Aparte de updated_at, que cambia con CUALQUIER edición (avatar, plan, rol) y
-- por eso no puede responder "¿cuándo entró?" ni "¿cuándo cambió su clave?".
--
-- Se dejan NULL a propósito: la plataforma no guardaba estos datos, así que no
-- existen para los usuarios ya registrados. Rellenarlos con created_at daría un
-- dato falso justo en un panel de auditoría.
ALTER TABLE "profiles" ADD COLUMN IF NOT EXISTS "last_login_at"       TIMESTAMP(3);
ALTER TABLE "profiles" ADD COLUMN IF NOT EXISTS "password_changed_at" TIMESTAMP(3);
