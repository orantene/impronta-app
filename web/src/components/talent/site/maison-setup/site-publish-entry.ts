/** TUL-427: one rule for the Publish entry on /talent/site. */
export type SitePublishEntryState = "fix-first" | "publish" | "republish" | "published";

export function sitePublishEntryState(input: {
  published: boolean;
  /** Design applied and an address chosen; false routes to the gate. */
  publishable: boolean;
  /** Unknown (still loading) counts as no pending changes. */
  hasPending: boolean | null;
}): SitePublishEntryState {
  if (!input.published) return input.publishable ? "publish" : "fix-first";
  return input.hasPending ? "republish" : "published";
}

/** The builder already opens its Publish drawer from `?panel=publish` (edit-shell). */
export const SITE_PUBLISH_BUILDER_HREF = "/talent/page-builder?panel=publish";

/** No dead CTA: with the Maison Review host off, the entry links to the builder's publish panel. */
export function sitePublishEntryTarget(
  state: SitePublishEntryState,
  hasReviewHost: boolean,
): { kind: "button" } | { kind: "link"; href: string } {
  if (state === "published" || hasReviewHost) return { kind: "button" };
  return { kind: "link", href: SITE_PUBLISH_BUILDER_HREF };
}
