/**
 * Rate limit opcional para no superar la cuota gratuita de la API de IA.
 * Límite por tenant_id y por minuto (configurable vía AI_RATE_LIMIT_PER_MINUTE).
 * En memoria; para múltiples instancias usar Redis más adelante.
 */

const WINDOW_MS = 60 * 1000; // 1 minuto

// tenant_id -> timestamps de requests en la ventana
const store = new Map<string, number[]>();

function prune(tenantId: string): void {
  const now = Date.now();
  const timestamps = store.get(tenantId) ?? [];
  const valid = timestamps.filter((t) => now - t < WINDOW_MS);
  if (valid.length === 0) store.delete(tenantId);
  else store.set(tenantId, valid);
}

export interface RateLimitResult {
  allowed: boolean;
  retryAfterSeconds?: number;
  currentCount: number;
  limit: number;
}

/**
 * Comprueba si el tenant puede hacer una request más.
 * Si AI_RATE_LIMIT_PER_MINUTE no está definido, siempre permite (sin límite).
 */
export function checkAIRateLimit(tenantId: string): RateLimitResult {
  const limit = process.env.AI_RATE_LIMIT_PER_MINUTE
    ? parseInt(process.env.AI_RATE_LIMIT_PER_MINUTE, 10)
    : 0;

  if (!limit || limit <= 0) {
    return { allowed: true, currentCount: 0, limit: 0 };
  }

  prune(tenantId);
  const timestamps = store.get(tenantId) ?? [];
  const now = Date.now();

  if (timestamps.length >= limit) {
    const oldest = Math.min(...timestamps);
    const retryAfterSeconds = Math.ceil((oldest + WINDOW_MS - now) / 1000);
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, retryAfterSeconds),
      currentCount: timestamps.length,
      limit,
    };
  }

  timestamps.push(now);
  store.set(tenantId, timestamps);

  return {
    allowed: true,
    currentCount: timestamps.length,
    limit,
  };
}
