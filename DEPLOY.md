# Deploy — Render (Configuração Completa)

## Configurações do Web Service no Render

| Campo             | Valor                                                              |
|-------------------|--------------------------------------------------------------------|
| **Runtime**       | Node                                                               |
| **Build Command** | `npm ci && npm run build && npm prune --omit=dev`                  |
| **Start Command** | `npm start`                                                        |
| **Node Version**  | 20                                                                 |
| **Health Check**  | `/health`                                                          |

> **IMPORTANTE:** deixe Auto-Deploy apontando para a branch `main`.
>
> O Start Command (`npm start`) já executa `prisma migrate deploy` antes de subir o servidor.
> **Não coloque `prisma migrate deploy` no Build Command** — o build do Render não tem acesso ao banco de dados.

---

## Variáveis de Ambiente — Obrigatórias

| Variável       | Nota                                                                         |
|----------------|------------------------------------------------------------------------------|
| `NODE_ENV`     | `production`                                                                 |
| `DATABASE_URL` | URL do Supabase **pooler** (porta 6543). Adicione `?pgbouncer=true` ao final |
| `DIRECT_URL`  | URL do Supabase **direta** (porta 5432). Necessária para migrations — veja seção abaixo |
| `JWT_SEGREDO`  | String aleatória **≥ 24 chars** — gere com `openssl rand -hex 32`           |
| `CORS_ORIGINS` | `https://sejaatendido-rn.vercel.app,https://sejaatendido-8spkgzaw2-rafaelrorizages-projects.vercel.app` |
| `FRONTEND_URL` | `https://sejaatendido-rn.vercel.app`                                         |
| `BACKEND_URL`  | URL pública do Render (ex: `https://sejaatendido.onrender.com`)              |

---

## Variáveis de Ambiente — Opcionais

| Variável                               | Nota                                                                     |
|----------------------------------------|--------------------------------------------------------------------------|
| `MERCADOPAGO_ACCESS_TOKEN`             | Token de produção do MercadoPago                                         |
| `MERCADOPAGO_WEBHOOK_SECRET`           | Secret configurado no painel do MercadoPago                              |
| `SMTP_USER`                            | Usuário SMTP (ex: API key do Resend/SendGrid)                            |
| `SMTP_PASS`                            | Senha SMTP                                                               |
| `SMTP_HOST`                            | Host SMTP (default: `smtp.gmail.com`)                                    |
| `SMTP_PORT`                            | Porta SMTP (default: `587`)                                              |
| `ENABLE_EMAIL_JOBS`                    | `true` apenas se SMTP configurado; exige `CRON_SECRET`                   |
| `CRON_SECRET`                          | String aleatória protegendo endpoints de cron                            |
| `GOOGLE_CLIENT_ID`                     | Client ID OAuth do Google Cloud Console                                  |
| `FIREBASE_SERVICE_ACCOUNT_JSON_BASE64` | Service account do Firebase em base64 (evita problema com JSON multiline) |
| `MONGODB_URI`                          | URI do MongoDB Atlas (só necessário se usar chat)                        |
| `MONGODB_REQUIRED`                     | `true` se falha do Mongo deve derrubar a API (default: `false`)          |

> **`DIRECT_URL` é obrigatória se `DATABASE_URL` usa o pooler (porta 6543).** As migrations do Prisma não funcionam com PgBouncer e precisam de uma conexão direta.

---

## Como converter a service account do Firebase para base64

```bash
cat firebase-service-account.json | base64 -w 0
```
Cole o resultado em `FIREBASE_SERVICE_ACCOUNT_JSON_BASE64` no Render.

---

## Supabase — Transaction vs Session Mode

- **Transaction Mode** (porta `6543`): use como `DATABASE_URL` com `?pgbouncer=true` no final.
- **Session Mode** (porta `5432`): pode usar como `DATABASE_URL` ou como `DIRECT_URL`.
- **Conexão direta** (porta `5432`, host `db.<ref>.supabase.co`): use como `DIRECT_URL`.

### Como obter as URLs no Supabase

1. Vá em **Project Settings → Database → Connection string**
2. Copie a **URI** tab:
   - **Transaction pooler** (porta 6543) → cole em `DATABASE_URL` e adicione `?pgbouncer=true`
   - **Session pooler** (porta 5432) → cole em `DIRECT_URL`

Exemplo:
```
DATABASE_URL=postgresql://postgres.xxxx:SENHA@aws-0-sa-east-1.pooler.supabase.com:6543/postgres?pgbouncer=true
DIRECT_URL=postgresql://postgres.xxxx:SENHA@aws-0-sa-east-1.pooler.supabase.com:5432/postgres
```

---

## Checklist antes de redeployar

- [ ] `NODE_ENV=production`
- [ ] `DATABASE_URL` apontando para Supabase (conexão ativa, IP liberado para Render ou `0.0.0.0/0`)
- [ ] `JWT_SEGREDO` com ≥ 24 caracteres
- [ ] `CORS_ORIGINS` com as URLs do Vercel (sem trailing slash, separadas por vírgula)
- [ ] `FRONTEND_URL` e `BACKEND_URL` com `https://` e sem trailing slash
- [ ] `DIRECT_URL` apontando para a conexão direta do Supabase (porta 5432)
- [ ] `MONGODB_URI` **removida** (ou IP do Render liberado no Atlas — `0.0.0.0/0`)
