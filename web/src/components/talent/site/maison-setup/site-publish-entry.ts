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
