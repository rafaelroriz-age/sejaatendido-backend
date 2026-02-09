-- Create MercadoPagoWebhookEvent table for webhook idempotency & auditing

CREATE TABLE "MercadoPagoWebhookEvent" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "type" TEXT,
    "action" TEXT,
    "processado" BOOLEAN NOT NULL DEFAULT false,
    "processadoEm" TIMESTAMP(3),
    "recebidoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MercadoPagoWebhookEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MercadoPagoWebhookEvent_eventId_key" ON "MercadoPagoWebhookEvent"("eventId");
CREATE INDEX "MercadoPagoWebhookEvent_paymentId_idx" ON "MercadoPagoWebhookEvent"("paymentId");
CREATE INDEX "MercadoPagoWebhookEvent_recebidoEm_idx" ON "MercadoPagoWebhookEvent"("recebidoEm");

-- Performance indexes
CREATE INDEX IF NOT EXISTS "Consulta_pacienteId_idx" ON "Consulta"("pacienteId");
CREATE INDEX IF NOT EXISTS "Consulta_medicoId_idx" ON "Consulta"("medicoId");
CREATE INDEX IF NOT EXISTS "Consulta_data_idx" ON "Consulta"("data");
