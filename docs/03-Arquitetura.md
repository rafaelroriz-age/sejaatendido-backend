# Arquitetura

## 1. Visão geral

- **Express** como servidor HTTP
- **Prisma + Postgres** como banco principal
- **MongoDB (Mongoose)** opcional para chat
- **Zod** para validação (middleware sanitiza substituindo o body parseado)
- **Winston** para logs estruturados

## 2. Organização do código

- `src/index.ts`: bootstrap da API (middlewares, rotas, docs)
- `src/env.ts`: validação de variáveis de ambiente
- `src/routes/*`: roteadores
- `src/controllers/*`: lógica de controllers (ex.: auth)
- `src/middlewares/*`: auth, validação, error handler
- `src/utils/*`: Prisma client, tokens, Mongo connection
- `src/services/*`: email/push/chat

## 3. Modelo de dados (alto nível)

Postgres (Prisma):
- `Usuario` (tipo, emailConfirmado, hashes de tokens)
- `Medico`, `Paciente`
- `Consulta` (status, meetLink, cancelTokenHash)
- `Pagamento`
- `Avaliacao`
- `RefreshToken` (hash, expira, revogado)
- `AccessTokenBlocklist` (jti)
- `PasswordResetToken` (hash, expira, usado)

Mongo (opcional):
- `ChatMessage` por `appointmentId` (consulta)

## 4. Fluxos principais

### 4.1 Login
1) Credenciais validadas
2) Emite access token (JWT curto)
3) Emite refresh token (opaco) e persiste hash no Postgres

### 4.2 Refresh
1) Cliente envia refresh token
2) Backend encontra hash no banco, verifica expiração/revogação
3) Revoga token atual e emite novo refresh + novo access

### 4.3 Logout
- Revoga refresh token e, se access token presente, grava `jti` na blocklist até expirar

### 4.4 Reset de senha
- Solicitação gera token opaco one-time; persistido como hash em `PasswordResetToken`
- Reset consome token e revoga refresh tokens ativos

## 5. Decisões (ADR resumido)

- **Refresh token opaco + hash no banco**: evita vazar token em logs/banco
- **Access token com `jti`**: permite logout real via blocklist
- **Compat `/api/*`**: mantém rotas antigas sem quebrar consumidores existentes
