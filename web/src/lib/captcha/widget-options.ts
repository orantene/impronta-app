/**
 * Captcha widget options, ONE place (TUL-123).
 *
 * Turnstile is the low-friction provider: `interaction-only` keeps it invisible
 * unless Cloudflare decides a click is needed. Every guest surface (the booking
 * field's explicit render and the server-rendered form widgets) derives its
 * options from here so they cannot drift.
 */
import { hcaptchaLocale, turnstileLocale } from "@/lib/i18n/vendor-locale";

export type CaptchaProvider = "hcaptcha" | "turnstile";
export type TurnstileAppearance = "always" | "execute" | "interaction-only";

/** Height reserved up front for a VISIBLE widget so nothing shifts when it paints. */
export const CAPTCHA_MIN_HEIGHT_PX = 78;

/**
 * Turnstile in interaction-only mode is invisible, so it reserves no space.
 * `always` (and hCaptcha) need the visible widget height up front.
 */
export function captchaReservedHeightPx(
  provider: CaptchaProvider,
  appearance: TurnstileAppearance = "interaction-only",
): number {
  if (provider === "hcaptcha") return CAPTCHA_MIN_HEIGHT_PX;
  return appearance === "always" ? CAPTCHA_MIN_HEIGHT_PX : 0;
}

export type TurnstileCallbacks = {
  callback: (token: string) => void;
  onExpired: () => void;
  onError: () => void;
  onTimeout: () => void;
};

/** Options for `turnstile.render(el, opts)` (explicit render). */
export function turnstileRenderOptions(
  siteKey: string,
  locale: string | null | undefined,
  cb: TurnstileCallbacks,
  theme?: "light" | "dark",
  appearance: TurnstileAppearance = "interaction-only",
): Record<string, unknown> {
  const language = turnstileLocale(locale);
  return {
    sitekey: siteKey,
    appearance,
    retry: "auto",
    "refresh-expired": "auto",
    ...(language ? { language } : {}),
    ...(theme ? { theme } : {}),
    callback: cb.callback,
    "expired-callback": cb.onExpired,
    "error-callback": cb.onError,
    "timeout-callback": cb.onTimeout,
  };
}

/** Options for `hcaptcha.render(el, opts)` (explicit render). */
export function hcaptchaRenderOptions(
  siteKey: string,
  locale: string | null | undefined,
  cb: Pick<TurnstileCallbacks, "callback" | "onExpired" | "onError">,
): Record<string, unknown> {
  const hl = hcaptchaLocale(locale);
  return {
    sitekey: siteKey,
    ...(hl ? { hl } : {}),
    callback: cb.callback,
    "expired-callback": cb.onExpired,
    "error-callback": cb.onError,
  };
}

/**
 * `data-*` attributes for the SERVER-RENDERED Turnstile div (implicit render,
 * used by native HTML forms). The global handler names are defined by
 * `CaptchaFormGuard`.
 */
export function turnstileDataAttrs(
  siteKey: string,
  locale: string | null | undefined,
): Record<string, string> {
  const language = turnstileLocale(locale);
  return {
    "data-sitekey": siteKey,
    "data-appearance": "interaction-only",
    "data-retry": "auto",
    "data-refresh-expired": "auto",
    "data-callback": "__tulalaCaptchaDone",
    "data-error-callback": "__tulalaCaptchaError",
    "data-timeout-callback": "__tulalaCaptchaError",
    "data-expired-callback": "__tulalaCaptchaExpired",
    ...(language ? { "data-language": language } : {}),
  };
}

export function captchaRetryCopy(locale: string | null | undefined): {
  message: string;
  retry: string;
} {
  const es = (locale ?? "").toLowerCase().startsWith("es");
  return es
    ? {
        message: "No pudimos verificar que eres una persona. Toca para reintentar.",
        retry: "Reintentar",
      }
    : {
        message: "We couldn't verify you're a person. Tap to try again.",
        retry: "Try again",
      };
}

// ── Error / retry state machine ──────────────────────────────────────────────

export type CaptchaUiState = "loading" | "ready" | "verified" | "failed";
export type CaptchaUiEvent = "token" | "expired" | "error" | "script_failed" | "retry";

export function nextCaptchaUiState(state: CaptchaUiState, event: CaptchaUiEvent): CaptchaUiState {
  switch (event) {
    case "token":
      return "verified";
    case "expired":
      return "ready";
    case "error":
    case "script_failed":
      return state === "verified" ? "verified" : "failed";
    case "retry":
      return state === "failed" ? "loading" : state;
  }
}

/** Submit is allowed only once a token exists. */
export function captchaSubmitAllowed(state: CaptchaUiState): boolean {
  return state === "verified";
}
