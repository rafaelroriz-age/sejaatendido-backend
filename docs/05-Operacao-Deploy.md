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
- Firebase (`FIREBASE_SERVICE_ACCOUNT_JSON`)

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
