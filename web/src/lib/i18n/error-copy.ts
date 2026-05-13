/**
 * Centralized error-copy lexicon (C.1).
 *
 * Single source of truth for user-facing error strings keyed by `reason`
 * code. Server actions return `{ ok: false, error: ..., reason: "rate_limited" }`
 * and the UI looks up display copy here per locale, falling back to the
 * raw `error` string when no code matches.
 *
 * Codes are deliberately stable + short — adding a new one is cheap; renaming
 * is expensive. Use snake_case to match Postgres / engine convention.
 */

export type ErrorCopyEntry = {
  en: string;
  es: string;
};

export const ERROR_COPY: Record<string, ErrorCopyEntry> = {
  // ── Authorization / authentication
  forbidden: {
    en: "You don't have access to do that.",
    es: "No tienes acceso para hacer esto.",
  },
  unauthenticated: {
    en: "Please sign in to continue.",
    es: "Inicia sesión para continuar.",
  },
  session_expired: {
    en: "Your session has expired. Please sign in again.",
    es: "Tu sesión expiró. Inicia sesión de nuevo.",
  },

  // ── Validation
  validation_failed: {
    en: "Please fix the highlighted fields and try again.",
    es: "Corrige los campos resaltados e intenta de nuevo.",
  },
  invalid_input: {
    en: "One or more fields are invalid.",
    es: "Uno o más campos no son válidos.",
  },
  required_field_missing: {
    en: "Please fill in all required fields.",
    es: "Completa todos los campos obligatorios.",
  },

  // ── Resource state
  not_found: {
    en: "We couldn't find what you were looking for.",
    es: "No encontramos lo que buscas.",
  },
  already_exists: {
    en: "That already exists.",
    es: "Ya existe.",
  },
  version_conflict: {
    en: "Someone else updated this — refresh and try again.",
    es: "Otra persona actualizó esto. Recarga e intenta de nuevo.",
  },

  // ── Throttling / transient
  rate_limited: {
    en: "You're going a bit fast — wait a moment and try again.",
    es: "Vas un poco rápido. Espera un momento e intenta de nuevo.",
  },
  network_error: {
    en: "Connection issue — check your network and try again.",
    es: "Problema de conexión. Revisa tu red e intenta de nuevo.",
  },
  timeout: {
    en: "That took too long — try again in a moment.",
    es: "Tardó demasiado. Intenta de nuevo en un momento.",
  },

  // ── Engine / domain-specific
  no_requirement_group: {
    en: "This inquiry isn't set up correctly. Contact the agency.",
    es: "Esta consulta no está configurada correctamente. Contacta a la agencia.",
  },
  insufficient_seats: {
    en: "Your plan's roster is full. Upgrade to add more talent.",
    es: "El roster de tu plan está lleno. Actualiza para agregar más talento.",
  },
  payment_required: {
    en: "Payment required to continue.",
    es: "Se requiere pago para continuar.",
  },
  feature_not_enabled: {
    en: "This feature isn't enabled on your plan.",
    es: "Esta función no está habilitada en tu plan.",
  },

  // ── Catch-all
  unexpected: {
    en: "Something unexpected happened. Try again or contact support.",
    es: "Pasó algo inesperado. Intenta de nuevo o contacta soporte.",
  },
};

export type ErrorLocale = "en" | "es";

/**
 * Resolve display copy for a reason code. Falls back to `fallbackEn`
 * (or the reason code itself) when no entry exists, so old/unknown codes
 * still render something readable.
 */
export function resolveErrorCopy(
  reason: string | null | undefined,
  locale: ErrorLocale = "en",
  fallbackEn?: string,
): string {
  if (!reason) return fallbackEn ?? ERROR_COPY.unexpected[locale];
  const entry = ERROR_COPY[reason];
  if (entry) return entry[locale];
  return fallbackEn ?? reason;
}

/**
 * Format a `rate_limited` engine response into a user-facing message that
 * includes the actual retry-after window. Engine paths return
 * `{ rateLimited: true, retryAfterMs }`; this helper produces "try again
 * in 7s" / "try again in 2 min" so the user isn't guessing.
 *
 * C5 — Rate-limited action UI from inquiry-booking-improvement-plan.
 */
export function formatRateLimitedCopy(
  retryAfterMs: number | null | undefined,
  locale: ErrorLocale = "en",
): string {
  // No timing info — fall back to the generic copy.
  if (!retryAfterMs || retryAfterMs <= 0) return ERROR_COPY.rate_limited[locale];

  const seconds = Math.ceil(retryAfterMs / 1000);
  if (seconds < 60) {
    return locale === "es"
      ? `Vas un poco rápido. Intenta de nuevo en ${seconds}s.`
      : `Going a bit fast — try again in ${seconds}s.`;
  }
  const minutes = Math.ceil(seconds / 60);
  return locale === "es"
    ? `Vas un poco rápido. Intenta de nuevo en ${minutes} min.`
    : `Going a bit fast — try again in ${minutes} min.`;
}
