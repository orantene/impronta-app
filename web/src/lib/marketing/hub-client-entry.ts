/**
 * TUL-730: the hub /t/ profile renders MarketingHeader outside MarketingShell,
 * so the header's "Entrar" event had no modal host listening (lost click).
 * Clients get plain links to the app-host client sign-in / sign-up instead.
 * The same email-code client flow handles both, so sign-up is a distinct entry
 * that simply lands on the register branch of the client funnel.
 */
export type HubClientEntry = { signInHref: string; createHref: string };

/** Default locale is served unprefixed; any other page locale sits under `/<code>`. */
function localizeNext(nextUrl: string, locale: string): string {
  if (locale === "en") return nextUrl;
  try {
    const u = new URL(nextUrl);
    if (u.pathname === `/${locale}` || u.pathname.startsWith(`/${locale}/`)) return nextUrl;
    u.pathname = `/${locale}${u.pathname === "/" ? "" : u.pathname}`;
    return u.toString();
  } catch {
    return nextUrl;
  }
}

/**
 * TUL-856/863: the sign-in / sign-up links follow the PAGE locale (an ES
 * profile sends the visitor to `/es/login` and back to `/es/t/<code>`), and
 * `nextUrl` is the public profile URL (callers pass the canonical talent URL,
 * never the app host).
 */
export function buildHubClientEntry(appUrl: string, nextUrl: string, locale: string = "en"): HubClientEntry {
  const base = appUrl.replace(/\/+$/, "");
  const lp = locale === "en" ? "" : `/${locale}`;
  const next = encodeURIComponent(localizeNext(nextUrl, locale));
  return {
    signInHref: `${base}${lp}/login?as=client&next=${next}`,
    createHref: `${base}${lp}/register?as=client&next=${next}`,
  };
}
