/**
 * Staging password gate, pure core (TUL-827). No Next.js imports so every rule
 * here is unit-testable. The request wrapper lives in `staging-gate.ts`; the
 * operator guide is `docs/staging.md`.
 *
 * Active only when ALL hold:
 *   - STAGING_GATE_ENABLED === "1" (kill switch, default off)
 *   - VERCEL_ENV !== "production"
 *   - the host is not a production host
 *   - the host is not local, unless STAGING_GATE_FORCE === "1"
 */

export const STAGING_GATE_PATH = "/__staging-gate";
export const STAGING_GATE_COOKIE = "tulala_stg_gate";
export const STAGING_GATE_CI_HEADER = "x-staging-gate-token";
export const STAGING_GATE_MAX_AGE_S = 30 * 24 * 60 * 60;
/** Bump to invalidate every issued cookie without a password change. */
const COOKIE_SALT = "tulala_stg_gate:v1";

export type GateEnv = Partial<
  Record<
    | "VERCEL_ENV"
    | "STAGING_GATE_ENABLED"
    | "STAGING_GATE_FORCE"
    | "STAGING_GATE_PASSWORD"
    | "STAGING_GATE_CI_TOKEN",
    string | undefined
  >
>;

export type HostClass = "production" | "staging" | "local" | "other";

const PRODUCTION_EXACT = new Set(["tulala.digital", "app.tulala.digital", "improntamodels.com", "www.improntamodels.com"]);

export function normalizeHost(raw: string | null | undefined): string {
  const h = (raw ?? "").trim().toLowerCase();
  if (h.startsWith("[")) return h.slice(0, h.indexOf("]") + 1);
  return h.replace(/:\d+$/, "").replace(/\.$/, "");
}

export function classifyHost(raw: string | null | undefined): HostClass {
  const h = normalizeHost(raw);
  if (!h) return "other";
  if (h === "localhost" || h === "127.0.0.1" || h === "[::1]" || h.endsWith(".localhost")) return "local";
  if (PRODUCTION_EXACT.has(h)) return "production";
  if (h.endsWith(".tulala.digital")) {
    const sub = h.slice(0, -".tulala.digital".length);
    if (sub === "staging" || sub.endsWith(".staging")) return "staging";
    if (/^staging-qa-[a-z0-9-]+$/.test(sub)) return "staging";
    if (/^qa-\d+$/.test(sub)) return "staging";
    return "production";
  }
  return "other";
}

export function isGateActive(env: GateEnv, host: string | null | undefined): boolean {
  if (env.STAGING_GATE_ENABLED !== "1") return false;
  if (env.VERCEL_ENV === "production") return false;
  const cls = classifyHost(host);
  if (cls === "production") return false;
  if (cls === "local") return env.STAGING_GATE_FORCE === "1";
  return true;
}

const STATIC_FILE_RE = /\.(?:svg|png|jpe?g|gif|webp|avif|ico|woff2?|ttf|otf|eot|css|js|map|txt|xml|webmanifest)$/i;
const ALLOWED_PREFIXES = ["/api/webhooks/", "/api/cron/", "/api/health/", "/api/stripe/webhook", "/_next/"];
const ALLOWED_EXACT = new Set([STAGING_GATE_PATH, "/favicon.ico", "/robots.txt"]);

/** Paths that never require the password (machines, assets, the gate itself). */
export function isAlwaysAllowedPath(pathname: string): boolean {
  if (ALLOWED_EXACT.has(pathname)) return true;
  if (ALLOWED_PREFIXES.some((p) => pathname.startsWith(p))) return true;
  // Static files only outside API routes, so `/api/x.json` can't slip past.
  return !pathname.startsWith("/api/") && STATIC_FILE_RE.test(pathname);
}

/** A same-host relative path+query+hash, or "/" for anything else. */
export function sanitizeNext(raw: string | null | undefined): string {
  if (!raw || raw.length > 2048) return "/";
  if (!raw.startsWith("/") || raw.startsWith("//") || raw.startsWith("/\\")) return "/";
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f\\]/.test(raw)) return "/";
  try {
    const base = "http://gate.invalid";
    const u = new URL(raw, base);
    if (u.origin !== base) return "/";
    if (u.pathname === STAGING_GATE_PATH) return "/";
    return `${u.pathname}${u.search}${u.hash}`;
  } catch {
    return "/";
  }
}

export function gateUrlFor(pathAndQuery: string): string {
  return `${STAGING_GATE_PATH}?next=${encodeURIComponent(sanitizeNext(pathAndQuery))}`;
}

/** Length-independent compare; never returns early on the first mismatch. */
export function constantTimeEqual(a: string, b: string): boolean {
  const len = Math.max(a.length, b.length);
  let diff = a.length ^ b.length;
  for (let i = 0; i < len; i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}

const tokenCache = new Map<string, string>();

/** HMAC-SHA256(key = password, msg = salt), hex. Web Crypto, edge-safe. */
export async function signGateCookie(password: string): Promise<string> {
  const hit = tokenCache.get(password);
  if (hit) return hit;
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(password), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(COOKIE_SALT)));
  const hex = Array.from(sig, (b) => b.toString(16).padStart(2, "0")).join("");
  tokenCache.clear();
  tokenCache.set(password, hex);
  return hex;
}

export async function verifyGateCookie(value: string | null | undefined, password: string): Promise<boolean> {
  if (!value || !password) return false;
  return constantTimeEqual(value, await signGateCookie(password));
}

export function verifyCiToken(header: string | null | undefined, configured: string | null | undefined): boolean {
  if (!configured || !header) return false;
  return constantTimeEqual(header, configured);
}

export function verifyPassword(given: string | null | undefined, password: string): boolean {
  if (!password || typeof given !== "string") return false;
  return constantTimeEqual(given, password);
}

export function gateCookieHeader(value: string): string {
  return `${STAGING_GATE_COOKIE}=${value}; Path=/; Max-Age=${STAGING_GATE_MAX_AGE_S}; HttpOnly; Secure; SameSite=Lax`;
}

export const STAGING_ROBOTS_TXT = "User-agent: *\nDisallow: /\n";
export const STAGING_GATE_NOT_CONFIGURED = "Staging gate not configured (STAGING_GATE_PASSWORD missing)";
