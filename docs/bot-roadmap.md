# Bot Roadmap: Coherencia y Automatización Multicanal

Version: 2026-03-03  
Estado del documento: Especificación de análisis (sin cambios productivos)

## Estado actual (confirmado en código)

### Capacidades ya disponibles
- Soporte operativo de conversación por `web`, `whatsapp`, `messenger`, `instagram`, `tiktok`.
- Entrada y salida de mensajes centralizada con `processMessage` y persistencia en `chat_logs`.
- Inbox multicanal con `conversation_threads` y `conversation_messages`.
- Persistencia de memoria breve en `conversation_memory` (TTL 24h).
- Detección de intención (`purchase_intent`, `inquiry`, `complaint`, `greeting`, `unknown`).
- Captura de contacto con tool `capture_contact_data` y actualización de `contacts`.
- Simulador de canales en dashboard para probar comportamiento de bot por canal.
- Fallback de proveedores IA (`groq`, `gemini`, `openai`).

### Límites actuales
- Instagram actual opera DM (`entry[].messaging[]`), sin flujo de comentarios públicos como evento conversacional.
- Suscripción Meta para Messenger/Instagram limitada a `messages,messaging_postbacks`.
- La inferencia usa historial desde `chat_logs`; `conversation_memory` no actúa como resumen principal optimizado por sesión/canal.
- Configuración funcional del bot en UI está limitada a nombre, tono y bienvenida.
- No existe motor de automatización por evento/canal con reglas y umbral de confianza.
- No existe tablero de calidad conversacional (coherencia, repetición, desvío de intención, fallback humano).

## Qué falta incluir

### P0 (bloqueante para coherencia y operación segura)
- Configuración avanzada del bot por tenant y por canal.
- Motor de reglas por evento (`dm`, `comment`, `mention`, `story_reply`) con fallback humano.
- Pipeline de evaluación continua de calidad (offline + online) con métricas objetivas.
- Estructura normalizada de eventos conversacionales y trazabilidad por canal.
- Feature flags por tenant/canal para activar sin romper flujo actual.

### P1 (alto impacto, no bloqueante inicial)
- Ingesta Instagram comentarios y decisión automática: responder público, mover a DM o escalar.
- Dataset curado para RAG desde catálogo, FAQ y conversaciones históricas etiquetadas.
- Políticas anti-repetición y manejo de contexto largo por sesión.
- Dashboard de calidad por canal/tenant con tendencias semanales.

### P2 (madurez operativa)
- Experimentos A/B de prompts/políticas por segmento.
- Auto-ajuste de umbrales según métricas históricas.
- Librería de playbooks por industria reutilizable.

## Roadmap 90 días

### Fase 1 (Semanas 1-2): Baseline de coherencia y observabilidad

Objetivo:
- Definir una línea base medible de calidad y trazabilidad sin cambiar comportamiento productivo.

Entregables:
- Especificación de eventos normalizados y catálogo de métricas.
- Definición de dataset inicial extraído de `chat_logs`, `conversation_messages`, `contacts`.
- Protocolo de evaluación de coherencia/repetición/fallback humano.
- Documento de contratos de datos para calidad.

Criterio de salida:
- Métricas baseline disponibles por canal.
- Definiciones de evaluación aprobadas sin ambigüedad.
- Inventario de fuentes de datos y cobertura por canal completado.

### Fase 2 (Semanas 3-4): Configuración avanzada del bot

Objetivo:
- Habilitar configuración operativa granular por tenant y por canal, con defaults conservadores.

Entregables:
- Especificación de `TenantBotConfig` y `ChannelAutomationRule`.
- Contratos API para lectura/escritura de configuración.
- Política de seguridad para cambios de configuración (roles, validaciones, límites).
- Catálogo de defaults para producción y pruebas.

Criterio de salida:
- Contratos API congelados para implementación.
- Defaults definidos para todos los canales soportados.
- Reglas mínimas de seguridad y validación documentadas.

### Fase 3 (Semanas 5-7): Instagram foco (comentarios + DM)

Objetivo:
- Diseñar flujo completo de comentarios Instagram con política segura de respuesta.

