# Guía de configuración — YD Social Ops

**Para quién es esta guía:** para **ti**, el desarrollador o dueño de YD Social Ops. No es para tus clientes (los negocios que venden por Facebook/WhatsApp). Ellos solo usan tu app; no tocan Meta Developers ni Mercado Pago. Aquí configuras **tu** backend: la app de Meta (para que tu servidor reciba mensajes), los planes en Mercado Pago (para que te paguen la suscripción) y las variables de entorno y webhooks.

Esta guía explica paso a paso cómo configurar **la app de Meta** (WhatsApp y Messenger) y **los planes de suscripción en Mercado Pago**.

**Documentación relacionada:** [AI-PROVIDERS.md](./AI-PROVIDERS.md) — proveedores de IA (Groq, Gemini, OpenAI), modelos, límites y fallback.

---

## 1. App de Meta (WhatsApp y Messenger)

WhatsApp Business y Messenger usan la misma plataforma de Meta. Necesitas **una sola app** en Facebook Developers.

### 1.1 Crear la app

1. Entra a **https://developers.facebook.com/apps/**
2. Clic en **Crear app** → elige **Otro** → **Consumer** (o **Business** si solo quieres uso empresarial).
3. Nombre: por ejemplo `YD Social Ops`.
4. Correo de contacto y cuenta de negocio (opcional). Crear app.

### 1.2 Añadir WhatsApp

1. En el panel de tu app, en **Agregar productos**, busca **WhatsApp** y clic en **Configurar**.
2. Elige **WhatsApp Business Platform** (la API en la nube).
3. Te asignan un número de prueba. Para producción luego tendrás que vincular tu número Business.
4. En **WhatsApp** → **Configuración** (o **API Setup**):
   - Anota el **Phone number ID** y el **WhatsApp Business Account ID** (los usarás al conectar un tenant).

### 1.3 Añadir Messenger (opcional)

1. En **Agregar productos**, añade **Messenger**.
2. En **Messenger** → **Configuración**:
   - Conecta una **Página de Facebook**. Sin página no puedes recibir mensajes.
   - Anota el **Page ID** (lo usarás para identificar el canal).

### 1.4 Configurar el webhook (obligatorio para recibir mensajes)

Meta envía los mensajes de WhatsApp, Messenger e Instagram a **una sola URL** que tú defines.

1. En tu app de Meta, ve a **Configuración** → **Básica**.
   - Anota **ID de la app** y **Clave secreta de la app** (App Secret). Son tu `META_APP_ID` y `META_APP_SECRET`.

2. **WhatsApp** → **Configuración** → **Webhook**:
   - **URL de devolución de llamada:**  
     `https://social.yd-engineering.cl/api/webhooks/meta`
   - **Token de verificación:** el mismo valor que pusiste en `.env` como `META_WEBHOOK_VERIFY_TOKEN` (ej. `yd-social-ops-meta-verify-2026`).
   - Clic en **Verificar y guardar**.
   - En **Campos de suscripción**, suscríbete al menos a **messages**.

3. **Messenger** → **Configuración** → **Webhook** (si usas Messenger):
   - Misma **URL:** `https://social.yd-engineering.cl/api/webhooks/meta`
   - Mismo **Token de verificación**.
   - Suscribir a **messages**, **messaging_postbacks**, etc. según lo que uses.

### 1.5 Variables de entorno

En tu servidor (Vercel, Railway, etc.) o en `.env.local`:

```env
META_APP_ID=tu_id_de_app
META_APP_SECRET=tu_clave_secreta
META_WEBHOOK_VERIFY_TOKEN=yd-social-ops-meta-verify-2026
```

Para que el botón “Conectar” de WhatsApp/Messenger funcione en el navegador, el **ID de la app** debe estar también en el cliente (el frontend construye la URL de OAuth). Añade en el mismo `.env`:

```env
NEXT_PUBLIC_META_APP_ID=tu_id_de_app
```

(El mismo valor que `META_APP_ID`; solo que `NEXT_PUBLIC_` lo expone al navegador de forma segura, porque el ID de app no es secreto.)

**Resumen Meta:** Una app → añades WhatsApp y/o Messenger → configuras una sola URL de webhook → esa URL es la que recibe los mensajes y tu backend responde con la API de Meta.

