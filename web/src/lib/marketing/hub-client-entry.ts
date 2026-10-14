/**
 * TUL-730: the hub /t/ profile renders MarketingHeader outside MarketingShell,
 * so the header's "Entrar" event had no modal host listening (lost click).
 * Clients get plain links to the app-host client sign-in / sign-up instead.
 * The same email-code client flow handles both, so sign-up is a distinct entry
 * that simply lands on the register branch of the client funnel.
 */
export type HubClientEntry = { signInHref: string; createHref: string };

export function buildHubClientEntry(appUrl: string, nextUrl: string): HubClientEntry {
  const base = appUrl.replace(/\/+$/, "");
  const next = encodeURIComponent(nextUrl);
  return {
    signInHref: `${base}/login?as=client&next=${next}`,
    createHref: `${base}/register?as=client&next=${next}`,
  };
}
