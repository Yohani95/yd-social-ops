# Proveedores de IA — YD Social Ops

Documentación para el agente y desarrolladores: qué proveedores usamos, límites, modelos y cómo funciona el fallback.

---

## Configuración actual

| Variable | Valor actual | Descripción |
|----------|--------------|-------------|
| `AI_PROVIDER` | `groq` | Proveedor principal |
| `GROQ_MODEL` | *(por defecto)* `llama-3.3-70b-versatile` | Modelo Groq |
| `GEMINI_MODEL` | `gemini-2.5-flash-lite` | Modelo Gemini (fallback) |
| `AI_CHAT_HISTORY_LIMIT` | `10` | Vueltas de historial por sesión (1-20) |

**Archivo:** `lib/ai-providers.ts` — sistema unificado con fallback automático.

---

## Fallback automático

Si el proveedor principal falla (cuota, error 429, timeout), se prueba en orden:

| Si falla… | Entonces prueba… |
|-----------|------------------|
| **groq** | gemini → openai |
| **gemini** | groq → openai |
| **openai** | groq → gemini |

Para cambiar el proveedor principal, edita `AI_PROVIDER` en `.env.local`:
- `groq` — recomendado (más cuota gratis)
- `gemini` — alternativo
- `openai` — de pago

---

## Groq (proveedor principal)

- **Costo:** Gratis
- **API:** https://console.groq.com
- **Variable:** `GROQ_API_KEY`
- **Modelo por defecto:** `llama-3.3-70b-versatile` (o `GROQ_MODEL` en `.env.local`)
- **Fallback entre modelos:** Si el modelo principal alcanza cuota (429), prueba automáticamente: `llama-3.1-8b-instant` → `allam-2-7b` antes de pasar a Gemini.

### Modelos Groq y límites (RPM / RPD / TPM / TPD)

| Modelo | RPM | RPD | TPM | TPD | Uso recomendado |
|--------|-----|-----|-----|-----|-----------------|
| **llama-3.3-70b-versatile** | 30 | 1K | 12K | 100K | **Actual** — mejor calidad, function calling |
| **llama-3.1-8b-instant** | 30 | **14.4K** | 6K | **500K** | Más volumen diario |
| **allam-2-7b** | 30 | 7K | 6K | 500K | Alternativa ligera |
| **meta-llama/llama-4-maverick-17b-128e-instruct** | 30 | 1K | 6K | 500K | Llama 4 |
| **meta-llama/llama-4-scout-17b-16e-instruct** | 30 | 1K | 30K | 500K | Llama 4, más TPM |
| **qwen/qwen3-32b** | **60** | 1K | 6K | 500K | Más RPM |
| **moonshotai/kimi-k2-instruct** | **60** | 1K | 10K | 300K | Más RPM |
| **groq/compound** | 30 | 250 | 70K | - | Compound |
| **groq/compound-mini** | 30 | 250 | 70K | - | Compound mini |
| **whisper-large-v3** | 20 | 2K | - | - | Audio (transcripción) |
| **whisper-large-v3-turbo** | 20 | 2K | - | - | Audio turbo |
| **meta-llama/llama-guard-4-12b** | 30 | 14.4K | 15K | 500K | Seguridad |
| **meta-llama/llama-prompt-guard-2-22m** | 30 | 14.4K | 15K | 500K | Seguridad |
| **meta-llama/llama-prompt-guard-2-86m** | 30 | 14.4K | 15K | 500K | Seguridad |
| **canopylabs/orpheus-*** | 10 | 100 | 1.2K | 3.6K | Árabe/inglés |

**RPM** = requests/minuto · **RPD** = requests/día · **TPM** = tokens/minuto · **TPD** = tokens/día

Para cambiar de modelo Groq:
```env
GROQ_MODEL=llama-3.1-8b-instant
```

---

## Google Gemini (fallback)

- **Costo:** Gratis (tier limitado)
- **API:** https://aistudio.google.com/apikey
- **Variable:** `GEMINI_API_KEY`
- **Modelo actual:** `gemini-2.5-flash-lite`

### Modelos Gemini y límites (tier gratuito, pueden variar)

| Modelo | RPM | RPD | Notas |
|--------|-----|-----|-------|
| **gemini-2.5-flash-lite** | 10 | ~20–1K* | Actual — varía por región |
| **gemini-2.5-flash** | 5–10 | ~20–250 | Más capaz |
| **gemini-2.5-pro** | 5 | ~100 | Máxima calidad |
| **gemini-2.0-flash** | 15 | ~200 | Alternativa |
| **gemma-3-1b-it** | - | - | Modelo ligero, más cuota en algunos planes |

*Los límites de Gemini pueden variar por cuenta/región. Revisar en Google AI Studio.

Para cambiar de modelo Gemini:
```env
GEMINI_MODEL=gemini-2.5-flash
```

---

## OpenAI (fallback, de pago)

- **Costo:** ~$0.15/1M tokens input (gpt-4o-mini)
- **API:** https://platform.openai.com/api-keys
- **Variable:** `OPENAI_API_KEY`
- **Modelo:** `gpt-4o-mini` (fijo en código)

---

## Resumen para el agente

1. **Proveedor principal:** Groq (`AI_PROVIDER=groq`)
2. **Modelo Groq:** `llama-3.3-70b-versatile` (o el que esté en `GROQ_MODEL`)
3. **Fallback:** Si Groq falla → Gemini → OpenAI
4. **Más volumen:** Cambiar a `llama-3.1-8b-instant` (14.4K RPD)
5. **Más calidad:** Mantener `llama-3.3-70b-versatile` o usar Gemini como principal
