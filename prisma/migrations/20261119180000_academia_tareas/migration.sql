-- Tareas de la Academia y sus entregas (revisadas por gestor/admin).
CREATE TABLE IF NOT EXISTS "course_tasks" (
  "id" UUID PRIMARY KEY,
  "section_id" UUID NOT NULL REFERENCES "course_sections"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "titulo" TEXT NOT NULL,
  "instrucciones" TEXT NOT NULL,
  "imagen_url" TEXT,
  "permite_texto" BOOLEAN NOT NULL DEFAULT true,
  "permite_archivo" BOOLEAN NOT NULL DEFAULT true,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "course_tasks_section_id_idx" ON "course_tasks"("section_id");
CREATE TABLE IF NOT EXISTS "task_submissions" (
  "id" UUID PRIMARY KEY,
  "task_id" UUID NOT NULL REFERENCES "course_tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "user_id" UUID NOT NULL REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "texto" TEXT,
  "archivo_path" TEXT,
  "archivo_nombre" TEXT,
  "archivo_mime" TEXT,
  "archivo_size" INTEGER,
  "estado" TEXT NOT NULL DEFAULT 'enviada',
  "comentario" TEXT,
  "revisada_por" TEXT,
  "revisada_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "task_submissions_task_id_user_id_key" ON "task_submissions"("task_id", "user_id");
CREATE INDEX IF NOT EXISTS "task_submissions_estado_idx" ON "task_submissions"("estado");
