/**
 * TUL-1463: saved SERVICES for the client account (the service twin of saved talent).
 * Pure, no I/O, safe for client and server.
 *
 *  - `decideServiceSave`: who may save what. A guest is told to sign in (no row is ever
 *    written for a guest). A signed-in client saves only a service visible on THIS site
 *    (the one sellable rule, `guest_request`: published + approved + public / on request)
 *    and owned by this site's tenant. The tenant stored is the offering's, never the request's.
 *  - `shapeSavedServices`: the Saved tab list. Only this site's tenant (on a talent site,
 *    only the host talent's: TUL-1692), only services still visible; each links to a page that always shows that service (`savedServiceHref`).
 */
import { isSellable } from "@/lib/offerings/sellable";
import { bookAgainHref } from "@/lib/client-account/book-again";
import { businessServicePathWithoutLocale, businessServiceSlug } from "@/lib/services/business-pages/paths";
import { isServicePageEligible, serviceSlug } from "@/lib/talent-site/service-page";

import { localizedServiceTitle } from "./localized-service-title";

export type SaveableOffering = {
  id: string;
  tenant_id: string | null;
  talent_profile_id?: string | null;
  status?: unknown;
  moderation_state?: unknown;
  visibility?: unknown;
};

export type ServiceSaveRefusal = "sign_in" | "not_found";

export type ServiceSaveDecision = { ok: true; tenantId: string } | { ok: false; reason: ServiceSaveRefusal };

export function decideServiceSave(input: {
  sessionUserId: string | null | undefined;
  siteTenantId: string | null | undefined;
  /** TUL-1692: set on any talent site (hub or agency tenant): only the host talent's services save. */
  hubTalentProfileId?: string | null;
  offering: SaveableOffering | null | undefined;
}): ServiceSaveDecision {
  if (!input.sessionUserId) return { ok: false, reason: "sign_in" };
  const o = input.offering;
  // Another tenant's service, a hidden one or a missing one all read the same: not found.
  if (!o || !o.tenant_id || !input.siteTenantId || o.tenant_id !== input.siteTenantId) return { ok: false, reason: "not_found" };
  if (!isSellable(o, "guest_request")) return { ok: false, reason: "not_found" };
  // TUL-1692: on a talent site the tenant (hub or agency) holds many talents; another talent's
  // service (or a house row) is not on this talent's site.
  if (input.hubTalentProfileId && o.talent_profile_id !== input.hubTalentProfileId) return { ok: false, reason: "not_found" };
  return { ok: true, tenantId: o.tenant_id };
}

export type SavedServiceOffering = SaveableOffering & {
  title: string;
  title_i18n?: unknown;
  kind?: string | null;
  owner_kind?: string | null;
  attributes?: Record<string, unknown> | null;
};

export type SavedServiceRow = {
  added_at: string;
  offering_id: string;
  tenant_id: string;
  talent_offerings: SavedServiceOffering | null;
};

/** Null href: no page on this site is sure to show the service, so the item is listed without a link. */
export type SavedService = { title: string; href: string | null };

/** What the account's host can show. Built server-side from the host headers and the plan. */
export type SavedServiceSite = {
  /** x-impronta-host-context: talent_site, agency, hub, app, marketing. */
  hostKind: string | null;
  /** The talent of a talent-site host. */
  hostTalentProfileId: string | null;
  /** TUL-1692: the host talent on her own site (hub or agency tenant); the list is scoped to her. */
  hubTalentProfileId?: string | null;
  /** The workspace's plan and flag allow business service pages (`businessServicePagesOn`). */
  businessPagesOn: boolean;
  /** Event-backing and reservation rows: never get a business page. */
  nonMenuIds: ReadonlySet<string>;
};

const PAGE_KINDS = new Set(["service", "package"]);

/**
 * TUL-1463: a saved service must always open. In order:
 *  1. the business service page (`/services/<slug>`, `/servicios/<slug>`) when this workspace has
 *     them and the row qualifies (house row, service or package, menu item; the page 301s to the
 *     canonical word and locale);
 *  2. on a talent site, the talent's own service page (`/servicio-<title>-<id8>`, TUL-586);
 *  3. the site's booking page with the service preselected (`/book?service=<id>`) on a host that
 *     serves /book (talent site, agency). The quick view itself only opens from `#servicio-<id8>`
 *     on a page that holds the services widget, and no page is sure to hold it, so it is never used;
 *  4. otherwise null (listed without a link, never a dead link).
 */
export function savedServiceHref(o: SavedServiceOffering, site: SavedServiceSite, locale: string): string | null {
  const title = o.title?.trim() ?? "";
  if (!title) return null;
  const pageable = PAGE_KINDS.has(String(o.kind ?? ""));
  if (
    site.hostKind === "agency" && site.businessPagesOn && pageable && o.owner_kind === "workspace" &&
    !site.nonMenuIds.has(o.id) && isSellable(o, "guest_request")
  ) {
    return businessServicePathWithoutLocale(locale, businessServiceSlug({ id: o.id, title }));
  }
  if (
    site.hostKind === "talent_site" && site.hostTalentProfileId && o.talent_profile_id === site.hostTalentProfileId &&
    isServicePageEligible({ kind: String(o.kind ?? ""), visibility: typeof o.visibility === "string" ? o.visibility : undefined, title, attributes: o.attributes ?? null })
  ) {
    return `/${serviceSlug({ id: o.id, title })}`;
  }
  if (site.hostKind === "agency" || (site.hostKind === "talent_site" && o.talent_profile_id === site.hostTalentProfileId)) {
    return bookAgainHref(o.id);
  }
  return null;
}

export function shapeSavedServices(rows: readonly SavedServiceRow[], siteTenantId: string, locale: string, site: SavedServiceSite): SavedService[] {
  return [...rows]
    .sort((a, b) => b.added_at.localeCompare(a.added_at))
    .flatMap((r) => {
      const o = r.talent_offerings;
      if (r.tenant_id !== siteTenantId || !o || o.tenant_id !== siteTenantId) return [];
      if (!isSellable(o, "guest_request")) return [];
      if (site.hubTalentProfileId && o.talent_profile_id !== site.hubTalentProfileId) return [];
      const stored = o.title?.trim();
      if (!stored) return [];
      return [{ title: localizedServiceTitle(o, locale, stored), href: savedServiceHref(o, site, locale) }];
    });
}

/** Only well-formed ids, de-duplicated and bounded: the status read never takes a long list. */
export function cleanOfferingIds(ids: readonly unknown[], max = 60): string[] {
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return [...new Set(ids.filter((x): x is string => typeof x === "string" && UUID.test(x)).map((x) => x.toLowerCase()))].slice(0, max);
}

/** Postgres "relation does not exist": the held table is not applied yet. Callers fail closed. */
export function isMissingTable(error: { code?: string | null } | null | undefined): boolean {
  return error?.code === "42P01" || error?.code === "PGRST205";
}
