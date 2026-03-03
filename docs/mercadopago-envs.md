# Mercado Pago - Matriz canonica de ambientes (SaaS)

Documento operativo para evitar mezcla de app/token/plan/webhook.

## 1) Regla de oro

No mezclar entre ambientes:

1. `MP_ACCESS_TOKEN`
2. `MP_PREAPPROVAL_PLAN_*`
3. webhooks configurados
4. `MP_CLIENT_ID` / `NEXT_PUBLIC_MP_CLIENT_ID`

Si se mezclan, el checkout puede aprobar pero tu tenant no se actualiza correctamente.

## 2) Ambientes oficiales

## 2.1 SANDBOX_LOCAL

Uso:

- pruebas en local con ngrok
- buyer/seller de prueba

Variables:

- `MP_ACCESS_TOKEN` de sandbox
- `MP_PREAPPROVAL_PLAN_*` de sandbox
- `MP_PLAN_*_LINK` de sandbox
- `MP_SAAS_BACK_URL_BASE=https://<ngrok>`

Webhook sugerido:

- `https://<ngrok>/api/webhooks/saas-subscription`

## 2.2 PRODUCCION

Uso:

- dominio desplegado `https://social.yd-engineering.cl`

Variables:

- `MP_ACCESS_TOKEN` productivo
- `MP_PREAPPROVAL_PLAN_*` productivos
- `MP_PLAN_*_LINK` productivos

Webhook:

- `https://social.yd-engineering.cl/api/webhooks/saas-subscription`

## 3) Webhook dual (recomendado)

Configurar ambos en MP:

1. URL para prueba -> ngrok local
2. URL productiva -> dominio real

Topicos minimos:

- `subscription_preapproval`
- `subscription_authorized_payment`
- `subscription_preapproval_plan`
- `payment` (auditoria)

## 4) Flujo SaaS correcto

1. `/pricing` -> `/subscribe` (login obligatorio)
2. `Settings > Pagos` llama `POST /api/billing/subscribe`
3. checkout MP con `external_reference=tenant_id`
4. webhook SaaS actualiza tenant/subscriptions/events
5. si webhook se retrasa, usar `POST /api/billing/reconcile`

## 5) Interaccion con emails

Sincronizacion y notificacion usan estas fuentes:

1. `POST /api/webhooks/saas-subscription`
   - actualiza estado
   - envia email cuando hay cambio real
2. `POST /api/billing/reconcile`
   - converge estado manualmente
   - envia email cuando detecta cambio real
3. `POST /api/billing/subscribe` con `scheduled_downgrade`
   - envia email de confirmacion de cambio programado

## 6) Validacion rapida de entorno

Checklist antes de probar:

1. `MP_ACCESS_TOKEN` y plan IDs son del mismo ambiente
2. webhook del mismo ambiente
3. `MP_WEBHOOK_SECRET` coincide con app MP actual
4. local usa `.env.local`, produccion usa `.env.production`

## 7) Troubleshooting

## 7.1 `Una de las partes... es de prueba`

- se mezclo comprador/seller/app entre test y real
- corregir a un solo ambiente coherente

## 7.2 `401 Unauthorized access to resource`

- token no autorizado para ese recurso
- revisar ownership de plan y collector

## 7.3 Pago aprobado pero no cambia plan

1. revisar logs webhook
2. validar evento en `saas_billing_events`
3. ejecutar `POST /api/billing/reconcile`

## 7.4 No vuelve a tu app

- falta `back_url` valido en checkout
- iniciar flujo desde `POST /api/billing/subscribe`

## 8) Politica de documentacion

- no incluir tokens/secretos reales
- no incluir credenciales personales
- usar placeholders en todo ejemplo
