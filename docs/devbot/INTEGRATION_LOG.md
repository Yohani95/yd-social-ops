# Integration Log (DevBot)

Registro de mejoras/integraciones de alto impacto detectadas en cada corrida.

## 2026-03-04 (UTC)
- **Propuesta:** Endpoint `/api/health` + integración con monitor externo (UptimeRobot/BetterUptime) para alertas de disponibilidad API/webhooks.
- **Impacto:** Detección temprana de caídas, reducción de MTTR y visibilidad operativa para pagos, inbox y webhooks.
- **Estado:** Implementado parcial (endpoint básico listo).
- **Próximos pasos:** Configurar monitor externo con alertas (email/Slack), añadir chequeo opcional de DB/latencia si se requiere.

- **Propuesta:** Asegurar `/api/webhooks/outgoing` con token y usarlo para alertas automáticas (n8n → Slack/Telegram) en eventos críticos.
- **Impacto:** Evita abuso del endpoint público y habilita notificaciones confiables de pagos, nuevos leads y fallas.
- **Estado:** Implementado parcial (validación opcional por header).
- **Próximos pasos:** Definir `OUTGOING_WEBHOOK_TOKEN` en envs y configurar workflow en n8n con destino Slack/Telegram.
