/**
 * Display-side redaction for admin surfaces (P0, Commerce health).
 *
 * Admin pages may show WHERE something points, never the secrets inside it:
 *   - URLs: `https://host/path` only. Every query param and fragment is dropped
 *     (e.g. `x-vercel-protection-bypass`), as are userinfo credentials.
 *   - Keys/secrets: `…` + last 4 chars, never a prefix such as sk_live_.
 * Pure and dependency-free so it can run on the server before data reaches
 * a client component.
 */

/** `https://host/path`; malformed input yields a fixed placeholder, never the raw string. */
export function redactUrlForDisplay(raw: string | null | undefined): string {
  if (!raw) return "";
  try {
    const u = new URL(raw.trim());
    if (u.protocol !== "http:" && u.protocol !== "https:") return "[redacted url]";
    return `${u.protocol}//${u.host}${u.pathname}`;
  } catch {
    return "[redacted url]";
  }
}

/** `…abcd` for any secret; short or empty values reveal nothing. */
export function maskSecret(raw: string | null | undefined): string {
  const s = (raw ?? "").trim();
  if (s.length < 12) return "…";
  return `…${s.slice(-4)}`;
}

const URL_RE = /\bhttps?:\/\/[^\s"'<>)]+/gi;
// Stripe secret/restricted/publishable keys, webhook signing secrets, masked forms (sk_test_****abcd).
const SECRET_RE = /\b(?:sk|rk|pk)_(?:live|test)_[A-Za-z0-9*]+|\bwhsec_[A-Za-z0-9*+/=]+/g;

/** Scrub free text (error messages, details): URLs reduced, secret tokens masked. */
export function scrubSecretsInText(text: string | null | undefined): string {
  if (!text) return "";
  return text
    .replace(URL_RE, (m) => redactUrlForDisplay(m))
    .replace(SECRET_RE, (m) => maskSecret(m.replace(/\*/g, "")));
}