### 1.6 Cómo vinculan el chat tus clientes (usuarios del SaaS)

Tus clientes **no** entran a Meta Developers ni crean apps. Vinculan su chat **desde tu aplicación**:

1. El cliente inicia sesión en **YD Social Ops** (tu dominio, ej. `https://social.yd-engineering.cl`).
2. Entra a **Dashboard** → **Canales**.
3. Clic en **Agregar canal** y elige **WhatsApp**, **Messenger** o **Instagram**.
4. Tu app lo redirige a **Facebook/Meta** para que autorice con su cuenta (la cuenta de WhatsApp Business o la Página de Facebook que quiera conectar).
5. Meta devuelve al usuario a tu app (`/api/auth/meta/callback`). Tu backend guarda el token y los datos del canal (número de WhatsApp o página de Messenger) en la tabla `social_channels` asociados a ese **tenant**.
6. A partir de ahí, los mensajes que lleguen a ese número/página los recibe **tu** webhook (`/api/webhooks/meta`); tu backend identifica el tenant por el canal y responde con el bot.

En resumen: **ellos vinculan el chat desde tu app** (Dashboard → Canales → Agregar canal → autorizar en Meta). Tú solo debes tener configurada tu app de Meta y las variables de entorno; cada cliente conecta su propia cuenta una vez.

### 1.7 WhatsApp: solo número de prueba o sin número Business

- **Si solo tienes número de prueba (Meta te lo asigna):** Puedes usar la app igual. En **Canales** → **Detalles** del canal WhatsApp:
  - Si tras “Conectar con Meta” ves **phone_number_id** y **waba_id** en null, usa el botón **«Sincronizar número»**: obtiene el ID desde el token guardado sin volver a Facebook.
  - Si hace falta, usa **«Reconectar con Meta»** y autoriza de nuevo; el callback intenta rellenar esos IDs.
- **Para producción:** El cliente debe tener (o registrar) un **número de WhatsApp Business** en Meta. “WhatsApp normal” (solo personal) no se puede conectar a la API; hace falta cuenta/número Business. La parte de registro o vinculación del número se hace en **Meta** (tu app solo redirige a “Conectar con Meta” y guarda lo que Meta devuelve).

### 1.8 Instagram

- En la misma app de Meta, **Agregar productos** → **Instagram**.
- En **Instagram** → **Configuración** → **Webhook**, usa la **misma URL** que WhatsApp/Messenger:  
  `https://social.yd-engineering.cl/api/webhooks/meta`  
  y el mismo **Token de verificación**.
- Suscribir al menos a **messages**.
- La cuenta de Instagram debe ser **Profesional o Empresa** y estar vinculada a una **Página de Facebook**. Desde tu app, el cliente agrega canal **Instagram** y hace **Conectar con Meta**; se usa la misma OAuth y el backend guarda `ig_account_id` y el token para responder por DM.

### 1.9 Facebook Marketplace

Las conversaciones que un cliente inicia **desde un anuncio de Facebook Marketplace** llegan por **Messenger** a la misma **Página de Facebook** que publicó el anuncio. Meta no envía un tipo de objeto distinto para Marketplace; usa el mismo webhook `object: "page"` y la misma estructura `entry[].messaging[]`.

**Qué deben hacer tus clientes:** Conectar la **Página de Facebook** que usan para vender en Marketplace (Dashboard → Canales → Agregar canal → Messenger → Conectar con Meta). A partir de ahí, los mensajes que les escriban desde un anuncio de Marketplace serán recibidos por tu webhook y atendidos por el bot igual que cualquier mensaje de Messenger. No hace falta configurar nada adicional.

### 1.10 Checklist de verificación y prueba (Meta)

Antes de dar por cerrada la configuración de Meta, comprueba:

1. **Verificación del webhook**
   - En Meta Developers → WhatsApp (o Messenger) → Configuración → Webhook, URL y token de verificación configurados.
   - Clic en **Verificar y guardar**. Si falla: revisa que la URL sea accesible desde internet (en local usa ngrok o similar) y que `META_WEBHOOK_VERIFY_TOKEN` en el servidor coincida con el token que pusiste en Meta.
