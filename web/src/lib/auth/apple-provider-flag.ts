/**
 * Server-side gate for Sign in with Apple (TUL-65).
 *
 * Flip ON only after the Supabase Auth Apple provider is configured
 * (Services ID, Team ID, Key ID, private key / rotating client secret).
 * Unset / anything other than an explicit truthy value → OFF. No NODE_ENV
 * default — an unconfigured provider must never show a button that ends in
 * `/login?error=oauth`.
 *
 * Env: `AUTH_APPLE_PROVIDER_ENABLED=1|true|on|yes`
 */

export type AppleProviderFlagEnv = {
  AUTH_APPLE_PROVIDER_ENABLED?: string;
};

function readRaw(env: AppleProviderFlagEnv): string {
  return (env.AUTH_APPLE_PROVIDER_ENABLED ?? "").trim().toLowerCase();
}

/** True when Apple OAuth may be offered on /login and the client popover. */
export function isAppleAuthProviderEnabled(
  env: AppleProviderFlagEnv = typeof process !== "undefined" ? process.env : {},
): boolean {
  const raw = readRaw(env);
  return raw === "1" || raw === "true" || raw === "on" || raw === "yes";
}
