# Configuracion - YD Social Ops

Guia operativa para desarrollo y produccion, alineada al codigo actual.

## 1) Requisitos

- Node.js 20+
- npm 10+
- Proyecto Supabase activo
- App Meta (developers.facebook.com)
- App Mercado Pago (developers.mercadopago.com)
- Proveedor de email transaccional (Resend o MailerSend) con remitente verificado

## 2) Variables de entorno

Configura en `.env.local` (local) y `.env.production` (produccion).

```env
# Core
NEXT_PUBLIC_APP_URL=https://social.tudominio.com
APP_URL=https://social.tudominio.com
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
ENCRYPTION_KEY=...

# IA
AI_PROVIDER=groq
GROQ_API_KEY=...
GROQ_MODEL=llama-3.3-70b-versatile
GEMINI_API_KEY=...
GEMINI_MODEL=gemini-2.5-flash
OPENAI_API_KEY=...
AI_CHAT_HISTORY_LIMIT=10
AI_RATE_LIMIT_PER_MINUTE=30

# Meta
META_APP_ID=...
META_APP_SECRET=...
META_WEBHOOK_VERIFY_TOKEN=...
NEXT_PUBLIC_META_APP_ID=...

# Mercado Pago
MP_CLIENT_ID=...
MP_CLIENT_SECRET=...
MP_ACCESS_TOKEN=...
MP_WEBHOOK_SECRET=...
NEXT_PUBLIC_MP_CLIENT_ID=...

MP_PREAPPROVAL_PLAN_BASIC=...
MP_PREAPPROVAL_PLAN_PRO=...
MP_PREAPPROVAL_PLAN_BUSINESS=...
MP_PREAPPROVAL_PLAN_ENTERPRISE=...
MP_PREAPPROVAL_PLAN_ENTERPRISE_PLUS=...

MP_PLAN_BASIC_LINK=...
MP_PLAN_PRO_LINK=...
MP_PLAN_BUSINESS_LINK=...
MP_PLAN_ENTERPRISE_LINK=...
MP_PLAN_ENTERPRISE_PLUS_LINK=...

MP_SAAS_BACK_URL_BASE=https://tu-ngrok.ngrok-free.dev

# Email transaccional
RESEND_API_KEY=...
EMAIL_FROM=noreply@tu-dominio.com

# Cron y retencion
CRON_SECRET=...
PAYMENT_EVENTS_RETENTION_DAYS=90
CHAT_LOGS_RETENTION_DAYS=90
INBOX_MESSAGES_RETENTION_DAYS=180
INBOX_THREADS_RETENTION_DAYS=365
ARCHIVE_BUCKET=yd-archives
```

Notas de email:

- `RESEND_API_KEY` acepta dos formatos:
  - `re_...` -> Resend
  - `mlsn...` -> MailerSend
- `EMAIL_FROM` debe ser un remitente verificado por el proveedor.

## 3) Migraciones de base de datos

Aplicar al menos:

- `20260228_dual_mp_inbox.sql`
- `20260301_inbox_scaling_archives.sql`
- `20260302_saas_trial_plan_changes_merchant_links.sql`
- `20260302_decrement_stock_fn.sql`

Validar que existan tablas/columnas clave:

- `conversation_threads`, `conversation_messages`
- `saas_subscriptions`, `saas_billing_events`
- `tenant_plan_changes`, `merchant_payment_links`
- columnas SaaS y merchant en `tenants`

## 4) Meta (WhatsApp, Messenger, Instagram)

### 4.1 OAuth y canales

- Conectar desde `Dashboard > Canales`.
- Callback: `GET /api/auth/meta/callback`.
- Webhook: `POST /api/webhooks/meta`.

### 4.2 Verificacion de webhook

En Meta:

- Callback URL: `https://tu-dominio/api/webhooks/meta`
- Verify token: `META_WEBHOOK_VERIFY_TOKEN`

### 4.3 Pruebas para App Review

Desde UI (Canales):

