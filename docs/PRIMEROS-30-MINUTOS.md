# Primeros 30 minutos

Guia operativa para duenos de negocio y equipos comerciales.

## Objetivo 1: vender hoy

1. Ir a `Canales` y confirmar que al menos un canal este activo.
2. Ir a `Campanas` y crear una campana corta con mensaje claro.
3. Ejecutar `Enviar ahora`.
4. Revisar respuestas en `Bandeja`.
5. Revisar estado en `Campanas > Resumen de ejecucion`.

Resultado esperado: primera activacion comercial con trazabilidad de enviados, fallidos y respuestas.

## Objetivo 2: automatizar respuestas

1. Ir a `Workflows`.
2. Crear un workflow base de venta o soporte.
3. Definir trigger, condiciones y acciones.
4. Ejecutar `Probar`.
5. Publicar y activar.

Resultado esperado: menos trabajo manual y respuestas consistentes.

## Objetivo 3: enrutar al equipo

1. Ir a `Routing`.
2. Crear reglas por equipo (`ventas`, `soporte`, `general`).
3. Definir prioridad y condiciones (intencion, canal, etapa).
4. Guardar y validar en `Bandeja`.

Resultado esperado: cada lead llega al equipo correcto sin triage manual.

## Objetivo 4: medir resultados

1. Ir a `Metricas` para salud del bot (latencia, repeticion, fallback).
2. Ir a `Analitica` para conversion y revenue por canal.
3. Ajustar workflows/campanas en base a datos, no intuicion.

Resultado esperado: mejora continua con criterios objetivos.

## Campanas: que esperar al usar "Enviar ahora"

- El sistema intenta enviar a la audiencia que cumple filtros.
- El envio puede quedar mixto: algunos contactos `sent` y otros `failed`.
- `failed` no significa que toda la campana fallo, significa que ese contacto/canal no permitio el envio.
- Filtros `Tag`, `Canal puntual` y `Etapa` son opcionales.
- Formato actual de campanas: texto + imagen opcional por URL publica.
- Recomendacion operativa: usar `WhatsApp` como canal principal. `Instagram` y `Messenger` quedan en beta controlada.

## Campanas programadas: como funciona

- Puedes elegir fecha y hora exacta desde la pantalla de campanas.
- Un cron unico (`/api/cron/worker`) procesa campanas vencidas automaticamente junto con la cola de mensajes.
- Si necesitas forzar ejecucion inmediata, usa `Ejecutar programadas`.
- `Enviar ahora` siempre permite forzar el envio de la campana seleccionada.

## Errores comunes en Instagram/Messenger

Meta puede rechazar mensajes por politicas del canal. Casos frecuentes:

- `You cannot send messages to this id`: el destinatario no esta habilitado para DM.
- `No se encontro al usuario correspondiente`: ID invalido o usuario no disponible.
- `fuera del periodo permitido`: fuera de la ventana de mensajeria de Meta.

Accion recomendada:

1. Revisar canal, identificador y ventana de mensajeria.
2. Reintentar solo contactos validos.
3. Usar `Bandeja` para continuar manualmente donde falle automatizacion.

## Diferencia entre Workflows y Routing

- `Workflows`: definen que hace el sistema (responder, cambiar etapa, etiquetar, webhook).
- `Routing`: define a quien se asigna la conversacion (equipo/agente).

Regla simple:

1. Workflow decide la accion.
2. Routing decide el responsable.

## Estado de salud (Workflows y Routing)

- `Activo`: regla/flujo listo y operando.
- `Incompleto`: falta al menos una accion clave (workflow) o setup requerido por contexto.
- `Inactivo`: existe, pero no esta publicando cambios en operacion.

Evidencia operativa visible:

- Workflows: ultima corrida, estado de corrida, corridas y fallidas de las ultimas 24h.
- Routing: ultima aplicacion y aplicaciones en las ultimas 24h por regla.

## Servicios con agenda (dentista, cabanas, reservas)

- El bot puede recopilar fecha/hora y datos basicos de reserva por chat.
- Hoy la agenda se coordina de forma manual (chat/WhatsApp). No hay sincronizacion nativa con Google Calendar.
- Si no quieres pedir agenda en la primera respuesta, configura tus servicios con disponibilidad por cupo/stock y usa reserva solo cuando el cliente confirme.

## Que hace el modulo QA (solo desarrollo)

`QA` no es una pantalla para cliente final. Es una herramienta interna para validar el release.

Suites actuales:

- `smoke`: carga de paginas core sin errores.
- `flows`: CRUD y flujos principales (workflows, routing, campanas, inbox).
- `bot-scorecard`: calidad conversacional por escenario e intencion.

Se usa antes de liberar cambios y en CI, no como parte de operacion diaria del cliente.

## Orden recomendado de menu

- Operacion diaria: `Dashboard`, `Guia 30 min`, `Bandeja`, `Campanas`, `Pagos`, `Metricas`.
- Configuracion y automatizacion: `Workflows`, `Routing`, `Catalogo`, `Canales`, `Integraciones`, `Configuracion`.
- Analitica y soporte tecnico: `Contactos`, `Chat Logs`, `Analitica`, `Setup` y herramientas avanzadas.

## Release gate sugerido

Antes de deploy:

1. `npm run qa:smoke`
2. `npm run qa:flows`
3. `npm run qa:bot-scorecard`

Si alguna suite falla, corregir antes de publicar.
