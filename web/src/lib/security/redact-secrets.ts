/**
 * redact-secrets.ts (TUL-1049, P0) — the ONE server-side redactor for anything
 * an HQ / platform-admin / health view prints about webhooks, URLs or provider
 * errors. Pure and dependency-free; call it on the server before data reaches
 * a client component.
 *
 * Beyond the earlier query-string stripping it also:
 *   - drops path segments that are (or look like) secrets, so a bypass token
 *     embedded as `/hooks/<token>/stripe` cannot survive;
 *   - removes the literal value of any configured secret env var (bypass secret,
 *     Stripe keys) wherever it appears, URL-encoded or not;
 *   - masks Stripe key shapes to `…last4` (never a prefix) in free text.
 */

const SECRET_ENV_NAMES = [
  "VERCEL_AUTOMATION_BYPASS_SECRET",
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "STRIPE_SECRET_KEY_TEST",
  "STRIPE_SECRET_KEY_LIVE",
] as const;

/** `…abcd` for any secret; short or empty values reveal nothing. */
export function maskSecret(raw: string | null | undefined): string {
  const s = (raw ?? "").trim();
  if (s.length < 12) return "…";
  return `…${s.slice(-4)}`;
}

/** Remove the literal values of configured secrets (raw and URL-encoded) from text. */
export function stripKnownSecretValues(text: string, env: Record<string, string | undefined> = process.env): string {
  let out = text;
  for (const name of SECRET_ENV_NAMES) {
    const v = env[name]?.trim();
    if (!v || v.length < 8) continue;
    for (const form of new Set([v, encodeURIComponent(v)])) out = out.split(form).join("[redacted]");
  }
  return out;
}

const BYPASS_NAME_RE = /bypass|protection|token|secret|signature|sig|key|auth|password|passwd/i;
const STRIPE_SHAPE_RE = /^(?:(?:sk|rk|pk)_(?:live|test)_|whsec_)/i;

/** True for a path segment that is probably a credential rather than a route word. */
export function looksLikeSecretSegment(seg: string): boolean {
  if (!seg) return false;
  if (STRIPE_SHAPE_RE.test(seg)) return true;
  if (seg.length >= 20 && /^[A-Za-z0-9_\-+=.%]+$/.test(seg) && /\d/.test(seg) && /[A-Za-z]/.test(seg)) return true;
  if (seg.length >= 32 && /^[A-Za-z0-9_\-+=]+$/.test(seg)) return true;
  return false;
}

/** `https://host/path` only: query, fragment, userinfo dropped; secret-looking path segments replaced. */
export function redactUrl(raw: string | null | undefined): string {
  if (!raw) return "";
  try {
    const u = new URL(stripKnownSecretValues(raw.trim()));
    if (u.protocol !== "http:" && u.protocol !== "https:") return "[redacted url]";
    const segs = u.pathname.split("/");
    const out = segs.map((seg, i) => {
      if (looksLikeSecretSegment(seg)) return "[redacted]";
      // `/bypass/<value>`, `/token/<value>`: the segment after a credential-ish word.
      if (i > 0 && BYPASS_NAME_RE.test(segs[i - 1]) && seg && !/^(?:stripe|resend|webhooks?|events?)$/i.test(seg) && /\d/.test(seg)) {
        return "[redacted]";
      }
      return seg;
    });
    return `${u.protocol}//${u.host}${out.join("/")}`;
  } catch {
    return "[redacted url]";
  }
}

const URL_RE = /\bhttps?:\/\/[^\s"'<>)]+/gi;
const SECRET_RE = /\b(?:sk|rk|pk)_(?:live|test)_[A-Za-z0-9*]+|\bwhsec_[A-Za-z0-9*+/=]+/g;
const BYPASS_PAIR_RE = /(?:x-vercel-(?:protection-bypass|set-bypass-cookie)|vercel[_-]?bypass|bypass[_-]?secret)\s*[=:]\s*[^\s"'<>&,;)]+/gi;
const BEARER_RE = /\b(?:Authorization\s*:\s*)?Bearer\s+[A-Za-z0-9._~+/=-]{8,}/gi;

/** Scrub free text (error messages, details): known values removed, URLs reduced, secret tokens masked. */
export function redactSecretsInText(text: string | null | undefined): string {
  if (!text) return "";
  return stripKnownSecretValues(text)
    .replace(URL_RE, (m) => redactUrl(m))
    .replace(BYPASS_PAIR_RE, "[redacted bypass]")
    .replace(BEARER_RE, "[redacted bearer]")
    .replace(SECRET_RE, (m) => maskSecret(m.replace(/\*/g, "")));
}
