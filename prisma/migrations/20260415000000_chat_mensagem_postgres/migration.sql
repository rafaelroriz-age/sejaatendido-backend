-- CreateTable
CREATE TABLE "ChatMensagem" (
    "id" TEXT NOT NULL,
    "consultaId" TEXT NOT NULL,
    "remetenteId" TEXT NOT NULL,
    "destinatarioId" TEXT NOT NULL,
    "mensagem" TEXT NOT NULL,
    "lidaEm" TIMESTAMP(3),
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiraEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChatMensagem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ChatMensagem_consultaId_criadoEm_idx" ON "ChatMensagem"("consultaId", "criadoEm");
CREATE INDEX "ChatMensagem_remetenteId_idx" ON "ChatMensagem"("remetenteId");
CREATE INDEX "ChatMensagem_destinatarioId_idx" ON "ChatMensagem"("destinatarioId");
CREATE INDEX "ChatMensagem_expiraEm_idx" ON "ChatMensagem"("expiraEm");

-- AddForeignKey
ALTER TABLE "ChatMensagem" ADD CONSTRAINT "ChatMensagem_consultaId_fkey" FOREIGN KEY ("consultaId") REFERENCES "Consulta"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ChatMensagem" ADD CONSTRAINT "ChatMensagem_remetenteId_fkey" FOREIGN KEY ("remetenteId") REFERENCES "Usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ChatMensagem" ADD CONSTRAINT "ChatMensagem_destinatarioId_fkey" FOREIGN KEY ("destinatarioId") REFERENCES "Usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RLS
ALTER TABLE "ChatMensagem" ENABLE ROW LEVEL SECURITY;
