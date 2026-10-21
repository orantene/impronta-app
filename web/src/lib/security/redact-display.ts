/**
 * Display-side redaction for admin surfaces (P0, Commerce health). Thin names
 * over the shared helper in `./redact-secrets` (TUL-1049) so existing imports
 * keep working; all logic lives there.
 */
import { maskSecret, redactSecretsInText, redactUrl } from "./redact-secrets";

export { maskSecret };

/** `https://host/path`; malformed input yields a fixed placeholder, never the raw string. */
export function redactUrlForDisplay(raw: string | null | undefined): string {
  return redactUrl(raw);
}

/** Scrub free text (error messages, details): URLs reduced, secret tokens masked. */
export function scrubSecretsInText(text: string | null | undefined): string {
  return redactSecretsInText(text);
}