Entregables:
- Modelo de evento de comentario público + mención + reply en story.
- Matriz de decisión: responder público, abrir DM o escalar a agente.
- Definición de umbral de confianza y reglas de no-respuesta.
- Especificación de trazabilidad en inbox para eventos de comentario.

Criterio de salida:
- Política “reglas + score + fallback humano” cerrada y testeable.
- Flujos de comentario->DM y comentario->agente definidos sin decisiones pendientes.
- Reglas de idempotencia para eventos de comentario documentadas.

### Fase 4 (Semanas 8-10): Entrenamiento operativo (RAG + evaluación continua)

Objetivo:
- Mejorar coherencia del bot con datos propios y ciclo de mejora continua.

Entregables:
- Diseño de pipeline RAG (ingesta, chunking, retrieval, ranking, ensamblado de contexto).
- Proceso de etiquetado y revisión semanal de errores reales.
- Criterios automáticos para detectar repetición y respuesta inconsistente.
- Playbook de retraining operacional (sin detener producción).

Criterio de salida:
- Protocolo semanal de mejora definido y repetible.
- Conjunto inicial de conocimiento cargable por tenant.
- Métricas objetivo por canal establecidas.

### Fase 5 (Semanas 11-12): Hardening y rollout

Objetivo:
- Activar cambios de forma progresiva y reversible, sin impacto en continuidad.

Entregables:
- Estrategia canary por tenant/canal.
- Plan de rollback inmediato por feature flags.
- Checklist de salida a producción y monitoreo post-release.
- Runbook de incidentes de bot multicanal.

Criterio de salida:
- Rollout por oleadas definido.
- Reversión validada en procedimiento estándar.
- Checklist de producción aprobado.

## Diseño objetivo de entrenamiento

Estrategia elegida:
- `RAG + evaluación continua`.

### Principios
- No depender de fine-tuning como primera opción.
- Priorizar grounding con datos de negocio (catálogo, políticas, FAQ, historial curado).
- Separar claramente “conocimiento estable” de “contexto conversacional de sesión”.

### Pipeline RAG propuesto
1. Ingesta
- Fuentes: `products`, contenido FAQ de tenant, respuestas validadas de `chat_logs`, notas operativas.
- Frecuencia: diaria incremental + carga manual bajo demanda.

2. Normalización
- Limpieza de texto, remoción de PII no necesaria, versionado por tenant.
- Clasificación por canal y tema (pago, despacho, reserva, soporte, etc.).

3. Segmentación
- Chunking semántico por unidad útil de respuesta.
- Metadatos obligatorios: `tenant_id`, `channel`, `source`, `topic`, `updated_at`, `confidence`.

4. Retrieval
- Búsqueda híbrida (léxica + semántica), ranking por relevancia y frescura.
- Filtros por `tenant` y `channel`.

5. Ensamblado de contexto
- Límite de bloques por respuesta para evitar ruido.
- Prioridad por canal activo + intención detectada + etapa del funnel.

6. Evaluación continua
- Batch semanal sobre conversaciones reales.
- Medición automática de coherencia, repetición, utilidad, derivación correcta.

### Ciclo de mejora semanal
- Recolectar casos fallidos y near-miss.
- Etiquetar causa raíz (`knowledge_gap`, `policy_gap`, `prompt_gap`, `routing_gap`).
- Ajustar reglas/prompts/knowledge.
- Re-ejecutar evaluación y comparar contra baseline.

## Diseño objetivo por canal

### Objetivo común multicanal
- Mantener consistencia de marca y políticas, permitiendo especialización por formato.

### Web
- Mantener flujo actual.
- Añadir override de tono/extensión si tenant lo define.

### WhatsApp
- Priorizar respuestas cortas y accionables.
- Fallback a agente en baja confianza o temas sensibles.

### Messenger
- Mantener compatibilidad con payload actual.
- Aplicar mismas reglas de automatización por evento DM.

### TikTok
- Mantener parser actual de DM.
- Añadir política de contención para mensajes ambiguos.

### Instagram (foco)
- DM: mantener flujo actual.
- Comentarios: añadir evento público con 3 caminos:
- `public_reply` (solo si confianza alta y tema permitido).
- `dm_followup` (cuando conviene mover conversación privada).
- `human_handoff` (baja confianza, riesgo reputacional o tema sensible).

