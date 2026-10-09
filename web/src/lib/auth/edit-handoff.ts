/**
 * Admin Editar → custom-domain storefront editor hand-off (C2).
 *
 * When the editor URL is on a host that does NOT share the app auth cookie
 * parent (`cookieDomainForHost` returns undefined for custom domains), open
 * via `/auth/sso/start?return=<editorUrl>` so the app host mints a one-time
 * nonce and the custom domain redeems a fresh host-only session before
 * landing on `?edit=1`.
 *
 * Pure / client-safe. Mint + redeem I/O lives in sso-handoff.ts + auth routes.
 */

import { cookieDomainForHost } from "@/lib/supabase/cookie-domain";

/**
 * True when opening `editorAbsoluteUrl` from `currentHostname` would land on a
 * host that cannot see the current auth cookie.
 */
export function needsEditAuthHandoff(
  editorAbsoluteUrl: string,
  currentHostname: string,
): boolean {
  let target: URL;
  try {
    target = new URL(editorAbsoluteUrl);
  } catch {
    return false;
  }
  if (target.protocol !== "https:" && target.protocol !== "http:") return false;

  const targetHost = target.hostname.toLowerCase();
  const current = (currentHostname.split(":")[0] ?? "").trim().toLowerCase();
  if (!targetHost || !current) return false;
  if (targetHost === current) return false;

  // Shared cookie parent on the TARGET means the app/talent session already
  // travels with the browser (*.tulala.digital / *.lvh.me). No hand-off.
  if (cookieDomainForHost(targetHost)) return false;

  // localhost / loopback stay host-only but are local-dev; never wrap through SSO.
  if (
    targetHost === "localhost" ||
    targetHost === "127.0.0.1" ||
    targetHost.endsWith(".local")
  ) {
    return false;
  }

  return true;
}

/** App-host mint entry that carries the full editor URL (incl. ?edit=1). */
export function buildEditHandoffStartUrl(
  appUrl: string,
  editorAbsoluteUrl: string,
): string {
  const base = appUrl.replace(/\/$/, "");
  return `${base}/auth/sso/start?return=${encodeURIComponent(editorAbsoluteUrl)}`;
}

/**
 * URL the browser should open for Editar: bare editor on shared hosts, or the
 * SSO mint wrapper when the target is a custom (host-only) domain.
 */
export function resolveStorefrontEditorOpenUrl(input: {
  editorAbsoluteUrl: string;
  currentHostname: string;
  appUrl: string;
}): string {
  if (
    !needsEditAuthHandoff(input.editorAbsoluteUrl, input.currentHostname)
  ) {
    return input.editorAbsoluteUrl;
  }
  return buildEditHandoffStartUrl(input.appUrl, input.editorAbsoluteUrl);
}
