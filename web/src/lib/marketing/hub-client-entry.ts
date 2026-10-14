/**
 * TUL-730: the hub /t/ profile renders MarketingHeader outside MarketingShell,
 * so the header's "Entrar" event had no modal host listening (lost click).
 * Clients get plain links to the app-host client sign-in / sign-up instead.
 * The same email-code client flow handles both, so sign-up is a distinct entry
 * that simply lands on the register branch of the client funnel.
 *
 * TUL-856: on the Spanish profile (`/es/t/<code>`) the links dropped Spanish:
 * the app page opened in English and `next` pointed at the English profile.
 * With `locale: "es"` both app pages keep `/es` and the return URL keeps the
 * `/es` profile. The return goes through `/account/return`, whose allow-list
 * accepts the site origin (#3744); a bare absolute `next` is not honoured by
 * the app-host sign-in.
 */
export type HubClientEntry = { signInHref: string; createHref: string };

function localizedProfileUrl(nextUrl: string, locale: string | undefined): string {
  if (locale !== "es") return nextUrl;
  try {
    const u = new URL(nextUrl);
    if (!/^\/es(\/|$)/.test(u.pathname)) u.pathname = `/es${u.pathname === "/" ? "" : u.pathname}`;
    return u.toString();
  } catch {
    return nextUrl;
  }
}

export function buildHubClientEntry(appUrl: string, nextUrl: string, locale?: string): HubClientEntry {
  const base = `${appUrl.replace(/\/+$/, "")}${locale === "es" ? "/es" : ""}`;
  const next = encodeURIComponent(`/account/return?to=${encodeURIComponent(localizedProfileUrl(nextUrl, locale))}`);
  return {
    signInHref: `${base}/login?as=client&next=${next}`,
    createHref: `${base}/register?as=client&next=${next}`,
  };
}
