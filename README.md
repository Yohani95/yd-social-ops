# YD Social Ops

Plataforma SaaS para automatizar ventas y atencion en WhatsApp, Messenger, Instagram, TikTok y Web.

## Snapshot del release (2026-03-02)

- Pagos con doble flujo, separados y sin cruce:
  - SaaS Billing: el tenant paga su plan recurrente.
  - Merchant Checkout: el tenant cobra a sus clientes por `mp_oauth`, `external_link` o `bank_transfer`.
- SaaS robusto con webhook + reconciliacion manual:
  - `POST /api/webhooks/saas-subscription`
  - `POST /api/billing/reconcile`
- Inbox operativo multicanal:
  - threads, mensajes, reply manual, estados `open|pending|closed`.
  - backfill de `chat_logs` hacia `conversation_*`.
- Meta Review operativo:
  - endpoints de prueba por canal y evidencia persistida.
- Emails transaccionales activos:
  - pago aprobado, estado de suscripcion y downgrade programado.

## Arquitectura

- `app/api/bot/[tenant_id]`: endpoint publico de chat web.
- `lib/ai-service.ts`: motor de respuesta, herramientas y reglas.
- `app/api/webhooks/meta`: webhook unificado WhatsApp/Messenger/Instagram.
- `app/api/webhooks/tiktok`: webhook TikTok.
- `app/api/webhooks/payment`: webhook de pagos merchant.
- `app/api/webhooks/saas-subscription`: webhook de suscripciones SaaS.
- `lib/inbox.ts`: dominio de inbox (threads, mensajes, estados).
- `app/api/inbox/*`: APIs de bandeja.
- `app/(dashboard)/dashboard/inbox`: UI de bandeja.
- `lib/email.ts`: envio transaccional (Gmail OAuth, SMTP, Resend/MailerSend).

## Variables de entorno (resumen)

### Core

- `NEXT_PUBLIC_APP_URL`
- `APP_URL`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `ENCRYPTION_KEY`

### IA

- `AI_PROVIDER` (`groq|gemini|openai`)
- `GROQ_API_KEY`, `GROQ_MODEL`
- `GEMINI_API_KEY`, `GEMINI_MODEL`
- `OPENAI_API_KEY`
- `AI_CHAT_HISTORY_LIMIT`
- `AI_RATE_LIMIT_PER_MINUTE`

### Meta

- `META_APP_ID`
- `META_APP_SECRET`
- `META_WEBHOOK_VERIFY_TOKEN`
- `NEXT_PUBLIC_META_APP_ID`
- `NEXT_PUBLIC_META_PIXEL_ENABLED` (`true` solo en produccion)
- `NEXT_PUBLIC_META_PIXEL_ID`

### Mercado Pago

- `MP_CLIENT_ID`
- `MP_CLIENT_SECRET`
- `MP_ACCESS_TOKEN`
- `MP_WEBHOOK_SECRET`
- `NEXT_PUBLIC_MP_CLIENT_ID`
- `MP_PREAPPROVAL_PLAN_BASIC`
- `MP_PREAPPROVAL_PLAN_PRO`
- `MP_PREAPPROVAL_PLAN_BUSINESS`
- `MP_PREAPPROVAL_PLAN_ENTERPRISE`
- `MP_PREAPPROVAL_PLAN_ENTERPRISE_PLUS`
- `MP_PLAN_BASIC_LINK`
- `MP_PLAN_PRO_LINK`
- `MP_PLAN_BUSINESS_LINK`
- `MP_PLAN_ENTERPRISE_LINK`
- `MP_PLAN_ENTERPRISE_PLUS_LINK`
- `MP_SAAS_BACK_URL_BASE` (recomendado para local con ngrok)

### Email transaccional

- `RESEND_API_KEY`
- `EMAIL_FROM`

Compatibilidad de key:

- `re_...` -> API de Resend
- `mlsn...` -> API de MailerSend

Prioridad efectiva de proveedor (runtime):

1. `gmail_oauth` (tenant)
2. `smtp` (tenant)
3. `resend/mailersend` (tenant o global)

### Operacion

- `CRON_SECRET`
- `PAYMENT_EVENTS_RETENTION_DAYS`
- `CHAT_LOGS_RETENTION_DAYS`
- `INBOX_MESSAGES_RETENTION_DAYS`
- `INBOX_THREADS_RETENTION_DAYS`
- `ARCHIVE_BUCKET`

## Endpoints clave

### Billing SaaS

- `POST /api/billing/subscribe`
- `GET /api/billing/subscription`
- `POST /api/billing/reconcile`
- `POST /api/webhooks/saas-subscription`

### Merchant Checkout

- `GET /api/merchant/payment-links`
- `POST /api/merchant/payment-links`
- `POST /api/merchant/payment-links/:id/approve`
- `POST /api/merchant/payment-links/:id/reject`
- `POST /api/webhooks/payment`

### Inbox

- `GET /api/inbox/threads`
- `GET /api/inbox/threads/:id/messages`
- `POST /api/inbox/threads/:id/reply`
- `PATCH /api/inbox/threads/:id/status`
- `POST /api/inbox/backfill`

### Meta Review

- `GET /api/channels/test-whatsapp-permissions`
- `GET /api/channels/test-messenger-permissions`
- `GET /api/channels/test-ig-permissions`

## Base de datos (tablas clave)

- `tenants`
- `saas_subscriptions`
- `saas_billing_events`
- `tenant_plan_changes`
- `merchant_payment_links`
- `payment_events` (incluye `email_sent`)
- `conversation_threads`
- `conversation_messages`
- `data_archives`

## Scripts

- `npm run dev`
- `npm run build`
- `npm run start`
- `npm run lint`
- `npm run qa:smoke`
- `npm run qa:flows`
- `npm run qa:bot-scorecard`
- `npm run qa:regression`

## QA automatizado

- Vista QA (solo desarrollo): `/dashboard/qa`
- Endpoints QA (solo desarrollo):
  - `GET /api/qa/history`
  - `POST /api/qa/run`
- Variables para regression real:
  - `E2E_EMAIL`
  - `E2E_PASSWORD`
  - `E2E_TENANT_ID`
  - `E2E_BASE_URL` (default `http://127.0.0.1:3000`)
- QA no es modulo para cliente final. Se usa como gate interno de release.

## Documentacion

- [Primeros 30 minutos](./docs/PRIMEROS-30-MINUTOS.md)
- [Configuracion](./docs/CONFIGURACION.md)
- [Pruebas de release](./docs/PRUEBAS-RELEASE.md)
- [Matriz Mercado Pago](./docs/mercadopago-envs.md)
- [Emails transaccionales](./docs/EMAILS-TRANSACCIONALES.md)
- [Roadmap](./docs/roadmap.md)
- [Mejoras del chat](./docs/MEJORAS-CHAT.md)
- [Proveedores IA](./docs/AI-PROVIDERS.md)
