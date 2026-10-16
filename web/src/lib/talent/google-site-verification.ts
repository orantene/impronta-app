/**
 * Per-talent Google Search Console verification token: parse what the talent
 * pastes (bare token or the full `<meta ...>` tag) into a safe token.
 */
const TOKEN_SHAPE = /^[A-Za-z0-9_-]{1,100}$/;
const CONTENT_ATTR = /content\s*=\s*(?:"([^"]*)"|'([^']*)')/i;

export type ParsedVerificationToken =
  | { ok: true; token: string | null }
  | { ok: false; error: "invalid_token" };

/** Empty input clears the token (ok, null). Anything unsafe is rejected, never stripped. */
export function parseGoogleSiteVerificationInput(input: unknown): ParsedVerificationToken {
  if (typeof input !== "string") return { ok: false, error: "invalid_token" };
  const raw = input.trim();
  if (!raw) return { ok: true, token: null };
  let candidate = raw;
  if (raw.includes("<") || /content\s*=/i.test(raw)) {
    const m = CONTENT_ATTR.exec(raw);
    if (!m) return { ok: false, error: "invalid_token" };
    candidate = (m[1] ?? m[2] ?? "").trim();
  }
  return TOKEN_SHAPE.test(candidate) ? { ok: true, token: candidate } : { ok: false, error: "invalid_token" };
}

/** Defence-in-depth for values read back from the database. */
export function sanitizeStoredVerificationToken(value: unknown): string | null {
  return typeof value === "string" && TOKEN_SHAPE.test(value) ? value : null;
}
