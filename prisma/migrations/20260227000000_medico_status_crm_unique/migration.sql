-- Add doctor approval workflow fields
-- - Unique CRM
-- - status: PENDENTE | APROVADO | REJEITADO
-- - diplomaUrl (future upload)
-- - motivoRejeicao
-- - createdAt

-- 1) Enum type
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'StatusMedico') THEN
    CREATE TYPE "StatusMedico" AS ENUM ('PENDENTE', 'APROVADO', 'REJEITADO');
  END IF;
END $$;

-- 2) Columns
ALTER TABLE "Medico"
  ADD COLUMN IF NOT EXISTS "status" "StatusMedico" NOT NULL DEFAULT 'PENDENTE',
  ADD COLUMN IF NOT EXISTS "diplomaUrl" TEXT,
  ADD COLUMN IF NOT EXISTS "motivoRejeicao" TEXT,
  ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- 3) Backfill status from legacy `aprovado`
UPDATE "Medico"
SET "status" = (CASE WHEN "aprovado" = TRUE THEN 'APROVADO' ELSE 'PENDENTE' END)::"StatusMedico"
WHERE "status" = 'PENDENTE'::"StatusMedico";

-- 4) Ensure CRM values won't break unique constraint (historical records used empty string)
UPDATE "Medico"
SET "crm" = 'MIGRATED_' || SUBSTRING("id" FROM 1 FOR 8)
WHERE "crm" IS NULL OR BTRIM("crm") = '';

-- 5) Unique index for CRM
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname = 'Medico_crm_key'
  ) THEN
    CREATE UNIQUE INDEX "Medico_crm_key" ON "Medico"("crm");
  END IF;
END $$;
