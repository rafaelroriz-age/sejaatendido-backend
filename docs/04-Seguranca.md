# Segurança

## 1. Objetivo
Reduzir riscos comuns (OWASP) em um backend de saúde/telemedicina: credenciais, PII, fraude e abuso.

## 2. Controles implementados

- Hash de senha com bcrypt
- JWT curto + refresh token com rotação
- Blocklist de access token (logout)
- Validação/sanitização com Zod
- Helmet + CORS allowlist
- Rate limit global e mais restrito em auth
- Logs estruturados (evita dump de objetos grandes em prod)

## 3. Ameaças e mitigação (resumo)

- **Credential stuffing / brute force** → rate limit em `/auth`, senhas fortes
- **Token replay** → refresh token rotacionado + revogação, `jti` blocklist
- **Exposição de segredos** → usar env vars no deploy; nunca commitar `.env`
- **Enumeração de usuários** → recuperação de senha sempre retorna sucesso
- **Injeção** → Prisma reduz SQLi; Zod reduz payloads inesperados

## 4. Recomendações pendentes

- Validar assinatura de webhook Stripe (se ainda não estiver 100% no handler)
- Adicionar auditoria de eventos (login/logout/reset) com redaction
- Adicionar política de retenção para tabelas de tokens (job de limpeza)

## 5. Boas práticas operacionais

- Rotacionar `JWT_SEGREDO` em caso de incidente
- Usar `CORS_ORIGIN` estrito em produção
- Configurar `LOG_LEVEL` adequado
- Não logar tokens/credenciais

> Nota: arquivos `.env` existem no workspace, mas **não devem** ir para git; confirme que estão ignorados e não versionados.
