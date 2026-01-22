-- CreateEnum
CREATE TYPE "TipoUsuario" AS ENUM ('PACIENTE', 'MEDICO', 'ADMIN');

-- CreateEnum
CREATE TYPE "StatusConsulta" AS ENUM ('PENDENTE', 'ACEITA', 'RECUSADA', 'CONCLUIDA', 'CANCELADA');

-- CreateEnum
CREATE TYPE "MetodoPagamento" AS ENUM ('PIX', 'CARTAO');

-- CreateEnum
CREATE TYPE "StatusPagamento" AS ENUM ('AGUARDANDO', 'PAGO', 'FALHOU');

-- CreateTable
CREATE TABLE "Usuario" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "senhaHash" TEXT NOT NULL,
    "tipo" "TipoUsuario" NOT NULL,
    "emailConfirmado" BOOLEAN NOT NULL DEFAULT false,
    "emailVerificacaoTokenHash" TEXT,
    "emailVerificacaoExpiraEm" TIMESTAMP(3),
    "emailVerificacaoEnviadoEm" TIMESTAMP(3),
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Usuario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Medico" (
    "id" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "crm" TEXT NOT NULL,
    "especialidades" TEXT[],
    "aprovado" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Medico_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Paciente" (
    "id" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,

    CONSTRAINT "Paciente_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Consulta" (
    "id" TEXT NOT NULL,
    "medicoId" TEXT NOT NULL,
    "pacienteId" TEXT NOT NULL,
    "data" TIMESTAMP(3) NOT NULL,
    "motivo" TEXT NOT NULL,
    "status" "StatusConsulta" NOT NULL DEFAULT 'PENDENTE',
    "meetLink" TEXT,
    "lembrete15mEnviado" BOOLEAN NOT NULL DEFAULT false,
    "lembreteDiarioEnviado" BOOLEAN NOT NULL DEFAULT false,
    "emailAvaliacaoEnviado" BOOLEAN NOT NULL DEFAULT false,
    "cancelTokenHash" TEXT,
    "cancelTokenExpiraEm" TIMESTAMP(3),

    CONSTRAINT "Consulta_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Pagamento" (
    "id" TEXT NOT NULL,
    "consultaId" TEXT NOT NULL,
    "metodo" "MetodoPagamento" NOT NULL,
    "valorCentavos" INTEGER NOT NULL,
    "status" "StatusPagamento" NOT NULL DEFAULT 'AGUARDANDO',
    "transacaoId" TEXT,

    CONSTRAINT "Pagamento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Documento" (
    "id" TEXT NOT NULL,
    "medicoId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,

    CONSTRAINT "Documento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeviceToken" (
    "id" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "platform" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeviceToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Usuario_email_key" ON "Usuario"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Medico_usuarioId_key" ON "Medico"("usuarioId");

-- CreateIndex
CREATE UNIQUE INDEX "Paciente_usuarioId_key" ON "Paciente"("usuarioId");

-- CreateIndex
CREATE UNIQUE INDEX "Pagamento_consultaId_key" ON "Pagamento"("consultaId");

-- CreateIndex
CREATE UNIQUE INDEX "DeviceToken_token_key" ON "DeviceToken"("token");

-- CreateIndex
CREATE INDEX "DeviceToken_usuarioId_idx" ON "DeviceToken"("usuarioId");

-- AddForeignKey
ALTER TABLE "Medico" ADD CONSTRAINT "Medico_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Paciente" ADD CONSTRAINT "Paciente_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Consulta" ADD CONSTRAINT "Consulta_medicoId_fkey" FOREIGN KEY ("medicoId") REFERENCES "Medico"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Consulta" ADD CONSTRAINT "Consulta_pacienteId_fkey" FOREIGN KEY ("pacienteId") REFERENCES "Paciente"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pagamento" ADD CONSTRAINT "Pagamento_consultaId_fkey" FOREIGN KEY ("consultaId") REFERENCES "Consulta"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Documento" ADD CONSTRAINT "Documento_medicoId_fkey" FOREIGN KEY ("medicoId") REFERENCES "Medico"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeviceToken" ADD CONSTRAINT "DeviceToken_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;
