# Social Ops — Lista de ingeniería y roadmap

Checklist de mejoras y tareas futuras para YD Social Ops. Consolidado para seguimiento en repo y, cuando corresponda, en ClickUp (lista "Social Ops").

**Documentos relacionados:** [CONFIGURACION.md](./CONFIGURACION.md), [MEJORAS-CHAT.md](./MEJORAS-CHAT.md), [AI-PROVIDERS.md](./AI-PROVIDERS.md).

---

## 1. Ubicación y mapas

- [ ] Mejorar el manejo de ubicación del negocio (campos, validación, uso en prompt y respuestas).
- [ ] Integrar mapas interactivos para visualizar y localizar comercios o servicios (ej. embed de Google Maps / Mapbox por `business_address` o coordenadas).

---

## 2. Chatbot y personalización

Objetivo: que el bot sea **más hábil en la conversación** para concretar la venta o el negocio.

- [ ] Profundizar la personalización del chatbot según el tipo de negocio (`business_type`: products, services, professional, mixed).
- [ ] Permitir configuraciones específicas por rubro (ventas, consultoras, servicios, etc.).
- [ ] Evaluar la creación de **skills** orientados a que la conversación cierre mejor:
  - **Ventas:** catálogo, precios, stock, pago/transferencia; preguntas de cierre, sugerencia de cantidad o complementos.
  - **Consultoría:** agenda, servicios, contacto; calificación del lead, propuesta de siguiente paso.
  - **Servicios:** reservas, disponibilidad, horarios; confirmación clara y recordatorios sugeridos.
  - Otros modelos de negocio (definir según casos de uso).

---

## 3. Métricas y analítica

- [ ] Productos o servicios más consultados (a partir de `chat_logs` + `product_id` / intents).
- [ ] Frecuencia de consultas por categoría o canal.
- [ ] Interacciones más relevantes del chatbot (conversiones, intención de compra, uso de links de pago).
- [ ] Definir almacenamiento y visualización (nuevas tablas/vistas, dashboard o export).

---

## 4. Automatización e integraciones

- [ ] Integrar automatizaciones personalizadas usando **n8n** (webhooks salientes, triggers desde el SaaS, o API n8n).
- [ ] Permitir que el chatbot ayude a configurar automatizaciones (guías o flujos sugeridos) y sugerir mejoras operativas según el tipo de negocio.
- [ ] Evaluar un **segundo chatbot o herramienta** dedicada a configuración y optimización (asistente interno vs. bot de ventas/atención).

---

## 5. Planes y arquitectura

- [ ] Definir claramente qué funcionalidades e integraciones incluye cada plan (Básico, Pro, Enterprise) en documentación y/o UI.
- [ ] Agregar un **plan personalizado** para clientes que requieran arquitectura propia, integraciones avanzadas (APIs, n8n, CRMs) o soluciones a medida.

---

## 6. Asignación por plan de suscripción (recomendada)

Al implementar las mejoras anteriores, asignar por plan según la tabla siguiente. Usar como referencia al documentar qué incluye cada suscripción.

| Mejora o integración | Plan |
|----------------------|------|
| Ubicación mejorada (campos, validación, uso en prompt) | Básico |
| Mapas interactivos (embed para localizar comercio/servicio) | Pro |
| Personalización por rubro | Básico (base) + Pro (más opciones) |
| Skills para concretar venta | Básico (1 skill según tipo) / Pro (elegir + ajustes) / Enterprise (todos + custom) |
| Métricas básicas (últimas conversaciones, contador de intenciones) | Básico |
| Métricas clave (productos más consultados, frecuencia por categoría/canal, conversiones) | Pro |
| Métricas avanzadas y export (reportes, históricos, API de analítica) | Enterprise |
| Integración n8n (automatizaciones, webhooks) | Enterprise |
| Chatbot que ayude a configurar automatizaciones / sugerir mejoras | Enterprise (o Pro limitado) |
| Segundo chatbot (configuración y optimización) | Enterprise |
| Plan personalizado (arquitectura propia, integraciones a medida) | Personalizado |

**Resumen por plan (lo nuevo a agregar):**

- **Básico:** Ubicación mejorada, personalización base por rubro, un skill según tipo de negocio, métricas básicas.
- **Pro:** Mapas interactivos, más opciones de personalización y elección de skill + ajustes de cierre, métricas clave.
- **Enterprise:** Skills completos y custom, métricas avanzadas y export, n8n, asistente de configuración/mejoras, segundo bot de optimización si se evalúa.
- **Personalizado:** Todo lo anterior + arquitectura propia, integraciones avanzadas, soluciones a medida.

---

## 7. Gestión y ClickUp

- [ ] **Integrar** esta lista en las metas del MCP en **ClickUp**: crear o vincular la lista "Social Ops" en ClickUp y alinear los ítems de las secciones 1–5 como tareas o metas del proyecto, usando el MCP de ClickUp cuando se ejecute la integración.

### Cómo integrar con ClickUp

1. En ClickUp, crea una **Lista** llamada **Social Ops** (en el espacio/carpeta del proyecto YD Social Ops).
2. Crea **tareas** por cada ítem de las secciones 1–5 de este documento (ubicación y mapas, chatbot y personalización, métricas, automatización n8n, planes y arquitectura). Puedes usar las subsecciones como agrupación (ej. una tarea "Ubicación y mapas" con subtareas para cada bullet).
3. Si usas el **MCP de ClickUp** (con `CLICKUP_API_KEY` y `CLICKUP_TEAM_ID` configurados), puedes automatizar la creación de la lista y tareas con las herramientas del MCP (p. ej. `create_list`, `create_task`) alineadas a este roadmap.
