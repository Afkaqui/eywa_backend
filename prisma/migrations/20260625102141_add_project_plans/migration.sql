-- CreateEnum
CREATE TYPE "ValidationStatus" AS ENUM ('pending', 'analyzing', 'analyzed', 'failed');

-- CreateTable
CREATE TABLE "project_plans" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "budget" INTEGER NOT NULL DEFAULT 0,
    "duration" INTEGER NOT NULL DEFAULT 0,
    "carbon_goal" INTEGER NOT NULL DEFAULT 0,
    "objectives" TEXT,
    "stakeholders" TEXT,
    "documents" JSONB NOT NULL DEFAULT '[]',
    "status" "ValidationStatus" NOT NULL DEFAULT 'pending',
    "report" JSONB,
    "analyzed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "project_plans_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "project_plans_user_id_idx" ON "project_plans"("user_id");

-- CreateIndex
CREATE INDEX "project_plans_user_id_created_at_idx" ON "project_plans"("user_id", "created_at" DESC);

-- AddForeignKey
ALTER TABLE "project_plans" ADD CONSTRAINT "project_plans_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
