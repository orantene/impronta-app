/**
 * Access rule for the dev sign-in shortcut (TUL-1269), one pure function.
 *
 * The route mints a session for a seeded `@impronta.test` address with no password, so it must
 * never be reachable on a deployment that talks to the production database, nor on any Vercel
 * deployment by URL alone. The decision is made from WHERE the server is and WHICH database it
 * talks to, not from NODE_ENV / VERCEL_ENV (the local `npm run start` QA slot runs
 * NODE_ENV=production with VERCEL_ENV=preview against the isolated project).
 *
 * Rules, in order:
 *   1. Supabase project ref is production              -> DENY, whatever a flag or header says.
 *   2. Vercel production                               -> DENY.
 *   3. `x-dev-signin-token` equals DEV_SIGNIN_TOKEN    -> ALLOW (closed when the env var is unset).
 *   4. Not on Vercel AND ref is isolated or local      -> ALLOW (local QA slot, CI local supabase).
 *   5. LOCAL_QA=1 AND not on Vercel (ref not prod)     -> ALLOW.
 *   6. Otherwise                                       -> DENY (Vercel previews, the QA host pool).
 */
import { createHash, timingSafeEqual } from "node:crypto";

export const DEV_SIGNIN_TOKEN_HEADER = "x-dev-signin-token";
export const PROD_SUPABASE_REF = "pluhdapdnuiulvxmyspd";
export const ISOLATED_SUPABASE_REF = "fxlankepwnvelxjrahwk";

export type DevSigninEnv = {
  NODE_ENV?: string;
  VERCEL?: string;
  VERCEL_ENV?: string;
  LOCAL_QA?: string;
  NEXT_PUBLIC_SUPABASE_URL?: string;
  DEV_SIGNIN_TOKEN?: string;
};

export type DevSigninHeaders = { get(name: string): string | null };

export type SupabaseTarget = "prod" | "isolated" | "local" | "other";

export function supabaseTarget(url: string | undefined): SupabaseTarget {
  const raw = (url ?? "").trim().toLowerCase();
  if (raw.includes(PROD_SUPABASE_REF)) return "prod";
  let host = "";
  try {
    host = new URL(raw).hostname;
  } catch {
    return "other";
  }
  if (host.startsWith(`${ISOLATED_SUPABASE_REF}.`)) return "isolated";
  if (host === "127.0.0.1" || host === "localhost" || host === "[::1]" || host === "::1") return "local";
  return "other";
}

function sameToken(a: string, b: string): boolean {
  return timingSafeEqual(createHash("sha256").update(a).digest(), createHash("sha256").update(b).digest());
}

export function devSigninAllowed(env: DevSigninEnv, headers: DevSigninHeaders): boolean {
  const target = supabaseTarget(env.NEXT_PUBLIC_SUPABASE_URL);
  if (target === "prod") return false;
  if (env.VERCEL_ENV === "production") return false;

  const configured = env.DEV_SIGNIN_TOKEN?.trim() ?? "";
  const presented = headers.get(DEV_SIGNIN_TOKEN_HEADER);
  if (configured && presented && sameToken(configured, presented)) return true;

  const onVercel = Boolean(env.VERCEL);
  if (!onVercel && (target === "isolated" || target === "local")) return true;
  if (!onVercel && env.LOCAL_QA === "1") return true;
  return false;
}
