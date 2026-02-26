# Plan de mejoras del chat — YD Social Ops

Documento de planificación para las mejoras identificadas en el asistente de IA del chat.

---

## Resumen de mejoras

| # | Mejora | Prioridad | Estado | Impacto |
|---|--------|-----------|--------|---------|
| 1 | Fallback entre modelos Groq | Alta | ✅ Hecho | Más resiliencia ante cuota |
| 2 | Historial de conversación | Alta | Hecho | Evita bucles, pérdida de contexto |
| 3 | Campo dirección en tenant | Media | Hecho | Respuestas completas |
| 4 | Mejoras system prompt | Media | Hecho | Menos ambigüedad, menos repetición |
| 5 | Disponibilidad por fechas | Baja | Opcional | Depende del negocio |
| 6 | Consistencia datos de transferencia | Alta | ✅ Hecho | Bot comparte datos cuando cliente pide transferir |

---

## 6. Consistencia datos de transferencia

**Problema (revisión de logs):** El bot a veces no compartía los datos bancarios cuando el cliente pedía "datos de transferencia" o "quiero transferir", ofreciendo en su lugar links de pago (no disponibles sin MP conectado).

**Causa:** Instrucciones del prompt no suficientemente enfáticas; el modelo podía priorizar ofrecer links de pago.

**Solución aplicada:**
1. Reforzar el prompt de transferencia en `buildContactInstructions`:
   - Indicar explícitamente: "Los links de pago NO están disponibles. Tu ÚNICA opción es compartir los datos de transferencia."
   - Añadir: "NUNCA digas que no puedes proporcionarlos. Los datos están abajo, compártelos."
   - Palabras clave: "datos de transferencia", "transferir", "datos bancarios" → incluir datos INMEDIATAMENTE
2. Mejorar UI en settings: clarificar que con "Link de pago" sin MP conectado, el bot usará datos bancarios.

**Configuración del tenant relevante:**
- `contact_action = payment_link` + `mp_access_token` null → usa transferencia (bank_details)
- `contact_action = payment_link` + MP conectado → usa generate_payment_link
- Datos bancarios deben estar configurados en la pestaña Pagos para que el bot pueda compartirlos

**Archivos:** `lib/ai-service.ts`, `components/dashboard/settings-client.tsx`

---

## 1. Fallback entre modelos Groq

**Problema:** Cuando `llama-3.3-70b-versatile` alcanza su límite (1K RPD), el sistema pasa a Gemini. Groq tiene otros modelos con más cuota (ej. `llama-3.1-8b-instant` con 14.4K RPD).

**Solución:** Si el modelo principal de Groq falla (429, cuota), intentar con modelos alternativos de Groq antes de pasar a Gemini.

**Cadena Groq:**
1. `GROQ_MODEL` o `llama-3.3-70b-versatile` (principal)
2. `llama-3.1-8b-instant` (14.4K RPD)
3. `allam-2-7b` (7K RPD)

**Archivos:** `lib/ai-providers.ts`

---

## 2. Historial de conversación

**Problema:** El bot solo recibe el mensaje actual. No tiene memoria de lo dicho antes. Causa:
- Bucles al decir "si" repetidamente
- Pérdida de contexto (ej. "si y dime la direccion")
- Respuestas que ignoran confirmaciones previas

**Solución:** Cargar los últimos N mensajes de `chat_logs` por `session_id` y enviarlos como historial a la IA.

**Detalles:**
- Consultar `chat_logs` donde `session_id = request.session_id`
- Ordenar por `created_at ASC`
- Limitar a ~10–20 vueltas (user + assistant) para no exceder contexto
- Construir `AIMessage[]` con `user_message` y `bot_response` alternados
- Añadir el mensaje actual del usuario al final

**Archivos:** `lib/ai-service.ts`, posiblemente `actions/chat-logs.ts` o query directa en ai-service

---

## 3. Campo dirección en tenant

**Problema:** Cuando el cliente pregunta "dime la dirección", el bot no tiene datos.

**Solución:**
1. Añadir columna `business_address` (TEXT, nullable) en tabla `tenants`
2. Migración Supabase
3. Incluir en el system prompt cuando exista: "DIRECCIÓN: {address}"
4. Añadir campo en el formulario de configuración del tenant (settings)

**Archivos:** 
- Migración SQL
- `types/index.ts` (Tenant)
- `lib/ai-service.ts` (buildSystemPrompt)
- Componente de settings del tenant

---

## 4. Mejoras del system prompt

**Problema:** Varios comportamientos mejorables:
- Respuestas cortas ("2", "si") mal interpretadas
- Repetición excesiva de la misma información
- Respuesta vaga cuando preguntan "qué modelo de IA eres"

**Solución:** Añadir instrucciones al system prompt:

```
CONTEXTO Y AMBIGÜEDAD:
- Si el cliente responde con una sola palabra o número ("2", "si", "ok"), interpreta según la última pregunta que hiciste (ej. "2" = 2 noches si preguntaste cuántas noches).
- Si no está claro, pregunta amablemente para aclarar.

CONCISIÓN:
- No repitas información que ya hayas dado en la conversación. Si el cliente ya sabe el precio o los horarios, no los vuelvas a mencionar salvo que pregunte.

IDENTIDAD:
- Si te preguntan qué modelo de IA eres, responde que eres un asistente de IA de [nombre del negocio] y evita detalles técnicos.
```

**Archivos:** `lib/ai-service.ts` (buildSystemPrompt)

---

## 5. Disponibilidad por fechas (opcional)

**Problema:** El bot dice "no tengo información sobre los días disponibles".

**Solución:** Depende del negocio:
- **Opción A:** Añadir tabla `availability` o campo en productos para fechas
- **Opción B:** Instruir al bot: "Si preguntan por fechas disponibles, indica que deben contactar directamente al negocio" y ofrecer el canal de contacto

**Archivos:** Por definir si se implementa Opción A

---

## Orden de implementación sugerido

1. **Fallback Groq** — Cambio rápido, mejora resiliencia
2. **Historial de conversación** — Mayor impacto en UX
3. **Mejoras system prompt** — Sin cambios de schema
4. **Campo dirección** — Requiere migración y UI
5. **Disponibilidad** — Opcional
