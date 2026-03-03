# Emails transaccionales - YD Social Ops

Fuente operativa unica para envio de correos de pago/suscripcion y notificaciones internas.

## 1) Arquitectura de envio

El backend decide proveedor en runtime por tenant.

Prioridad:

1. `gmail_oauth` (tenant)
2. `smtp` (tenant)
3. `resend/mailersend` (tenant o global)

Si no hay proveedor valido:

- retorna `email_not_configured`
- no rompe el flujo principal de negocio

## 2) Variables clave

```env
RESEND_API_KEY=...
EMAIL_FROM=noreply@tu-dominio.com
```

Compatibilidad:

- `RESEND_API_KEY` con prefijo `re_...` -> API Resend
- `RESEND_API_KEY` con prefijo `mlsn...` -> API MailerSend

## 3) Templates disponibles

En `lib/email.ts`:

- `sendPaymentConfirmationEmail`
- `sendSaasSubscriptionStatusEmail`
- `sendCustomTenantEmail` (usado en downgrade programado)
- `sendOwnerNewMessageAlertEmail`
- `sendWeeklyReportEmail`
- `sendReservationReminderEmail`
- `sendLeadFollowUpEmail`
- `sendWelcomeEmail`

## 4) Matriz de disparadores

| Evento | Endpoint responsable | Destinatario(s) | Fuente de datos |
|---|---|---|---|
| Pago merchant aprobado | `POST /api/webhooks/payment` | `tenant.email` + `payer_email` (si existe) | `payment + tenants` |
| Cambio de estado SaaS por webhook | `POST /api/webhooks/saas-subscription` | `tenant.email` | `preapproval + tenants` |
| Cambio de estado SaaS por reconcile | `POST /api/billing/reconcile` | `tenant.email` | `preapproval + tenants` |
| Downgrade programado | `POST /api/billing/subscribe` (`scheduled_downgrade`) | `tenant.email` | `tenants + saas_subscriptions` |

## 5) Subjects de referencia

- Pago confirmado: `Pago confirmado - <producto>`
- Estado SaaS: `Suscripcion <Plan> - <status>`
- Downgrade programado: `Cambio de plan programado: <from> -> <to>`

## 6) Campos minimos requeridos

Generales:

- `to`
- `subject`
- `html`

Para pago confirmado:

- `businessName`
- `productName`
- `amount`
- `paymentId`

Para estado SaaS:

- `businessName`
- `planTier`
- `status`
- `preapprovalId`

## 7) Guia de branding de templates

Recomendado:

1. mantener una paleta por tipo de evento:
   - success: verde
   - warning: ambar
   - info: azul
2. usar logo y firma corporativa en header/footer
3. incluir CTA unico por correo
4. evitar bloques largos de texto
5. usar tablas de datos para trazabilidad

## 8) Pruebas y depuracion

## 8.1 Checklist rapido

1. remitente verificado
2. key valida
3. restart de app tras cambio de env
4. disparar evento real
5. validar logs backend y dashboard del proveedor

## 8.2 Logs esperados

- exito: sin errores y marca de envio en DB cuando aplica
- error proveedor:
  - `[Email] Resend error: ...`
  - `[Email] MailerSend error: ...`

## 8.3 SQL de control para pagos

```sql
select payment_id, status, payer_email, email_sent, updated_at
from payment_events
order by created_at desc
limit 20;
```

Interpretacion:

- `email_sent=true` confirma envio exitoso de confirmacion de pago

## 9) Fallbacks y comportamiento

- si correo falla, el pago/suscripcion no se revierte
- se registra warning de envio
- se puede reintentar por evento de negocio (webhook/reconcile)

## 10) Seguridad

- no guardar keys reales en docs
- rotar keys expuestas en conversaciones/herramientas externas
- mantener secretos solo en env seguro por entorno
