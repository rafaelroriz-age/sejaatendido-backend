-- Add unique constraint for payment transaction IDs to improve idempotency
-- Postgres allows multiple NULLs in a UNIQUE constraint.

ALTER TABLE "Pagamento"
ADD CONSTRAINT "Pagamento_transacaoId_key" UNIQUE ("transacaoId");
