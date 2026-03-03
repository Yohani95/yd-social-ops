# Pruebas de Release (Meta + Inbox + Pagos + Email)

Checklist operativo antes de produccion y App Review.

## 0) Pre-requisitos

- Build en verde:

```bash
npm run build
```

- Migraciones aplicadas (minimo):
  - `20260228_dual_mp_inbox.sql`
  - `20260301_inbox_scaling_archives.sql`
  - `20260302_saas_trial_plan_changes_merchant_links.sql`

- Variables configuradas por entorno:
  - Meta
  - MP SaaS + MP merchant
  - Email transaccional (`RESEND_API_KEY`, `EMAIL_FROM`)

## 1) Meta App Review

1. Ir a `Dashboard > Canales`.
2. Ejecutar pruebas por canal.
3. Validar evidencia en `social_channels.config.meta_review`.

Esperado:

- pruebas ejecutan llamadas requeridas
- errores de permisos son explicitos

## 2) Inbox operativo end-to-end

1. Enviar inbound real por canal (WA/Messenger/IG/Web).
2. Ver thread en `Dashboard > Bandeja`.
3. Responder manualmente desde inbox.
4. Cambiar estado `open -> pending -> closed`.
5. Enviar nuevo inbound y validar reapertura automatica a `open`.

## 3) Backfill de historial legacy

Si hay historial en `chat_logs` pero inbox vacio:

1. ejecutar `POST /api/inbox/backfill` desde owner
2. o usar boton de UI "Importar historial"

Body sugerido:

```json
{ "max_rows": 10000 }
```

Esperado:

- crea `conversation_threads` y `conversation_messages`
- idempotente (no duplica al repetir)

## 4) SaaS Billing

### 4.1 Casos base

1. upgrade de plan -> checkout + webhook/reconcile
2. same plan -> `409 already_on_plan`
3. downgrade con suscripcion activa -> `scheduled_downgrade`

### 4.2 Verificaciones

- `saas_billing_events` registra evento
- `saas_subscriptions` actualizado
- `tenants.plan_tier` y `saas_subscription_status` correctos

### 4.3 Resiliencia

- webhook duplicado no reprocesa
- `POST /api/billing/reconcile` converge estado
- evento desconocido retorna 200 sin romper estado

## 5) Merchant Checkout

### 5.1 Basic

- bloquea `mp_oauth`
- permite `external_link` y `bank_transfer`

### 5.2 Pro+

- permite conectar OAuth MP
- crea preferencia/link y procesa webhook de pago

## 6) Email end-to-end (obligatorio)

## 6.1 Requisitos previos

1. key valida:
   - `re_...` (Resend) o
   - `mlsn...` (MailerSend)
2. `EMAIL_FROM` verificado en proveedor
3. restart de app luego de editar env

## 6.2 Casos obligatorios

1. pago aprobado -> email de confirmacion
2. `scheduled_downgrade` -> email inmediato de cambio programado
3. reconcile con cambio real -> email de estado SaaS
4. webhook SaaS con cambio de plan/estado -> email de estado SaaS

## 6.3 Validaciones observables

- logs backend
- estado en proveedor (`delivered|bounced|rejected`)
- `payment_events.email_sent = true` para confirmacion de pago

SQL de control:

```sql
select payment_id, status, payer_email, email_sent, updated_at
from payment_events
order by created_at desc
limit 20;
```

## 6.4 Matriz de troubleshooting (email)

| Sintoma | Causa probable | Accion |
|---|---|---|
| `resend_4xx` | key `re_...` invalida o remitente no verificado | regenerar key y verificar dominio/remitente |
| `mailersend_4xx` | key `mlsn...` invalida o sender/domain no validado | validar token Sending access y sender domain |
| no llega correo y sin error app | proveedor distinto activo (gmail/smtp tenant) | revisar prioridad de proveedor en runtime |
| `email_not_configured` | falta key o `EMAIL_FROM` | completar env e integrar remitente |
| llega a correo incorrecto | `tenant.email` desactualizado | actualizar email del tenant en DB/Settings |

## 7) Audio Meta

1. enviar nota de voz en canales Meta
2. validar deteccion de adjunto
3. validar transcripcion o fallback controlado

## 8) Go / No-Go

Go solo si:

- Meta test con evidencia
- inbox manual funcionando
- SaaS y merchant convergen estado con webhook/reconcile
- emails transaccionales entregando correctamente
- build en verde
