/**
 * Pure rules for `/account` on agency and hub hosts (TUL-64, phase P4). No I/O,
 * so each decision is asserted without a database or a request.
 */

import type { ClientAccountHostKind } from "./flag";
import { isClientAccountEligible } from "./pure";
import { accountReturnPath } from "./return-to";

/**
 * Host contexts the proxy sets (`x-impronta-host-context`) that can show the
 * tenant account area. Each maps to its OWN flag kind in CLIENT_ACCOUNT_HOSTS
 * (agency → `agency`, hub → `hub`, …) — never collapsed onto `app`.
 */
const TENANT_HOSTS: ReadonlySet<ClientAccountHostKind> = new Set([
  "agency",
  "hub",
  "app",
  "marketing",
]);

/**
 * Which rollout flag governs `/account` on a host. Reads the proxy host
 * context 1:1: `talent_site` → `talent`, `agency` → `agency`, `hub` → `hub`,
 * `app` → `app`, `marketing` → `marketing`. Anything else has no account area.
 */
export function accountFlagKindForHost(hostContext: string | null | undefined): ClientAccountHostKind | null {
  if (hostContext === "talent_site") return "talent";
  if (hostContext && TENANT_HOSTS.has(hostContext as ClientAccountHostKind)) {
    return hostContext as ClientAccountHostKind;
  }
  return null;
}

/** True when this host context is an agency / hub / app / marketing account host. */
export function isTenantAccountHost(hostContext: string | null | undefined): boolean {
  const kind = accountFlagKindForHost(hostContext);
  return kind !== null && kind !== "talent";
}

/**
 * Whether `/account` is the client account area (not the legacy role redirect)
 * on an agency, hub or app host. Signed out and client accounts get the area;
 * staff, talent and platform accounts keep the existing role redirect so their
 * `/account` entry point does not change.
 */
export function accountHomeMode(input: {
  flagOn: boolean;
  hostContext: string | null | undefined;
  userId: string | null | undefined;
  appRole: string | null | undefined;
}): "area" | "legacy" {
  if (!input.flagOn) return "legacy";
  if (!isTenantAccountHost(input.hostContext)) return "legacy";
  if (!input.userId) return "area";
  return isClientAccountEligible(input.appRole) ? "area" : "legacy";
}

/**
 * Old client entry points (`/me`, `/client`, `/{slug}/client`) become `/account`
 * on agency and hub hosts when the flag is on. TUL-782 (PM 2026-10-21): `/account`
 * is the single client home, so a SIGNED-IN client on the app host goes there too
 * (client1 used to land in an agency shell, client2 on /account). The app host
 * stays as-is for signed-out visitors and every non-client role, because its
 * `/client` is the post-sign-in target for every role. Staff and talent are
 * never redirected into a client area.
 */
export function legacyClientEntryRedirect(input: {
  flagOn: boolean;
  hostContext: string | null | undefined;
  userId: string | null | undefined;
  appRole: string | null | undefined;
}): "account" | "stay" {
  if (!input.flagOn) return "stay";
  if (input.hostContext === "app") {
    return input.userId && input.appRole === "client" ? "account" : "stay";
  }
  if (input.hostContext !== "agency" && input.hostContext !== "hub") return "stay";
  if (!input.userId) return "account";
  return isClientAccountEligible(input.appRole) ? "account" : "stay";
}

export type AgencyTabKey = "quotes" | "shortlists" | "approvals";
export type AgencyTab = { key: AgencyTabKey; href: string };

/** Where each agency tab lives today. Linked, not rewritten. */
const AGENCY_TAB_PATH: Record<AgencyTabKey, string> = {
  quotes: "inquiries",
  shortlists: "shortlists",
  approvals: "pitches",
};

const SLUG = /^[a-z0-9](?:[a-z0-9-]{0,62})$/;

/**
 * Extra tabs on `/account`. Only a real agency host with a known slug and a
 * client-eligible role (signed-in client, or a fresh null-role sign-in) gets
 * them. The hub and every other host get none; signed-out and team accounts
 * never do.
 */
