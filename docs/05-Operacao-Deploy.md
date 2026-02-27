# Operação & Deploy

## 1. Variáveis de ambiente (essenciais)

- `DATABASE_URL`, `DIRECT_URL`
- `JWT_SEGREDO`
- `CORS_ORIGIN`
- `BACKEND_URL`, `FRONTEND_URL` (links em emails)

Recomendadas:
- `JWT_ACCESS_TOKEN_MINUTOS`
- `JWT_REFRESH_TOKEN_DIAS`
- `PASSWORD_RESET_TTL_HORAS`
- `LOG_LEVEL`

Opcionais:
- `MONGODB_URI` (chat)
- SMTP (`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`)
- Stripe (`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`)
- Mercado Pago (`MERCADOPAGO_ACCESS_TOKEN`, `MERCADOPAGO_WEBHOOK_SECRET`)
- Firebase (`FIREBASE_SERVICE_ACCOUNT_JSON`)

### Push notifications (Firebase/FCM)

- Backend já tem rotas em `/notificacoes` para registrar token e enviar push de teste.
- Configure UMA das env vars:
  - `FIREBASE_SERVICE_ACCOUNT_JSON` (JSON do service account)
  - `FIREBASE_SERVICE_ACCOUNT_JSON_BASE64` (o mesmo JSON em base64; útil quando a plataforma não aceita JSON multi-linha)

### Login Google

- Backend já expõe `POST /auth/login-google`.
- Configure `GOOGLE_CLIENT_ID` com o Client ID do seu app no Google Cloud Console.

### Envio de emails (SMTP)

- Configure `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`.
- Em produção, ao habilitar envio automático (`ENABLE_EMAIL_JOBS=true`) você também precisa de `CRON_SECRET`.

## 2. Docker

- Build: `docker build -t sejaatendido-backend .`
- Run: `docker run -p 3001:3001 --env-file .env sejaatendido-backend`

## 3. Migrations (produção)

- Preferível: `npx prisma migrate deploy`
- Gerar client: `npx prisma generate`

## 4. Health / Observabilidade

- Health: `GET /health`
- OpenAPI JSON: `GET /openapi.json`
- Swagger UI: `GET /docs`

## 5. Jobs/CRON

- Endpoints em `/emails/jobs/*` podem exigir:
  - `x-cron-secret: CRON_SECRET` **ou** usuário `ADMIN`

## 6. Seed

- `npm run seed` cria usuários de desenvolvimento (senhas fortes) em `src/seed.ts`.

## 7. Render (deploy rápido)

### 7.1 Web Service (Docker)

- Crie um **Web Service** no Render e selecione **Runtime: Docker**.
- Configure as envs essenciais (seção 1) e obrigatoriamente:
  - `NODE_ENV=production`
  - `BACKEND_URL=https://SEU-SERVICO.onrender.com`
  - `CORS_ORIGIN` com o domínio web (se houver). Para app Expo nativo, CORS não bloqueia, mas mantenha restrito se você tiver web.
- O Render injeta a porta em `PORT`. O backend já suporta `PORT` (fallback para `PORTA`).

**Migrations no Docker (Render)**

O Render não tem “release phase” automático para Docker. Alternativas:

- Após o primeiro deploy, abra o **Shell** do serviço e rode:
  - `npx prisma migrate deploy`
  - (opcional) `npx prisma generate`

### 7.2 Web Service (Node)

Se preferir não usar Docker:

- Build command: `npm ci && npm run build && npx prisma generate`
- Start command: `npx prisma migrate deploy && node dist/index.js`

### 7.3 Testes rápidos em produção

- Health: `GET /health`
- Swagger: `GET /docs`
- OpenAPI JSON: `GET /openapi.json`

## 8. Pagamentos Mercado Pago (Checkout Pro)

- Criar checkout (PIX + cartão): `POST /pagamentos/mercadopago/checkout` (PACIENTE autenticado)
- Webhook (configure no painel do Mercado Pago): `POST /pagamentos/webhook/mercadopago`
- Retorno (back_urls): `GET /pagamentos/mercadopago/retorno` (HTML simples; a fonte da verdade é o status no banco via webhook)

Env vars recomendadas:
- `MERCADOPAGO_ACCESS_TOKEN`
- `MERCADOPAGO_WEBHOOK_SECRET` (secret signature gerada em Your integrations > Webhooks)

## 8. Mercado Pago (Checkout no app)

### 8.1 Variáveis

- `MERCADOPAGO_ACCESS_TOKEN`

### 8.2 Fluxo recomendado (Expo)

1) No app, crie o checkout chamando:

- `POST /pagamentos/mercadopago/checkout` (autenticado como PACIENTE)

Resposta retorna `initPoint`/`sandboxInitPoint` e `pagamentoId`.

2) Abra o `initPoint` em um WebView.

3) Após finalizar, consulte:

- `GET /pagamentos/:pagamentoId`

até o status virar `PAGO`.

### 8.3 Webhook

O backend configura `notification_url` automaticamente na preference apontando para:

- `POST /pagamentos/webhook/mercadopago`

Esse webhook atualiza o status do pagamento e (quando aprovado) muda a consulta de `PENDENTE` para `ACEITA`.
