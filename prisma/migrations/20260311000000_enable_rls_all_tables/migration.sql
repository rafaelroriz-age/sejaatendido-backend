-- Enable Row Level Security on all tables.
-- The Prisma connection role (database owner) bypasses RLS automatically.
-- This blocks unauthenticated access via PostgREST / Supabase Client SDK.

ALTER TABLE "Usuario"                ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Medico"                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Paciente"               ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Consulta"               ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Avaliacao"              ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Pagamento"              ENABLE ROW LEVEL SECURITY;
ALTER TABLE "MercadoPagoWebhookEvent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Documento"              ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DeviceToken"            ENABLE ROW LEVEL SECURITY;
ALTER TABLE "RefreshToken"           ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AccessTokenBlocklist"   ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PasswordResetToken"     ENABLE ROW LEVEL SECURITY;
