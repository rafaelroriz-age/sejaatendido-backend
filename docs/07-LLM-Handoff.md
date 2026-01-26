# Handoff para outra LLM (briefing + prompt base)

## 1) O que já está pronto

- Auth com access token curto + refresh token rotacionado
- Logout com blocklist de access token (`jti`)
- Email: confirmação e reset de senha (token one-time no DB; compat com JWT antigo)
- Camada `/api/*` com endpoints principais (Auth/Usuarios/Consultas/Avaliacoes/Chats)
- Logs Winston + `/health` + Swagger UI em `/docs`
- `npm run build` e `npm test` passando

## 2) O que falta (para “completar a API” de forma mais enterprise)

Prioridade alta:
- Expandir `src/openapi.ts` para descrever requests/responses/schemas (hoje só tem summary)
- Criar integração tests com Supertest + Postgres (rodando via docker-compose no CI)
- Job de limpeza de tokens expirados (refresh/blocklist/reset)
- Validar e tornar idempotente o webhook Stripe

Prioridade média:
- Implementar `marcar-lidas` de chat de forma real
- Paginação padronizada
- Harmonizar RBAC entre rotas legadas e `/api/*`

## 3) Arquivos-chave para a LLM entender o sistema

- `src/index.ts` (bootstrap + mounts)
- `src/routes/api.ts` (camada /api)
- `src/controllers/auth.controller.ts`
- `src/utils/authTokens.ts`
- `src/routes/emails.ts` (confirmação e reset)
- `prisma/schema.prisma`

## 4) Prompt base (copiar/colar para outra LLM)

> Você está ajudando a escrever um **briefing técnico** (ou issue) para um coding agent completar e elevar a API do repositório `sejaatendido-backend` (Express+TS+Prisma). Não implemente código. Produza um documento objetivo com requisitos + critérios de aceitação.
>
> Contexto:
> - Existe uma camada de compatibilidade `/api/*` em `src/routes/api.ts`.
> - Auth já tem access JWT curto + refresh token rotacionado e blocklist no logout.
> - Reset de senha já usa token opaco one-time com hash no banco (`PasswordResetToken`), com fallback para token antigo JWT.
> - Swagger UI existe em `/docs`, mas o OpenAPI (`src/openapi.ts`) é muito incompleto.
>
> Objetivo do próximo ciclo:
> 1) Completar/robustecer OpenAPI (schemas, requests, responses, security, exemplos)
> 2) Adicionar testes de integração (Supertest) com Postgres em CI
> 3) Implementar job de limpeza de tokens expirados
> 4) Auditar e endurecer o webhook Stripe (assinatura/idempotência)
>
> Entregáveis:
> - Lista de tarefas granular (checklist)
> - Critérios de aceitação por tarefa
> - Sugestão de estrutura de testes e setup de DB de teste
> - Riscos e mitigação
> - Quais arquivos devem ser alterados/criados

## 5) Saída esperada dessa outra LLM

- Um briefing/issue em Markdown, pronto para eu executar como agent, com:
  - “Definition of Done”
  - Lista de tarefas técnicas (P0/P1)
  - Checagens finais (`npm test`, `npm run build`, rotas principais)
