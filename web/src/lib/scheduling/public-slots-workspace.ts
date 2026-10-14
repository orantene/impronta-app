/**
 * TUL-690: workspace identity for GET /api/public/booking/slots.
 *
 * A `/w/<slug>` storefront is served on the hub / marketing host, so the
 * slots route used to see only the HOST and book against the hub tenant,
 * which returns no times. The picker now sends `workspace=<slug>` and the
 * route resolves that slug server-side; the offering must belong to it.
 * A host that owns its own tenant (agency domain, talent site) keeps its
 * identity and ignores the param. Pure: no DB, safe on the client.
 */

export const PUBLIC_SLOTS_PATH = "/api/public/booking/slots";

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const LOCALE_RE = /^[a-z]{2}(-[a-zA-Z]{2})?$/;

/** `/w/<slug>/...` or `/<locale>/w/<slug>/...` → slug; anything else → null. */
export function workspaceSlugFromPathname(pathname: string): string | null {
  const parts = pathname.split("/").filter(Boolean);
  const start = parts[0] === "w" ? 0 : LOCALE_RE.test(parts[0] ?? "") && parts[1] === "w" ? 1 : -1;
  if (start < 0) return null;
  const slug = (parts[start + 1] ?? "").toLowerCase();
  return SLUG_RE.test(slug) ? slug : null;
}

/** Slots URL for the current page; adds `workspace` on a `/w/<slug>` page. */
export function publicSlotsUrl(params: URLSearchParams, pathname?: string): string {
  const next = new URLSearchParams(params);
  const path =
    pathname ?? (typeof window !== "undefined" ? window.location.pathname : "");
  const slug = workspaceSlugFromPathname(path);
  if (slug) next.set("workspace", slug);
  return `${PUBLIC_SLOTS_PATH}?${next.toString()}`;
}

export type SlotsHost = { kind: string; tenantId: string | null };

/**
 * Effective host for the slots query. `workspaceTenantId` is the tenant the
 * SERVER resolved from the slug (null when unknown); never a client value.
 */
export function resolveSlotsWorkspaceScope(input: {
  host: SlotsHost;
  workspaceRequested: boolean;
  workspaceTenantId: string | null;
  offeringTenantId: string | null;
}): { ok: true; host: SlotsHost } | { ok: false } {
  const { host } = input;
  if (!input.workspaceRequested || host.kind === "agency" || host.kind === "talent_site") {
    return { ok: true, host };
  }
  if (!input.workspaceTenantId || input.offeringTenantId !== input.workspaceTenantId) {
    return { ok: false };
  }
  return { ok: true, host: { kind: "agency", tenantId: input.workspaceTenantId } };
}
