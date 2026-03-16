-- Enums
CREATE TYPE "TipoChavePix" AS ENUM ('CPF', 'CNPJ', 'EMAIL', 'TELEFONE', 'ALEATORIA');
CREATE TYPE "StatusRepasse" AS ENUM ('PENDENTE', 'PROCESSADO', 'FALHOU');
CREATE TYPE "CanalNotificacao" AS ENUM ('EMAIL', 'PUSH', 'WHATSAPP');

-- Dados bancários no Medico
ALTER TABLE "Medico" ADD COLUMN "tipoChavePix" "TipoChavePix";
ALTER TABLE "Medico" ADD COLUMN "valorChavePix" TEXT;
ALTER TABLE "Medico" ADD COLUMN "banco" TEXT;
ALTER TABLE "Medico" ADD COLUMN "agencia" TEXT;
ALTER TABLE "Medico" ADD COLUMN "conta" TEXT;
ALTER TABLE "Medico" ADD COLUMN "mpAccessTokenEncrypted" TEXT;
ALTER TABLE "Medico" ADD COLUMN "mpUserId" TEXT;

-- Repasse (split de pagamento)
CREATE TABLE "Repasse" (
    "id" TEXT NOT NULL,
    "consultaId" TEXT NOT NULL,
    "medicoId" TEXT NOT NULL,
    "valorBruto" INTEGER NOT NULL,
    "taxaApp" INTEGER NOT NULL,
    "valorRepasse" INTEGER NOT NULL,
    "status" "StatusRepasse" NOT NULL DEFAULT 'PENDENTE',
    "dataRepasse" TIMESTAMP(3),
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Repasse_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Repasse_consultaId_key" ON "Repasse"("consultaId");
CREATE INDEX "Repasse_medicoId_idx" ON "Repasse"("medicoId");
CREATE INDEX "Repasse_status_idx" ON "Repasse"("status");

ALTER TABLE "Repasse" ADD CONSTRAINT "Repasse_consultaId_fkey" FOREIGN KEY ("consultaId") REFERENCES "Consulta"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Repasse" ADD CONSTRAINT "Repasse_medicoId_fkey" FOREIGN KEY ("medicoId") REFERENCES "Medico"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Log de notificações
CREATE TABLE "NotificacaoLog" (
    "id" TEXT NOT NULL,
    "consultaId" TEXT,
    "usuarioId" TEXT NOT NULL,
    "canal" "CanalNotificacao" NOT NULL,
    "tipoEvento" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ENVIADO',
    "enviadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NotificacaoLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "NotificacaoLog_consultaId_idx" ON "NotificacaoLog"("consultaId");
CREATE INDEX "NotificacaoLog_usuarioId_idx" ON "NotificacaoLog"("usuarioId");
CREATE INDEX "NotificacaoLog_enviadoEm_idx" ON "NotificacaoLog"("enviadoEm");

-- RLS nas novas tabelas
ALTER TABLE "Repasse" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "NotificacaoLog" ENABLE ROW LEVEL SECURITY;
