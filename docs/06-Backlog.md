# Backlog / O que falta (priorizado)

## P0 — Produção/Security

1) **Cobertura de OpenAPI completa**
- Hoje `src/openapi.ts` é “mínimo” (sem schemas/requests/responses detalhados)
- Ideal: gerar docs mais completas (ou migrar para OpenAPI gerado por código)

2) **Testes de integração reais (DB)**
- Atualmente: apenas unit tests simples
- Ideal: suite Supertest + Postgres de teste (docker-compose/CI) + fixtures

3) **Limpeza de tokens expirados**
- `RefreshToken`, `AccessTokenBlocklist`, `PasswordResetToken` precisam limpeza periódica

4) **Stripe webhook hardening**
- Garantir verificação de assinatura e tratamento idempotente

## P1 — Produto/Qualidade

5) **Chat read receipts (marcar lidas real)**
- Implementado: campo `lidaEm` na tabela `ChatMensagem`, endpoint `PUT /api/chats/:chatId/marcar-lidas` funcional

6) **Paginação/filtragem consistente**
- Listagens podem crescer (consultas, avaliações, mensagens)

7) **RBAC consistente em rotas legadas**
- Parte das rotas antigas pode não estar alinhada com a policy nova

## P2 — Observabilidade/Maturidade

8) Métricas (ex.: Prometheus) + tracing
9) Alertas e dashboards
10) ADRs detalhados e threat model expandido
