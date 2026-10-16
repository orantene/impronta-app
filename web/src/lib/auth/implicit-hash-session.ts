/**
 * TUL-881: Supabase implicit-flow links (magic link / confirm sign-up whose
 * redirect has no `/auth/...` path) land on any page with the session in the
 * URL FRAGMENT (`#access_token=…&refresh_token=…`). The fragment never reaches
 * the server, so `/auth/callback` and `/auth/confirm` never see it. These pure
 * helpers let a tiny client bridge consume it. Never log the returned tokens.
 */

export type ImplicitAuthHash =
  | { kind: "session"; accessToken: string; refreshToken: string }
  | { kind: "error"; code: string };

export function parseImplicitAuthHash(hash: string): ImplicitAuthHash | null {
  if (!hash || hash.length < 2) return null;
  const raw = hash.startsWith("#") ? hash.slice(1) : hash;
  if (!/(^|&)(access_token|error|error_code)=/.test(raw)) return null;
  const params = new URLSearchParams(raw);
  const error = params.get("error_code") ?? params.get("error");
  if (error) return { kind: "error", code: error.slice(0, 64) };
  const accessToken = params.get("access_token");
  const refreshToken = params.get("refresh_token");
  if (!accessToken || !refreshToken) return null;
  return { kind: "session", accessToken, refreshToken };
}

/** Returns `candidate` as a path only when it resolves to `origin`. */
export function safeSameOriginPath(
  candidate: string | null | undefined,
  origin: string,
  fallback: string,
): string {
  if (!candidate || !candidate.startsWith("/") || candidate.startsWith("//") || candidate.includes("\\")) {
    return fallback;
  }
  try {
    const url = new URL(candidate, origin);
    if (url.origin !== origin) return fallback;
    return `${url.pathname}${url.search}`;
  } catch {
    return fallback;
  }
}
