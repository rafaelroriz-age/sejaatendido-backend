# 🏥 SejaAtendido — Backend

API REST (Express + TypeScript + Prisma/Postgres) para o app SejaAtendido.

## ✅ Recursos principais

- Auth JWT com access token curto + refresh token rotacionado
- Email: confirmação de email e reset de senha (rotas em `/emails/*`)
- Segurança: Helmet, CORS por allowlist, rate limit
- Observabilidade: Winston (logs estruturados) + `/health`
- Status do sistema: `/system/status` (uptime + checagem do Postgres)
- Swagger UI em `/docs` e OpenAPI em `/openapi.json`

## 📋 Pré-requisitos

- Node.js >= 18
- PostgreSQL (local ou Supabase)

## 🚀 Rodar localmente

1) Instalar dependências:

`npm install`

2) Configurar env:

`cp .env.example .env`

3) Rodar migrations e gerar client:

`npx prisma migrate dev`

Em produção, use:

`npm run migrate`

4) Subir a API:

`npm run dev`

## 🧪 Testes

`npm test`

## 📚 Docs

- Swagger UI: `GET /docs`
- OpenAPI: `GET /openapi.json`
- Documentação técnica (SRS/Arquitetura/Backlog/Handoff): `docs/00-INDEX.md`

## 🔌 Rotas (compat + /api)

Este backend mantém rotas “legadas” (ex: `/auth/*`, `/usuarios/*`) e também expõe as rotas no padrão do app em `/api/*`.

- Auth: `/api/auth/*`
- Usuários: `/api/usuarios/*`
- Consultas: `/api/consultas/*`
- Avaliações: `/api/avaliacoes/*`
- Chats: `/api/chats/*` (chatId = consultaId)

## 🐳 Docker

Build:

`docker build -t sejaatendido-backend .`

Run:

`docker run -p 3001:3001 --env-file .env sejaatendido-backend`

## ☁️ Deploy (Render/Railway/Fly/VPS)

- Configure as variáveis do `.env.example` na plataforma.
- Rode migrations no ambiente de produção (ex: `npx prisma migrate deploy`).
- Garanta `CORS_ORIGIN` sem `*` em produção.
- CORS: prefira `CORS_ORIGINS` (lista separada por vírgulas). `CORS_ORIGIN` também funciona por compatibilidade.
- Porta: plataformas costumam fornecer `PORT`; localmente use `PORTA`.
- Banco: `DIRECT_URL` agora é opcional (o backend usa apenas `DATABASE_URL`).

## 📁 Estrutura

- `src/index.ts`: entrypoint
- `src/routes/*`: rotas
- `src/middlewares/*`: auth/validation/error
- `src/services/*`: integrações (email/push/chat)
- `prisma/schema.prisma`: schema e migrations
