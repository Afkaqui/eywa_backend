-- Diagnóstico ESG ponderado (metodología GENES): categoría + peso por criterio
ALTER TABLE "diagnostic_questions" ADD COLUMN IF NOT EXISTS "category" TEXT NOT NULL DEFAULT 'general';
ALTER TABLE "diagnostic_questions" ADD COLUMN IF NOT EXISTS "weight" DOUBLE PRECISION NOT NULL DEFAULT 0;
