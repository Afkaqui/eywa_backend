-- Aceptación de términos y privacidad al crear la cuenta (único consentimiento).
ALTER TABLE "profiles" ADD COLUMN IF NOT EXISTS "terminos_aceptados_at" TIMESTAMP(3);
