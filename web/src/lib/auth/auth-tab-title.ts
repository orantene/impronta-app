/**
 * GRK-094 / GRK-095 — browser-tab titles for auth routes.
 *
 * The auth layout used to return robots-only metadata on platform hosts, so
 * /login and /register both fell through to the root default
 * (`Tulala · {tagline}`). Map the locale-stripped path to a message key so the
 * root title template can render `Log in · Tulala` / `Iniciar sesión · Tulala`.
 */
export function authTabTitleMessageKey(pathnameWithoutLocale: string): string | null {
  const raw = pathnameWithoutLocale.trim() || "/";
  const p = (raw.startsWith("/") ? raw : `/${raw}`).replace(/\/+$/, "") || "/";
  if (p === "/login") return "public.auth.login.title";
  if (p === "/register" || p.startsWith("/register/")) return "public.auth.register.title";
  if (p === "/forgot-password") return "public.auth.forgot.title";
  if (p === "/update-password") return "public.auth.update.title";
  return null;
}
