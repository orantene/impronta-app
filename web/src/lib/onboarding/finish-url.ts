/**
 * 1D · one source for the address promised at "Ready to build" and shown at
 * the finish. The promise is the reserved link name (`linkSlug`); the finish
 * uses the promised address when the workspace really got that slug, and says
 * so (`differs`) when it did not, so a screen never promises one address and
 * delivers another silently. Pure.
 */

export const WORKSPACE_ROOT_DOMAIN = "tulala.digital";

/** `<slug>.tulala.digital` (display only, no scheme). Paid branded host form. */
export function promisedHost(slug: string | null | undefined): string | null {
  const s = (slug ?? "").trim().toLowerCase();
  return s ? `${s}.${WORKSPACE_ROOT_DOMAIN}` : null;
}

/**
 * Free-tier display form: `tulala.digital/w/<slug>`. Self-serve signups are
 * path-canonical; advertising the subdomain here caused TUL-541 (finish said
 * borrador / preview empty while `/w/<slug>` was live).
 */
export function promisedPathHost(slug: string | null | undefined): string | null {
  const s = (slug ?? "").trim().toLowerCase();
  return s ? `${WORKSPACE_ROOT_DOMAIN}/w/${s}` : null;
}

export function promisedUrl(slug: string | null | undefined): string | null {
  const host = promisedHost(slug);
  return host ? `https://${host}` : null;
}

export type FinishUrl = { url: string; display: string; promised: boolean; differs: boolean };

/** True when `url` is the Free path-canonical storefront (`…/w/<slug>`). */
export function isWorkspacePathDeliveredUrl(url: string): boolean {
  try {
    const path = new URL(url).pathname.replace(/\/+$/, "") || "/";
    return /^\/w\/[^/]+$/.test(path) || path.startsWith("/w/");
  } catch {
    return /\/w\//.test(url);
  }
}

/**
 * Workspace finish address. `delivered` is what provisioning really made
 * (`getTenantPreviewUrl` → `/w/<slug>` for Free). Never replace a delivered
 * path URL with a synthetic subdomain — that host is not Free-canonical and
 * live-check then false-fails into `draft_saved` (TUL-541 onb1-15..16).
 * Paid branded delivery still prefers the promised subdomain when slugs match.
 */
export function resolveWorkspaceFinishUrl(input: { linkSlug: string | null; tenantSlug: string; delivered: string }): FinishUrl {
  const promised = promisedUrl(input.linkSlug);
  const same = !!promised && (input.linkSlug ?? "").trim().toLowerCase() === input.tenantSlug.toLowerCase();
  if (isWorkspacePathDeliveredUrl(input.delivered)) {
    return {
      url: input.delivered,
      display: input.delivered.replace(/^https?:\/\//, ""),
      promised: same,
      differs: !!promised && !same,
    };
  }
  const url = same && promised ? promised : input.delivered;
  return { url, display: url.replace(/^https?:\/\//, ""), promised: same, differs: !!promised && !same };
}

/**
 * The three Maison v2 palettes offered to a talent: recommended first. Old
 * stored v1 keys (pink / pearl / sand) fail this guard on purpose, so a
 * resumed brief reads them as "no pick" and gets the default (rose).
 */
export const DESIGN_LOOK_KEYS = ["rose", "blush", "orchid"] as const;
export type DesignLookKey = (typeof DESIGN_LOOK_KEYS)[number];

export function isDesignLookKey(v: unknown): v is DesignLookKey {
  return typeof v === "string" && (DESIGN_LOOK_KEYS as readonly string[]).includes(v);
}