2. **Variables de entorno en el servidor**
   - `META_APP_ID`, `META_APP_SECRET`, `META_WEBHOOK_VERIFY_TOKEN`.
   - En el cliente (para el botón Conectar): `NEXT_PUBLIC_META_APP_ID` (mismo valor que `META_APP_ID`).
3. **Suscripciones**
   - WhatsApp y/o Messenger: al menos **messages** suscrito en Campos de suscripción del webhook.
4. **Conectar canal desde la app**
   - Dashboard → Canales → Agregar canal → WhatsApp o Messenger → Conectar con Meta.
   - Tras autorizar, comprobar que no haya `meta_error` en la URL y que el canal aparezca activo.
   - Para WhatsApp: si en Detalles del canal ves `phone_number_id` en blanco, usar **Sincronizar número**.
5. **Mensaje de prueba**
   - Enviar un mensaje al número de WhatsApp o a la Página.
   - Revisar logs del servidor: no debe aparecer "No channel found for...". Si aparece, el valor que Meta envía (phone_number_id o page_id) no coincide con el guardado en `social_channels`.
   - Comprobar que el usuario recibe la respuesta del bot y que en Dashboard → Chat Logs figure la conversación con el canal correcto.

---

## 2. Planes en Mercado Pago (suscripción del SaaS)

Los clientes pagan **tu** suscripción (Básico, Pro, Enterprise) con Mercado Pago. Tú creas un “link de pago” por plan; cuando pagan, MP te avisa por webhook y la app actualiza el tenant.

### 2.1 Crear tu app en Mercado Pago

1. Entra a **https://www.mercadopago.cl/developers**
2. **Tus integraciones** → **Crear aplicación** (o usa una existente).
3. Anota **Client ID** y **Client Secret** → son `MP_CLIENT_ID` y `MP_CLIENT_SECRET` (para el OAuth de tus clientes que conectan su MP).
4. Para **cobrar tú** la suscripción necesitas el **Access token** de **tu** cuenta:
   - En la app, **Credenciales** → **Access token** (producción o prueba).
   - Ese token es `MP_ACCESS_TOKEN` en el servidor.

### 2.2 Crear los “planes” (links de pago)

Tienes dos opciones: **links de pago únicos** (cobro mensual manual o un pago) o **suscripciones recurrentes**. La app actual espera **un pago** y actualiza al tenant cuando el webhook recibe ese pago.

#### Opción A: Links de pago por plan (Preferencias)

1. En **https://www.mercadopago.cl/developers** → tu app → **Herramientas** o usa la API de Preferencias.
2. Crea **3 preferencias** (una por plan), por ejemplo:
   - **Básico:** $9.990, título "YD Social Ops - Plan Básico (mensual)"
   - **Pro:** $24.990, título "YD Social Ops - Plan Pro (mensual)"
   - **Enterprise:** $79.990, título "YD Social Ops - Plan Enterprise (mensual)"

3. En cada preferencia, en **metadata** (o en la API al crear la preferencia) envía:
   - `plan_tier`: `"basic"` | `"pro"` | `"enterprise"`
   - El **email** del pagador lo envía MP en el webhook; si quieres forzar uno, puedes usar `payer_email` en metadata (la app lo usa si viene).

4. Obtén la **URL de pago** de cada preferencia (en la respuesta de la API es `init_point` o `sandbox_init_point`). Esas URLs son las que usarás en la página de precios.

#### Opción B: Suscripciones recurrentes (Preapproval)

Si quieres cobro automático cada mes, en Mercado Pago se hace con **Preapproval** (suscripciones). Creas un preapproval por plan y usas la URL que te da MP para que el usuario autorice el cobro recurrente. El webhook que tienes (`/api/webhooks/saas-subscription`) hoy está pensado para **payment** (un pago). Para suscripciones MP puede enviar eventos distintos; si más adelante quieres recurrencia, habría que escuchar también esos eventos y mapearlos a `plan_tier` y email.

Por ahora, lo más simple es **Opción A**: 3 links de pago (uno por plan). Cada mes puedes volver a enviar el mismo link o más adelante cambiar a Preapproval.

#### Crear una preferencia por API (para obtener el link)

Puedes crear cada preferencia con la API de Mercado Pago y copiar el `init_point`:

