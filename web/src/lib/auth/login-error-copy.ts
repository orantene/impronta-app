/**
 * TUL-773: `/login?error=<code>` showed the raw code ("auth") to the visitor.
 * The auth routes redirect with three machine codes; each maps to a catalog
 * key. Anything else is a human message from a server action and is shown
 * decoded, as before. Pure.
 */
const CODE_KEYS: Record<string, string> = {
  auth: "public.auth.login.errorAuth",
  oauth: "public.auth.login.errorOauth",
  config: "public.auth.login.errorConfig",
};

export function loginErrorMessage(raw: string, t: (key: string) => string): string {
  let decoded = raw;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    // Malformed escape: show the raw value rather than throw.
  }
  const key = CODE_KEYS[decoded.trim().toLowerCase()];
  return key ? t(key) : decoded;
}
