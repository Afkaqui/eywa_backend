-- AlterTable: umbral de aprobación por curso
ALTER TABLE "courses" ADD COLUMN IF NOT EXISTS "pass_threshold" INTEGER NOT NULL DEFAULT 80;

-- CreateTable: secciones del curso
CREATE TABLE "course_sections" (
    "id" UUID NOT NULL,
    "course_id" UUID NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "video_url" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "course_sections_pkey" PRIMARY KEY ("id")
);

-- CreateTable: recursos por sección (pdf | link | forum)
CREATE TABLE "section_resources" (
    "id" UUID NOT NULL,
    "section_id" UUID NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'link',
    "title" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "section_resources_pkey" PRIMARY KEY ("id")
);

-- CreateTable: progreso por sección y usuario
CREATE TABLE "section_progress" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "section_id" UUID NOT NULL,
    "completed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "section_progress_pkey" PRIMARY KEY ("id")
);

-- CreateTable: preguntas de examen
CREATE TABLE "exam_questions" (
    "id" UUID NOT NULL,
    "course_id" UUID NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "question" TEXT NOT NULL,
    "options" JSONB NOT NULL DEFAULT '[]',
    "correct_index" INTEGER NOT NULL,
    CONSTRAINT "exam_questions_pkey" PRIMARY KEY ("id")
);

-- CreateTable: intentos de examen
CREATE TABLE "exam_attempts" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "course_id" UUID NOT NULL,
    "score" INTEGER NOT NULL,
    "total" INTEGER NOT NULL,
    "percentage" INTEGER NOT NULL,
    "passed" BOOLEAN NOT NULL DEFAULT false,
    "answers" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "exam_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable: certificados
CREATE TABLE "certificates" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "course_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "percentage" INTEGER NOT NULL,
    "issued_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "certificates_pkey" PRIMARY KEY ("id")
);

-- Indexes
CREATE INDEX "course_sections_course_id_idx" ON "course_sections"("course_id");
CREATE INDEX "section_resources_section_id_idx" ON "section_resources"("section_id");
CREATE UNIQUE INDEX "section_progress_user_id_section_id_key" ON "section_progress"("user_id", "section_id");
CREATE INDEX "section_progress_user_id_idx" ON "section_progress"("user_id");
CREATE INDEX "exam_questions_course_id_idx" ON "exam_questions"("course_id");
CREATE INDEX "exam_attempts_user_id_course_id_idx" ON "exam_attempts"("user_id", "course_id");
CREATE UNIQUE INDEX "certificates_code_key" ON "certificates"("code");
CREATE UNIQUE INDEX "certificates_user_id_course_id_key" ON "certificates"("user_id", "course_id");
CREATE INDEX "certificates_user_id_idx" ON "certificates"("user_id");

-- Foreign keys
ALTER TABLE "course_sections" ADD CONSTRAINT "course_sections_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "section_resources" ADD CONSTRAINT "section_resources_section_id_fkey" FOREIGN KEY ("section_id") REFERENCES "course_sections"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "section_progress" ADD CONSTRAINT "section_progress_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "section_progress" ADD CONSTRAINT "section_progress_section_id_fkey" FOREIGN KEY ("section_id") REFERENCES "course_sections"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "exam_questions" ADD CONSTRAINT "exam_questions_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "exam_attempts" ADD CONSTRAINT "exam_attempts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "exam_attempts" ADD CONSTRAINT "exam_attempts_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "certificates" ADD CONSTRAINT "certificates_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "certificates" ADD CONSTRAINT "certificates_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
