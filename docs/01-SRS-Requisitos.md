# SRS — Requisitos (SejaAtendido Backend)

## 1. Visão geral

### 1.1 Objetivo
Fornecer uma API REST segura e observável para o app SejaAtendido (telemedicina), cobrindo:
- Autenticação/Autorização
- Gestão de usuários (Paciente/Médico/Admin)
- Agendamento/gestão de consultas
- Pagamentos (Stripe, opcional)
- Notificações (email/push)
- Chat

### 1.2 Stakeholders
- Paciente
- Médico
- Admin (backoffice)
- Sistema de pagamentos (Stripe)
- Provedor SMTP
- Firebase/FCM (push)

### 1.3 Escopo
Inclui rotas “legadas” (ex.: `/auth/*`) e uma camada de compatibilidade em `/api/*`.

Fora do escopo (por enquanto):
- Interface web/admin
- Videochamada “gerada” automaticamente (ex.: criação real de meeting via Google APIs)
- Read receipts completos no chat

## 2. Requisitos funcionais (RF)

### RF-01 Autenticação
- Registrar usuário (`PACIENTE`/`MEDICO`)
- Login email/senha
- Login Google (opcional)
- Emissão de access token (curta duração) + refresh token (rotacionado)
- Refresh token: rotação e revogação
- Logout: revogar refresh token e invalidar access token via blocklist (por `jti`)

### RF-02 Confirmação de email
- Enviar confirmação (reenvio com anti-abuso)
- Confirmar via token (hash no banco; compat com tokens antigos via JWT)

### RF-03 Recuperação de senha
- Solicitar recuperação por email (sem revelar se email existe)
- Resetar senha com token one-time (hash no banco; compat com tokens antigos via JWT)
- Ao resetar senha, revogar refresh tokens ativos

### RF-04 Usuários
- Consultar perfil
- Atualizar dados básicos (nome/email) com permissão (owner ou admin)
- Deletar conta com regras de integridade (não permitir com consultas ativas)
- Listar profissionais aprovados e buscar por nome/especialidade

### RF-05 Consultas
- Agendar consulta (paciente)
- Ver consulta (participantes ou admin)
- Listar consultas por usuário
- Atualizar status (médico ou admin)
- Cancelar (participantes ou admin)
- Definir link de vídeo (médico ou admin)

### RF-06 Avaliações
- Criar avaliação (paciente, somente consulta concluída)
- Listar avaliações de um profissional
- Atualizar/deletar (paciente dono ou admin)

### RF-07 Chat (opcional)
- Iniciar chat por consulta
- Listar chats por usuário
- Listar/enviar mensagens
- Marcar como lidas (compat; no-op enquanto não houver read receipts)

### RF-08 Pagamentos (opcional)
- Criar/confirmar pagamentos conforme rotas existentes
- Webhook Stripe com corpo raw

## 3. Requisitos não-funcionais (RNF)

### RNF-01 Segurança
- Senhas com hash (bcrypt)
- Validação/sanitização de entrada (Zod)
- Rate limiting
- Helmet + CORS allowlist
- Segredos fora do repositório (env vars)

### RNF-02 Observabilidade
- Logs estruturados (Winston)
- Health endpoint (`/health`)
- Logs por request (método/path/status/duração/ip)

### RNF-03 Confiabilidade
- Migrações Prisma versionadas
- Falhas de email/push como best-effort (não derrubar request principal)

### RNF-04 Performance
- Limites de payload (`express.json` com limite)
- Paginação/limites em listagens críticas (quando aplicável)

## 4. Restrições e premissas
- Node.js 20 (Dockerfile e CI)
- Postgres via Prisma
- Chat armazenado no Postgres (tabela `ChatMensagem`, TTL 30 dias)
- Compatibilidade com rotas legadas mantida

## 5. Critérios de aceitação (alto nível)
- `npm run build` sem erros
- `npm test` passa
- `/health` responde `200`
- Auth retorna `accessToken` + `refreshToken`
- Reset de senha funciona com token DB (one-time) e revoga refresh tokens