export function agencyAccountTabs(input: {
  hostContext: string | null | undefined;
  tenantSlug: string | null | undefined;
  userId: string | null | undefined;
  appRole: string | null | undefined;
}): AgencyTab[] {
  if (input.hostContext !== "agency") return [];
  if (!input.userId || !isClientAccountEligible(input.appRole)) return [];
  const slug = (input.tenantSlug ?? "").trim().toLowerCase();
  if (!SLUG.test(slug)) return [];
  return (Object.keys(AGENCY_TAB_PATH) as AgencyTabKey[]).map((key) => ({
    key,
    href: `/${slug}/client/${AGENCY_TAB_PATH[key]}`,
  }));
}

/**
 * Title and brand for the sign-in page. On a whitelabel agency or hub host the
 * page wears the tenant's own name, whatever CLIENT_ACCOUNT_HOSTS says (the flag
 * gates the account area, not a brand leak); otherwise it stays the platform
 * brand (`null` means "leave metadata as is").
 */
export function authPageBrand(input: {
  hostKind: string | null | undefined;
  whitelabel: boolean;
  publicName: string | null | undefined;
}): { title: string } | null {
  if (input.hostKind !== "agency" && input.hostKind !== "hub") return null;
  if (!input.whitelabel) return null;
  const name = (input.publicName ?? "").trim();
  return name ? { title: name } : null;
}

/**
 * Where "My account" points. The marketing apex (`tulala.digital/t/<code>`)
 * does not serve `/account`, so it links to the app host's page by absolute URL
 * (`appUrl` comes from `getAppUrl()`, never a literal host). Every other host
 * serves `/account` itself.
 */
export function accountHrefFor(hostKind: string | null | undefined, appUrl: string): string {
  if (hostKind === "marketing") return `${appUrl.trim().replace(/\/$/, "")}/account`;
  return "/account";
}

/**
 * `?next=` for the signed-out bounce from the workspace client shell. On the
 * agency's own host the host already names the workspace, so the branded
 * `/client` is the URL (the proxy serves it); `/<slug>/client` would put the
 * slug in the address bar. Every other host keeps the slug path.
 */
export function clientLoginNext(hostContext: string | null | undefined, slug: string): string {
  return hostContext === "agency" ? "/client" : `/${slug}/client`;
}

/**
 * Signed-out client entry for a path-addressed workspace site
 * (`tulala.digital/w/<slug>`). Those pages are served on the marketing host,
 * which has no client account surface of its own, so the entry points at the
 * app host's existing client sign-in. `next` stays app-host relative: it is
 * `/account/return?to=<site path>`, which sends the signed-in client back to
 * the site they came from through the allow-listed return-to (TUL-709).
 * Null for every other host or path: those keep their normal login link.
 */
export function pathWorkspaceClientSignInHref(input: {
  hostKind: string | null | undefined;
  pathname: string;
  appUrl: string;
}): string | null {
  if (input.hostKind !== "marketing") return null;
  if (!/^\/w\/[^/]+/.test(input.pathname)) return null;
  const base = input.appUrl.trim().replace(/\/$/, "");
  return `${base}/login?as=client&next=${encodeURIComponent(accountReturnPath(input.pathname))}`;
}

/**
 * TUL-870: the head fields that still said "Tulala" on a whitelabel agency's
 * login (description, og:site_name, og:title, apple-mobile-web-app title).
 * Pure: the caller spreads it into Next metadata.
 */
export function authBrandHead(name: string, locale: string): {
  description: string;
  openGraph: { siteName: string; title: string; description: string };
  twitter: { title: string; description: string };
  appleWebApp: { capable: true; title: string; statusBarStyle: "default" };
} {
  const description = locale === "es" ? `Inicia sesión en ${name}.` : `Sign in to ${name}.`;
  return {
    description,
    openGraph: { siteName: name, title: name, description },
    twitter: { title: name, description },
    appleWebApp: { capable: true, title: name, statusBarStyle: "default" },
  };
}
