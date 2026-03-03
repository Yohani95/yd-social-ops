# Roadmap - YD Social Ops

Version: 2026-03-02

Estado real despues de los cambios en pagos, inbox, webhooks y emails transaccionales.

## 1) Hecho

## 1.1 Pagos y suscripciones

- [x] Doble flujo MP separado:
  - SaaS Billing
  - Merchant Checkout
- [x] `POST /api/billing/subscribe`
- [x] `GET /api/billing/subscription`
- [x] `POST /api/billing/reconcile`
- [x] `POST /api/webhooks/saas-subscription` robusto (firma + idempotencia)
- [x] Reglas por plan (`basic` bloquea `mp_oauth`)
- [x] Downgrade programado (`scheduled_downgrade`)

## 1.2 Inbox

- [x] Modelo `conversation_threads` + `conversation_messages`
- [x] Estados `open|pending|closed`
- [x] APIs de inbox y respuesta manual
- [x] Backfill desde `chat_logs` idempotente
- [x] Paginacion operacional y fix de hidratacion

## 1.3 Meta y canales

- [x] Endpoints de test Meta por canal
- [x] Evidencia de review persistida en canal
- [x] Descarga de media con bearer y parser de audio mejorado

## 1.4 Emails transaccionales

- [x] Confirmacion de pago desde webhook payment
- [x] Notificacion de estado SaaS desde webhook/reconcile
- [x] Notificacion de `scheduled_downgrade`
- [x] Destinatarios de pago: `tenant.email` + `payer_email` cuando exista
- [x] Templates renovados (diseño HTML)
- [x] Compatibilidad de key:
  - `re_...` (Resend)
  - `mlsn...` (MailerSend)

## 1.5 Calidad tecnica

- [x] Build en verde (`npm run build`)
- [x] Migraciones dual MP + inbox + escalado + trial/plan changes

## 2) Siguiente iteracion

## 2.1 Email y entregabilidad

- [ ] Branding corporativo final de templates (logo, paleta, firma)
- [ ] Historial de notificaciones en dashboard (timeline por tenant)
- [ ] Metricas de entregabilidad (delivery/bounce/reject)

## 2.2 Billing v2

- [ ] Portal de facturacion owner (historial y acciones)
- [ ] Retry automatizado para eventos SaaS no procesados
- [ ] Export financiero por tenant

## 2.3 Inbox v2

- [ ] Asignacion por agente
- [ ] SLA/etiquetas por thread
- [ ] Notificaciones realtime de operador

## 2.4 Calidad y deuda

- [ ] Reducir deuda de lint legacy fuera del scope actual
- [ ] Seguir modularizando componentes grandes de settings/channels

## 3) Criterio de salida a produccion

- [x] Build estable
- [x] Flujos SaaS/merchant operativos
- [x] Inbox manual operativo
- [x] Webhooks funcionando con idempotencia
- [x] Emails transaccionales activos
- [ ] Smoke E2E automatizado para pagos + inbox + canales