### Política elegida para comentarios IG
- `Reglas + score + fallback humano`.
- No responder automático en público cuando:
- score de confianza bajo umbral.
- intención no clara.
- presencia de lenguaje sensible/riesgoso.
- detección de reclamo complejo o potencial crisis.

## APIs, tipos y tablas a incorporar

Nota:
- Todo lo siguiente es especificación para implementación futura.

### Tipos nuevos

`TenantBotConfig`
- `id: string (uuid)`
- `tenant_id: string (uuid)`
- `default_tone: "formal" | "amigable" | "informal"`
- `max_response_chars_by_channel: Record<channel, number>`
- `coherence_window_turns: number`
- `repetition_guard_enabled: boolean`
- `fallback_to_human_enabled: boolean`
- `fallback_confidence_threshold: number (0-1)`
- `sensitive_topics_policy: "strict" | "moderate" | "relaxed"`
- `channel_overrides: Record<channel, object>`
- `created_at: string (iso)`
- `updated_at: string (iso)`

`ChannelAutomationRule`
- `id: string (uuid)`
- `tenant_id: string (uuid)`
- `channel: "web" | "whatsapp" | "messenger" | "instagram" | "tiktok"`
- `event_type: "dm" | "comment" | "mention" | "story_reply"`
- `is_active: boolean`
- `allowed_actions: Array<"auto_reply" | "public_reply" | "open_dm" | "handoff_agent" | "ignore">`
- `confidence_threshold: number (0-1)`
- `quiet_hours_policy: object | null`
- `safety_policy_ref: string | null`
- `priority: number`
- `created_at: string (iso)`
- `updated_at: string (iso)`

`ConversationEvent`
- `id: string (uuid)`
- `tenant_id: string (uuid)`
- `channel: "web" | "whatsapp" | "messenger" | "instagram" | "tiktok"`
- `event_type: "dm" | "comment" | "mention" | "story_reply"`
- `event_idempotency_key: string`
- `source_message_id: string | null`
- `source_author_id: string`
- `content: string`
- `metadata: Record<string, unknown>`
- `classification: object | null`
- `decision: "auto_reply" | "public_reply" | "open_dm" | "handoff_agent" | "ignore" | null`
- `thread_id: string | null`
- `processed: boolean`
- `processed_at: string | null`
- `created_at: string (iso)`

### Endpoints planificados

`GET /api/bot/config`
- Objetivo: obtener configuración efectiva del bot para tenant autenticado.
- Respuesta: `{ success, data: TenantBotConfig }`.

`PUT /api/bot/config`
- Objetivo: actualizar configuración del bot.
- Validación: límites por canal, thresholds entre 0 y 1, roles permitidos.
- Respuesta: `{ success, data: TenantBotConfig }`.

`GET /api/channels/:id/automation-rules`
- Objetivo: listar reglas de automatización por canal.
- Respuesta: `{ success, data: ChannelAutomationRule[] }`.

`PUT /api/channels/:id/automation-rules`
- Objetivo: reemplazo transaccional de reglas del canal.
- Respuesta: `{ success, data: ChannelAutomationRule[] }`.

`GET /api/bot/quality`
- Objetivo: dashboard API para métricas de coherencia/repitencia/fallback.
- Filtros: `from`, `to`, `channel`, `tenant`.
- Respuesta: `{ success, data: QualityMetrics }`.

`POST /api/bot/knowledge/import`
- Objetivo: cargar/actualizar fuentes de conocimiento para RAG por tenant.
- Entrada: fuente + versión + contenido.
- Respuesta: `{ success, data: { imported, skipped, errors } }`.

### Extensión planificada del webhook Meta
- Ampliar parser/routing para eventos de comentarios de Instagram además de DM.
- Requisitos:
- idempotencia por `event_idempotency_key`.
- mapeo determinístico a `ConversationEvent`.
- decisión por reglas antes de responder.

### Tablas planificadas

`tenant_bot_configs`
- Configuración global y por canal del bot por tenant.

`channel_automation_rules`
- Reglas activas por `tenant + channel + event_type`.

`conversation_events`
- Registro canónico de eventos inbound/outbound por canal y tipo.

`bot_knowledge_chunks`
- Bloques de conocimiento versionados para retrieval.

