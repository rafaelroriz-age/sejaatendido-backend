# Especificação de API

## 1. Convenções

- Base URL: `/{}` (depende do deploy). Rotas “compat” principais ficam sob `/api/*`.
- JSON: `application/json`.
- Datas: ISO-8601.
- IDs: UUID (Postgres). Chat usa `chatId = consultaId`.

## 2. Autenticação

### 2.1 Access token
- Tipo: JWT
- Enviado em `Authorization: Bearer <token>`
- Payload (mínimo):
  - `sub`: id do usuário
  - `tipo`: `PACIENTE` | `MEDICO` | `ADMIN`
  - `jti`: id único do token (para blocklist)

### 2.2 Refresh token
- Token opaco (random)
- Armazenado como hash no banco (`RefreshToken.tokenHash`)
- Rotação: o token usado é revogado e um novo é emitido

### 2.3 Logout
- Revoga refresh token (se informado)
- Opcionalmente blocklista o access token apresentado (via `jti`)

## 3. Formato de erro

Resposta comum:

```json
{
  "erro": "Mensagem",
  "detalhes": [
    { "campo": "email", "mensagem": "Email inválido" }
  ]
}
```

## 4. Endpoints (camada `/api`)

### Auth
- `POST /api/auth/registrar`
- `POST /api/auth/login`
- `POST /api/auth/refresh-token`
- `POST /api/auth/logout`

### Usuários
- `GET /api/usuarios/profissionais`
- `GET /api/usuarios/search?q=...&especialidade=...`
- `GET /api/usuarios/{id}`
- `PUT /api/usuarios/{id}`
- `DELETE /api/usuarios/{id}`

### Consultas
- `POST /api/consultas/agendar`
- `GET /api/consultas/{id}`
- `GET /api/consultas/usuario/{userId}`
- `PUT /api/consultas/{id}/status`
- `POST /api/consultas/{id}/cancelar`
- `POST /api/consultas/{id}/link-video`

### Avaliações
- `POST /api/avaliacoes/criar`
- `GET /api/avaliacoes/profissional/{profissionalId}`
- `PUT /api/avaliacoes/{id}`
- `DELETE /api/avaliacoes/{id}`

### Chats
- `POST /api/chats/iniciar`
- `GET /api/chats/usuario/{userId}`
- `GET /api/chats/{chatId}/mensagens`
- `POST /api/chats/{chatId}/mensagens`
- `PUT /api/chats/{chatId}/marcar-lidas`

### Infra
- `GET /health`
- `GET /openapi.json`
- `GET /docs`

## 5. Notas de compatibilidade
- Rotas “legadas” continuam existindo (`/auth`, `/usuarios`, etc.)
- Respostas de auth retornam tanto `token` (legado) quanto `accessToken`