```bash
# Reemplaza TU_MP_ACCESS_TOKEN por tu Access Token de producción o prueba
curl -X POST https://api.mercadopago.com/checkout/preferences \
  -H "Authorization: Bearer TU_MP_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "items": [{ "title": "YD Social Ops - Plan Básico (mensual)", "quantity": 1, "unit_price": 9990, "currency_id": "CLP" }],
    "metadata": { "plan_tier": "basic" },
    "back_urls": { "success": "https://social.yd-engineering.cl/dashboard", "failure": "https://social.yd-engineering.cl/pricing", "pending": "https://social.yd-engineering.cl/pricing" },
    "auto_return": "approved"
  }'
```

En la respuesta verás `init_point` (o `sandbox_init_point` en pruebas). Ese es el valor de `MP_PLAN_BASIC_LINK`. Repite para Pro (24990, `plan_tier: "pro"`) y Enterprise (79990, `plan_tier: "enterprise"`).

### 2.3 Configurar el webhook de Mercado Pago

1. En la app de MP → **Webhooks** (o **Notificaciones**).
2. **URL de notificación:**  
   `https://social.yd-engineering.cl/api/webhooks/saas-subscription`
3. Eventos: al menos **Pagos** (payments).
4. MP te dará un **secret** para validar la firma. Ese valor es `MP_WEBHOOK_SECRET` en el servidor.

### 2.4 Variables de entorno para los planes

En el servidor (o `.env.local` para probar):

```env
# Tu cuenta SaaS (cobro a los clientes)
MP_CLIENT_ID=...
MP_CLIENT_SECRET=...
MP_ACCESS_TOKEN=...        # Token de TU cuenta para crear preferencias y leer pagos
MP_WEBHOOK_SECRET=...      # Secret del webhook de notificaciones

# Links de pago por plan (URLs que devuelve MP al crear cada preferencia)
MP_PLAN_BASIC_LINK=https://www.mercadopago.cl/checkout/v1/redirect?pref_id=...
MP_PLAN_PRO_LINK=https://www.mercadopago.cl/checkout/v1/redirect?pref_id=...
MP_PLAN_ENTERPRISE_LINK=https://www.mercadopago.cl/checkout/v1/redirect?pref_id=...
```

La página de precios (`/pricing`) usa estas variables. Si no están definidas, el botón “Suscribirse” lleva a `/register`.

### 2.5 Cómo sabe la app qué plan activar

Cuando un cliente paga:

1. Mercado Pago envía un POST a `https://social.yd-engineering.cl/api/webhooks/saas-subscription`.
2. La app lee el `payment_id`, consulta el pago con tu `MP_ACCESS_TOKEN` y obtiene:
   - `metadata.plan_tier` (basic | pro | enterprise)
   - `metadata.payer_email` o `payer.email`
3. Busca el tenant por `email` en la tabla `tenants` y actualiza:
   - `saas_subscription_status = 'active'`
   - `plan_tier` = el del pago
   - `saas_subscription_id` = id del pago

Por eso al crear las preferencias en MP **debes enviar en metadata** al menos `plan_tier`. El email puede venir del pagador (MP lo envía) o lo puedes fijar en metadata si el usuario ya está registrado.

---

## Resumen

Todo lo de esta guía lo hace **el desarrollador/dueño del SaaS** (tú), una sola vez. Los usuarios finales solo se registran, pagan y usan el dashboard.

| Qué | Dónde | Para qué |
|-----|--------|----------|
| **Meta App** | developers.facebook.com | Una app, WhatsApp + Messenger, una URL de webhook. |
| **Webhook Meta** | `https://social.yd-engineering.cl/api/webhooks/meta` | Recibir mensajes y responder por API. |
| **MP Preferencias** | 3 links (Básico, Pro, Enterprise) con metadata `plan_tier` | Que los clientes paguen tu suscripción. |
| **Webhook MP** | `https://social.yd-engineering.cl/api/webhooks/saas-subscription` | Activar el plan del tenant cuando pague. |
| **Env** | `META_*`, `MP_*`, `MP_PLAN_*_LINK` | Que la app y los botones usen tu dominio y tus links. |

Si quieres, en el siguiente paso podemos bajar esto a: “crear las 3 preferencias en Mercado Pago desde el código” (con la SDK o fetch) para que solo copies los links a las variables de entorno.