- `GET /api/channels/test-whatsapp-permissions`
- `GET /api/channels/test-messenger-permissions`
- `GET /api/channels/test-ig-permissions`

## 5) Mercado Pago - doble flujo

### 5.1 SaaS Billing (te pagan a ti)

- `POST /api/billing/subscribe`
  - crea checkout de suscripcion
  - soporta `scheduled_downgrade`
- `GET /api/billing/subscription`
  - estado de suscripcion y sync
- `POST /api/billing/reconcile`
  - sincronizacion manual cuando webhook se retrasa
- `POST /api/webhooks/saas-subscription`
  - idempotencia por `saas_billing_events`
  - validacion de firma con `MP_WEBHOOK_SECRET`

### 5.2 Merchant Checkout (tenant cobra a sus clientes)

Configuracion por tenant en Settings > Pagos:

- `mp_oauth`
- `external_link`
- `bank_transfer`

Reglas:

- `basic`: bloquea `mp_oauth`
- `pro/business/enterprise/enterprise_plus`: permiten `mp_oauth`

### 5.3 Webhook de pagos merchant

- `POST /api/webhooks/payment`
- registra `payment_events`
- actualiza estado de `merchant_payment_links` cuando aplica

## 6) Email transaccional

### 6.1 Arquitectura

Runtime usa este orden de proveedor:

1. Gmail OAuth (tenant)
2. SMTP (tenant)
3. Resend/MailerSend (tenant o global)

### 6.2 Eventos que envian correo

- `POST /api/webhooks/payment`
  - envia confirmacion de pago a `tenant.email`
  - si existe `payer_email`, tambien envia al pagador
- `POST /api/webhooks/saas-subscription`
  - envia estado de suscripcion si detecta cambio real
- `POST /api/billing/reconcile`
  - envia estado de suscripcion si converge a cambio real
- `POST /api/billing/subscribe` en caso `scheduled_downgrade`
  - envia confirmacion de cambio programado

### 6.3 Checklist de validacion rapida

1. Dominio/remitente verificado en proveedor.
2. Key valida (`re_...` o `mlsn...`).
3. `EMAIL_FROM` valido para ese dominio.
4. Reiniciar servidor tras cambiar `.env`.
5. Probar un evento real y revisar logs del backend + dashboard del proveedor.

### 6.4 Logging esperado

- errores de envio en backend:
  - `[Email] Resend error: ...`
  - `[Email] MailerSend error: ...`
  - `[Payment Webhook] email send failed ...`
  - `[Billing Subscribe] scheduled_downgrade email failed ...`

## 7) Inbox operativo

UI:

- `Dashboard > Bandeja` (`/dashboard/inbox`)

APIs:

- `GET /api/inbox/threads`
- `GET /api/inbox/threads/:id/messages`
- `POST /api/inbox/threads/:id/reply`
- `PATCH /api/inbox/threads/:id/status`
- `POST /api/inbox/backfill` (owner)

Comportamiento:

- inbound crea/actualiza thread
- bot outbound queda con `author_type=bot`
- reply manual queda con `author_type=agent`
- nuevo inbound reabre thread cerrado/pending

## 8) Audio en Meta

- descarga media con `Authorization: Bearer`
- parser ampliado para detectar audio en Messenger/Instagram
- si transcripcion falla, aplica fallback sin romper flujo

## 9) Validacion tecnica minima

```bash
npm install
npm run build
npm run lint
```

## 10) Deploy recomendado

1. Aplicar migraciones.
2. Configurar `.env.production`.
3. Deploy.
4. Verificar webhooks (Meta + MP).
5. Ejecutar pruebas de release (`docs/PRUEBAS-RELEASE.md`).
6. Validar emails transaccionales en proveedor.

## 11) Diagnostico rapido Supabase

Si aparece `Could not find the table 'public.conversation_threads' in the schema cache`:

1. revisar `GET /api/debug/supabase-schema`
2. validar que URL y keys de Supabase apunten al proyecto correcto
3. confirmar migraciones aplicadas en ese entorno