`bot_quality_events`
- Evidencias de evaluación de calidad por respuesta/evento.

## Riesgos y mitigaciones

Riesgo:
- Respuestas públicas erróneas en comentarios Instagram.

Mitigación:
- Política de score mínimo + allowlist de temas + fallback humano.

Riesgo:
- Duplicidad de respuestas por reintentos de webhook.

Mitigación:
- Idempotencia estricta por clave de evento y locking transaccional.

Riesgo:
- Degradación de latencia con pipeline RAG.

Mitigación:
- Cache por tenant/canal/intención y límites de contexto.

Riesgo:
- Configuración incorrecta por usuario.

Mitigación:
- Defaults conservadores, validación server-side y preview antes de publicar.

Riesgo:
- Sobreautomatización sin control de calidad.

Mitigación:
- Métricas obligatorias + alertas + rollback por flags.

## KPIs y metas

Horizonte de control:
- baseline semanal y objetivo a 90 días.

KPIs principales:
- Coherencia conversacional (score evaluador): meta `+20%` vs baseline.
- Tasa de repetición (respuestas semánticamente repetidas): meta `-30%`.
- Derivación correcta a agente en baja confianza: meta `>=95%`.
- Precisión de intención en top-1: meta `>=85%`.
- Tiempo de primera respuesta automática: meta `<=3s` P95.
- Errores por duplicidad webhook: meta `0` en producción.
- Tasa de resolución sin intervención humana por canal:
- web/whatsapp/messenger: meta `>=60%`.
- instagram comentarios: meta `>=40%` sin incidentes reputacionales.

KPIs secundarios:
- Cobertura de conocimiento por tenant.
- Ratio de respuestas con grounding válido.
- Conversión a siguiente paso (DM, pago, reserva, contacto).

## Plan de rollout sin romper producción

### Principios
- No reemplazar flujos actuales de una vez.
- Activar por tenant y por canal con flags.
- Siempre mantener camino de rollback inmediato.

### Fases de activación
1. Shadow mode
- Procesar nuevos eventos y decisiones sin ejecutar acción externa.
- Comparar decisiones nuevas vs comportamiento actual.

2. Canary controlado
- Activar en tenants internos o de bajo riesgo.
- Monitoreo reforzado de calidad e incidentes.

3. Expansión gradual
- Aumentar cobertura por cohortes de tenant/canal.
- Frenar automáticamente si se supera umbral de error.

4. General availability
- Activación amplia solo con metas cumplidas y sin regresiones críticas.

### Reglas de rollback
- Si sube error crítico o baja calidad por debajo de umbral:
- desactivar feature flag del canal afectado.
- volver a modo actual de DM únicamente.
- registrar incidente y causa raíz.

### Checklist de salida a producción
- Contratos API versionados y documentados.
- Idempotencia validada en todos los webhooks afectados.
- Métricas y alertas activas por canal.
- Playbook de incidentes y handoff operativo disponible.
- Pruebas de regresión de DM multicanal aprobadas.

## Casos de prueba y escenarios de aceptación

### No regresión
- DM en `web`, `whatsapp`, `messenger`, `instagram`, `tiktok` continúa operativo.
- Inbox conserva trazabilidad inbound/outbound sin cambios de integridad.

### Instagram comentarios
- Evento de comentario se clasifica y se enruta según regla configurada.
- Baja confianza deriva a agente y no responde en público.
- Comentario elegible puede abrir DM con mensaje de continuidad.

### Seguridad y estabilidad
- Reintento de webhook no duplica respuesta.
- Cambios de configuración inválidos son rechazados con error claro.
- Feature flags permiten apagar solo un canal sin afectar los demás.

### Calidad conversacional
- Conversaciones largas reducen repetición respecto a baseline.
- Respuesta mantiene coherencia de intención y política de negocio.
- Métricas de calidad visibles por canal y tenant.

## Supuestos y defaults cerrados
- Archivo destino: `docs/bot-roadmap.md`.
- Horizonte: 90 días por fases.
- Alcance: multicanal con foco Instagram.
- Estrategia de mejora: RAG + evaluación continua.
- Política de comentarios Instagram: reglas + score + fallback humano.
- Esta iteración es solo análisis/documentación y no modifica rutas API, adapters, UI ni migraciones.
