/**
 * experiment-visitor-cookie.ts — ABTEST-1 first-party visitor id (PURE).
 *
 * A stable, first-party, anonymous visitor id used to keep a RETURNING anon
 * visitor in the SAME experiment arm across requests, independent of the IP +
 * user-agent fallback (which drifts when a visitor's IP changes — mobile
 * networks, proxies — or when several visitors share an egress IP). The proxy
 * mints + sets this cookie on a public render; the SSR seed resolver reads it
 * with precedence over the IP/UA fallback.
 *
 * DEGRADE-SAFE: nothing depends on the cookie existing. When it is absent (first
 * visit, cookies disabled, a path the proxy didn't set it on), the seed resolver
 * simply falls back to the IP/UA anon seed exactly as before — so behavior with
 * no cookie is byte-identical to the v1 engine. Signed-in visitors keep using
 * the auth-stable seed and never need this cookie.
 *
 * This module is PURE (no next/headers, no I/O) so it is usable from both the
 * Edge proxy and the node test runner. The value is an opaque random id; it
 * carries NO PII and is never sent to analytics (only the assigned arm is).
 */

/** Cookie name. First-party, host-only; readable by middleware + RSC. */
export const EXPERIMENT_VISITOR_COOKIE = "impronta_vid";

/** One year — long enough to keep a visitor in-arm across a campaign. */
export const EXPERIMENT_VISITOR_COOKIE_MAX_AGE_SECONDS = 365 * 24 * 60 * 60;

/** A visitor id is a 32-char url-safe token. Validated on read so a forged /
 *  malformed cookie can never widen the grammar or skew the hash unexpectedly. */
const VISITOR_ID_RE = /^[A-Za-z0-9_-]{16,64}$/;

/** True when `value` is a well-formed visitor id (the shape mint produces). */
export function isValidExperimentVisitorId(value: unknown): value is string {
  return typeof value === "string" && VISITOR_ID_RE.test(value);
}

/**
 * Mint a fresh opaque visitor id. Uses Web Crypto (available in the Edge
 * runtime + Node 18+) and falls back to Math.random only if unavailable, so it
 * never throws in any runtime. The output always satisfies {@link VISITOR_ID_RE}.
 */
export function mintExperimentVisitorId(): string {
  const bytes = new Uint8Array(18); // 18 bytes → 24 base64url chars.
  const g = globalThis as unknown as {
    crypto?: { getRandomValues?: (a: Uint8Array) => Uint8Array };
  };
  if (g.crypto?.getRandomValues) {
    g.crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i++) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }
  // base64url without padding — matches VISITOR_ID_RE.
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  const b64 =
    typeof btoa === "function"
      ? btoa(binary)
      : Buffer.from(bytes).toString("base64");
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export interface ExperimentVisitorCookieOptions {
  httpOnly: boolean;
  secure: boolean;
  sameSite: "lax";
  path: string;
  maxAge: number;
}

/** Cookie flags. HttpOnly (the value is server-read only), Lax (first-party
 *  GETs carry it), Path=/, Secure in production. */
export const EXPERIMENT_VISITOR_COOKIE_OPTIONS: ExperimentVisitorCookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax",
  path: "/",
  maxAge: EXPERIMENT_VISITOR_COOKIE_MAX_AGE_SECONDS,
};

/** The decision the proxy needs to set the cookie, without importing
 *  `next/server` here (keeps this module pure + edge/node-agnostic). */
export interface EnsureVisitorCookieDecision {
  /** True when the proxy should write a fresh visitor cookie on the response. */
  shouldSet: boolean;
  /** The id to write when `shouldSet` — a freshly minted id. */
  value: string;
}

/**
 * Decide whether a public render should mint + set the first-party visitor
 * cookie. PURE so it is unit-testable. The proxy passes the request method, the
 * already-present cookie value (if any), and whether the response is a redirect.
 *
 * Set ONLY when: GET, not a redirect, and no valid cookie already present
 * (idempotent — never rotate a stable id). Anything else ⇒ leave it alone so the
 * seed resolver falls back to the IP/UA seed (degrade-safe).
 */
export function decideEnsureVisitorCookie(args: {
  method: string;
  existingCookie: string | undefined;
  isRedirect: boolean;
}): EnsureVisitorCookieDecision {
  if (
    args.method !== "GET" ||
    args.isRedirect ||
    isValidExperimentVisitorId(args.existingCookie)
  ) {
    return { shouldSet: false, value: "" };
  }
  return { shouldSet: true, value: mintExperimentVisitorId() };
}

/** The minimal request/response shape the proxy ensure-helper needs — duck-typed
 *  so this module never imports `next/server`. */
export interface VisitorCookieRequestLike {
  method: string;
  cookies: { get(name: string): { value: string } | undefined };
}
export interface VisitorCookieResponseLike {
  headers: { get(name: string): string | null };
  cookies: {
    set(name: string, value: string, options: ExperimentVisitorCookieOptions): unknown;
  };
}

/**
 * ABTEST-1 — ensure a stable first-party visitor id cookie on a public render so
 * a returning ANON visitor stays in the same experiment arm across requests (the
 * SSR seed resolver reads this cookie above the IP/UA fallback). DEGRADE-SAFE: if
 * not set on a given path, the resolver falls back to the IP/UA seed (pre-cookie
 * behavior). Called from the proxy's two public-render terminal returns.
 */
export function ensureExperimentVisitorCookie(
  req: VisitorCookieRequestLike,
  res: VisitorCookieResponseLike,
): void {
  const decision = decideEnsureVisitorCookie({
    method: req.method,
    existingCookie: req.cookies.get(EXPERIMENT_VISITOR_COOKIE)?.value,
    isRedirect: res.headers.get("location") != null,
  });
  if (decision.shouldSet) {
    res.cookies.set(
      EXPERIMENT_VISITOR_COOKIE,
      decision.value,
      EXPERIMENT_VISITOR_COOKIE_OPTIONS,
    );
  }
}
