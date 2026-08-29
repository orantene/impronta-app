/**
 * workspace-lifecycle.ts — which `agencies.status` values still count as a
 * workspace that EXISTS.
 *
 * `agencies.status` has nine values (see
 * `supabase/migrations/20260601100000_saas_p1_agencies.sql`):
 *
 *     draft · onboarding · trial · active · past_due · restricted ·
 *     suspended · cancelled · archived
 *
 * Only the last two are terminal. Everything else — `suspended` included — is a
 * workspace the owner still has and can get back: suspension is reversible from
 * platform admin, so a suspended Free workspace must keep occupying the
 * one-free-workspace slot and keep holding its slug.
 *
 * The DB already draws the line in exactly this place: the partial index
 * `agencies_status_idx` is `WHERE status NOT IN ('cancelled','archived')`. This
 * module is the TypeScript half of that same predicate, so the reads that gate
 * the signup funnel cannot drift from it.
 *
 * PURE. No imports, no I/O — it is read from a marketing server action, from
 * the provisioner, and from tests.
 */

/** Terminal statuses. A workspace in one of these is gone for product purposes. */
export const RETIRED_WORKSPACE_STATUSES = ["cancelled", "archived"] as const;

export type RetiredWorkspaceStatus = (typeof RETIRED_WORKSPACE_STATUSES)[number];

const RETIRED_SET: ReadonlySet<string> = new Set<string>(
  RETIRED_WORKSPACE_STATUSES,
);

/**
 * Is this raw `agencies.status` one of the terminal ones?
 *
 * Fails toward "still alive": null, "", an unknown string, or a non-string all
 * answer false. The consequences of a wrong answer are asymmetric — treating a
 * live workspace as retired would hand its slug to a stranger and let its owner
 * create a second Free workspace, while treating a retired one as live only
 * costs the (already broken) status quo.
 */
export function isRetiredWorkspaceStatus(raw: unknown): boolean {
  return typeof raw === "string" && RETIRED_SET.has(raw.trim().toLowerCase());
}

/**
 * The tombstone slug a retired workspace is renamed to when a NEW signup
 * actually wants the name back.
 *
 * `agencies.slug` is UNIQUE and the delete is SOFT, so a cancelled workspace
 * physically keeps holding its name. Telling the /get-started visitor the link
 * is available and then silently provisioning them `luna-2` would be a worse
 * bug than the one we are fixing, so the reclaim is a real rename, performed
 * lazily at provisioning time by the only caller that needs it.
 *
 * Keeps the original slug as a readable prefix (an admin looking at the row can
 * still tell what it was) and appends a random suffix so two reclaims of the
 * same base can never collide. Truncates so the result stays inside
 * `WORKSPACE_SLUG_MAX_LENGTH`-shaped territory even for a long base.
 */
export function retiredWorkspaceSlugTombstone(
  slug: string,
  randomSuffix: string,
): string {
  const suffix = `-x${randomSuffix}`;
  const base = slug.trim().toLowerCase().slice(0, 32 - suffix.length);
  return `${base.replace(/-+$/, "")}${suffix}`;
}
