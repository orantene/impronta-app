/**
 * claim-return-url.ts — the site a guest booked/inquired from, used as the
 * claim email's `next` so the magic link lands them back on that site
 * (TUL-691 E1c). Pure; the server reader lives in claim-return-url.server.ts.
 *
 * This value is a HINT only: /auth/confirm re-validates any absolute `next`
 * against the host registry (resolvePostAuthRedirect), so a spoofed Host or
 * Referer can never turn the claim link into an open redirect.
 */

const HOSTNAME = /^[a-z0-9.-]+$/;

export type SiteReturnInput = {
  /** Request host (x-impronta-host-name / host), may carry a port. */
  host: string | null | undefined;
  /** Request Referer; its path is used only when its host equals `host`. */
  referer: string | null | undefined;
  /** getAppUrl(); the app host never counts as a site, its scheme is reused. */
  appUrl: string;
};

export function siteReturnUrlFromRequest(input: SiteReturnInput): string | null {
  const raw = (input.host ?? "").split(",")[0]?.trim().toLowerCase() ?? "";
  const [hostname = "", port = ""] = raw.split(":");
  if (!hostname || !HOSTNAME.test(hostname) || (port && !/^\d+$/.test(port))) return null;
  let app: URL;
  try {
    app = new URL(input.appUrl);
  } catch {
    return null;
  }
  if (hostname === app.hostname.toLowerCase()) return null;
  const secure = app.protocol === "https:";
  const origin = secure ? `https://${hostname}` : `http://${hostname}${port ? `:${port}` : ""}`;
  if (input.referer) {
    try {
      const ref = new URL(input.referer);
      if (ref.origin === origin) return `${origin}${ref.pathname || "/"}${ref.search}`;
    } catch {
      // fall through to the site root
    }
  }
  return `${origin}/`;
}

/** The claim link's `next`: the site URL when known, else client Messages. */
export function claimNextParam(tenantSlug: string, returnUrl: string | null | undefined): string {
  if (typeof returnUrl === "string" && /^https?:\/\//i.test(returnUrl)) return returnUrl;
  return `/${tenantSlug}/client/messages`;
}
