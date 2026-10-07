/**
 * 1D · one source for the address promised at "Ready to build" and shown at
 * the finish. The promise is the reserved link name (`linkSlug`); the finish
 * uses the promised address when the workspace really got that slug, and says
 * so (`differs`) when it did not, so a screen never promises one address and
 * delivers another silently. Pure.
 */

export const WORKSPACE_ROOT_DOMAIN = "tulala.digital";

/** `<slug>.tulala.digital` (display only, no scheme). */
export function promisedHost(slug: string | null | undefined): string | null {
  const s = (slug ?? "").trim().toLowerCase();
  return s ? `${s}.${WORKSPACE_ROOT_DOMAIN}` : null;
}

export function promisedUrl(slug: string | null | undefined): string | null {
  const host = promisedHost(slug);
  return host ? `https://${host}` : null;
}

export type FinishUrl = { url: string; display: string; promised: boolean; differs: boolean };

/**
 * Workspace finish address. `delivered` is what provisioning really made;
 * `tenantSlug` is the slug it got. Promised wins only when the slugs match.
 */
export function resolveWorkspaceFinishUrl(input: { linkSlug: string | null; tenantSlug: string; delivered: string }): FinishUrl {
  const promised = promisedUrl(input.linkSlug);
  const same = !!promised && (input.linkSlug ?? "").trim().toLowerCase() === input.tenantSlug.toLowerCase();
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
