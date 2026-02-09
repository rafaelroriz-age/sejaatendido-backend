# Plano de Contingência

## Se o backend cair

### Diagnóstico rápido
1. Checar `GET /health`
2. Checar `GET /system/status`
3. Ver logs no Render (últimos 30 min)

### Ações
- Deploy recente quebrou: fazer rollback/manual deploy da última versão estável
- Banco (Supabase) com instabilidade: checar status do projeto, logs e backups
- Webhook Mercado Pago falhando: checar logs, assinatura (`MERCADOPAGO_WEBHOOK_SECRET`) e reenviar evento
