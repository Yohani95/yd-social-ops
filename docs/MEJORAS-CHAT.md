# Mejoras del chat - estado actual

Documento de referencia para evolucion del asistente IA en conversaciones comerciales.

## Implementado

- [x] Memoria por `session_id` y contexto reciente.
- [x] Captura de datos de contacto via `capture_contact_data`.
- [x] Prompt por tipo de negocio y tono configurable.
- [x] Persistencia en CRM (`contacts`) y memoria (`conversation_memory`).
- [x] Integracion con inbox (`conversation_threads/messages`).
- [x] Backfill de `chat_logs` legacy hacia inbox.
- [x] Manejo de cobro segun `merchant_checkout_mode`.
- [x] Audio inbound Meta con transcripcion/fallback.

## Mejoras aplicadas en pagos conversacionales

- [x] Deteccion de pago acreditado en contexto de conversacion.
- [x] Confirmacion proactiva al cliente cuando llega webhook de pago aprobado.
- [x] Preservacion de link de pago en respuesta final del bot.
- [x] Trazabilidad outbound de confirmacion en inbox (`author_type=bot`).

## Pendientes recomendados

- [ ] Reducir respuestas repetitivas en conversaciones largas.
- [ ] Mejorar desambiguacion de intencion en reservas/servicios complejos.
- [ ] Guardrails extra para dominios sensibles (legal/salud/finanzas avanzadas).
- [ ] Reintentos inteligentes de transcripcion cuando hay audio invalido.
- [ ] Dashboard de calidad: precision de intent + conversion + resolucion.

## Archivos clave

- `lib/ai-service.ts`
- `lib/ai-providers.ts`
- `lib/audio-transcription.ts`
- `app/api/webhooks/meta/route.ts`
- `app/api/webhooks/payment/route.ts`
- `app/api/bot/[tenant_id]/route.ts`
- `lib/inbox.ts`

## Criterios de calidad

- respuesta accionable en pocas lineas
- no inventar productos/servicios
- no exponer secretos ni IDs internos al cliente final
- respetar el modo de cobro configurado del tenant
