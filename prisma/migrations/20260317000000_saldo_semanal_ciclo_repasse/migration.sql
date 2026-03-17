-- CreateEnum
CREATE TYPE "StatusCicloRepasse" AS ENUM ('PENDENTE', 'PROCESSANDO', 'CONCLUIDO', 'ERRO');

-- AlterTable: Medico saldo fields
ALTER TABLE "Medico" ADD COLUMN "saldoPendente" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Medico" ADD COLUMN "saldoALiberar" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Medico" ADD COLUMN "saldoTotalRecebido" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Medico" ADD COLUMN "proximoRepasse" TIMESTAMP(3);

-- AlterTable: Repasse add cicloRepasseId
ALTER TABLE "Repasse" ADD COLUMN "cicloRepasseId" TEXT;

-- CreateTable
CREATE TABLE "CicloRepasse" (
    "id" TEXT NOT NULL,
    "medicoId" TEXT NOT NULL,
    "semanaInicio" TIMESTAMP(3) NOT NULL,
    "semanaFim" TIMESTAMP(3) NOT NULL,
    "valorBruto" INTEGER NOT NULL DEFAULT 0,
    "taxaApp" INTEGER NOT NULL DEFAULT 0,
    "valorRepasse" INTEGER NOT NULL DEFAULT 0,
    "status" "StatusCicloRepasse" NOT NULL DEFAULT 'PENDENTE',
    "dataProcessamento" TIMESTAMP(3),
    "mpPaymentId" TEXT,
    "erroMsg" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CicloRepasse_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CicloRepasse_medicoId_idx" ON "CicloRepasse"("medicoId");
CREATE INDEX "CicloRepasse_status_idx" ON "CicloRepasse"("status");
CREATE INDEX "CicloRepasse_semanaInicio_idx" ON "CicloRepasse"("semanaInicio");
CREATE UNIQUE INDEX "CicloRepasse_medicoId_semanaInicio_key" ON "CicloRepasse"("medicoId", "semanaInicio");

-- CreateIndex
CREATE INDEX "Repasse_cicloRepasseId_idx" ON "Repasse"("cicloRepasseId");

-- AddForeignKey
ALTER TABLE "Repasse" ADD CONSTRAINT "Repasse_cicloRepasseId_fkey" FOREIGN KEY ("cicloRepasseId") REFERENCES "CicloRepasse"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CicloRepasse" ADD CONSTRAINT "CicloRepasse_medicoId_fkey" FOREIGN KEY ("medicoId") REFERENCES "Medico"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- RLS for CicloRepasse
ALTER TABLE "CicloRepasse" ENABLE ROW LEVEL SECURITY;
