import { resolvePublicRosterDisplayCap } from "@/lib/saas/roster-seat-limit";
import { PLAN_SEAT_CAPS } from "@/lib/saas/plan-seat-caps";

/**
 * Public display ceiling for Free roster profiles. Mirrors the binding SaaS
 * matrix (`20260902130000_free_plan_seat_limit_five.sql`: "Free = up to 5
 * talent profiles") and `agencies.talent_seat_limit = 5` stamped by the
 * self-serve provisioner.
 */
export const FREE_STARTER_PROFILE_CAP = PLAN_SEAT_CAPS.free ?? 5;

/**
 * How many demo roster profiles the Free starter storefront seeds.
 *
 * FIRST-RUN CONTRACT: the starter seed must never consume the workspace's
 * whole seat allotment. Seeding `FREE_STARTER_PROFILE_CAP` profiles into a
 * `talent_seat_limit = 5` workspace left a brand-new owner at 100% of the cap,
 * so onboarding step 1 ("Add your first talent") failed instantly with
 * "reached the Free plan limit (5 profiles)" — the first thing the product
 * asked them to do was also the first thing it refused.
 */
export const FREE_STARTER_SEED_TARGET = 3;

/**
 * Seats the starter seed must leave unused so the owner can add real people
 * immediately after signup.
 */
export const FREE_STARTER_SEAT_HEADROOM = 2;

export function resolveFreeStarterRosterSeedCount(input: {
  planTier: string | null;
  seatLimit: number | null;
  totalRosterCount: number;
  publicVisibleCount: number;
}): number {
  if (input.planTier !== "free") return 0;
  if (input.publicVisibleCount > 0) return 0;
  if (input.totalRosterCount > 0) return 0;
  const cap = resolvePublicRosterDisplayCap(input.planTier, input.seatLimit);
  const effectiveCap =
    cap == null
      ? FREE_STARTER_PROFILE_CAP
      : Math.max(0, Math.trunc(cap));
  // Never fill the plan: reserve FREE_STARTER_SEAT_HEADROOM seats for the
  // owner's own first additions, and never seed more than the display cap.
  const seatsAvailableToSeed = Math.min(
    effectiveCap,
    FREE_STARTER_PROFILE_CAP,
  ) - FREE_STARTER_SEAT_HEADROOM;
  return Math.max(0, Math.min(FREE_STARTER_SEED_TARGET, seatsAvailableToSeed));
}

/**
 * Idempotence gate for the Free starter homepage seed.
 *
 * The signup trampoline (`ensureWorkspaceScaffold`) is re-entered on later
 * logins, so a second run must not duplicate sections. Deliberately derived
 * from the page row we already hold plus a slot-row count keyed on the known
 * page id — never from a second read of `cms_pages` (see the read-after-write
 * hazard documented in `onboard-starter-content.ts`).
 */
export function shouldSkipFreeStarterHomepageSeed(input: {
  pageStatus: string | null;
  draftSlotCount: number;
  liveSlotCount: number;
  /**
   * False when the slot-count probe FAILED (rather than legitimately returning
   * zero). Fail closed: the seed replaces the whole homepage composition and
   * republishes it, so "we could not tell whether this tenant has content" must
   * never be treated as "this tenant is empty". A skipped seed leaves a
   * workspace unstyled, which is visible and fixable; a wrongly-run seed
   * overwrites a real storefront, which is not.
   */
  contentProbeOk?: boolean;
}): boolean {
  if (input.contentProbeOk === false) return true;
  if (input.draftSlotCount > 0) return true;
  if (input.liveSlotCount > 0) return true;
  // Anything other than a pristine draft page means someone has already worked
  // on this homepage (published, scheduled, archived). Only seed a draft.
  return input.pageStatus !== "draft";
}

/**
 * Pick the `expectedVersion` for a compare-and-swap write.
 *
 * `ensureHomepageRow` inserts the page row AND a `cms_page_revisions` row; any
 * write between the row we captured and our CAS makes the captured version
 * stale, which surfaces as a bogus VERSION_CONFLICT. We therefore re-read the
 * version immediately before each CAS, and fall back to the version we already
 * hold when that read is unavailable (never to a hard failure).
 */
export function resolveCasExpectedVersion(input: {
  freshVersion: number | null;
  fallbackVersion: number;
}): number {
  const { freshVersion, fallbackVersion } = input;
  if (typeof freshVersion !== "number" || !Number.isFinite(freshVersion)) {
    return fallbackVersion;
  }
  if (freshVersion < 0) return fallbackVersion;
  return freshVersion;
}
