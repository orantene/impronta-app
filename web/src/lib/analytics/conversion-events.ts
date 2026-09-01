import "server-only";

import { logAnalyticsEventServer } from "./server-log";

/**
 * The four moments the business is actually judged on.
 *
 * Everything else the marketing site measures is interest: a click, a scroll,
 * a section coming into view. These four are outcomes, and until they existed
 * we could count how many people looked and not how many succeeded. Lifecycle
 * campaigns, funnel reporting, channel evaluation and any future ad spend all
 * read from here, so treat these names as a contract rather than as labels.
 *
 * WHY A SEPARATE MODULE. `product-events.ts` defines 65 event names and only
 * 22 of them are emitted anywhere, which is worse than having none: a reader
 * sees a rich schema and reasonably assumes the funnel is measured. Conversion
 * events get their own module, their own helpers, and a guard that fails if
 * one is ever defined here without being emitted.
 *
 * Every call is best effort. `logAnalyticsEventServer` swallows its own
 * errors, and nothing here is awaited in a way that can fail a signup, a save
 * or a webhook. Analytics must never be the reason a customer action breaks.
 */

export const CONVERSION_EVENTS = {
  /** A workspace finished provisioning and the person has somewhere to land. */
  signup_completed: "signup_completed",
  /**
   * ACTIVATION. The first offering this workspace has ever published.
   *
   * Chosen because it is the first moment the product has done its job: there
   * is now something on a real page that a stranger could pay for. Registering
   * proves intent; publishing proves the person got far enough to have a
   * business online. Fires exactly once per workspace, on the 0 to 1
   * transition, so "activated within 7 days" is a countable thing.
   */
  workspace_activated: "workspace_activated",
  /** A paid plan started or moved up. */
  plan_upgraded: "plan_upgraded",
  /** A paid plan ended or moved down. Churn is half of what a funnel means. */
  plan_downgraded: "plan_downgraded",
} as const;

export type ConversionEventName =
  (typeof CONVERSION_EVENTS)[keyof typeof CONVERSION_EVENTS];

type Base = {
  tenantId?: string | null;
  userId?: string | null;
  talentId?: string | null;
  /** First-touch channel where we have it. Null is honest; do not guess. */
  source?: string | null;
};

/** Registration finished and a workspace exists. */
export async function trackSignupCompleted(
  input: Base & { audience?: string | null; tenantSlug?: string | null; reusedExisting?: boolean },
): Promise<void> {
  await logAnalyticsEventServer({
    name: CONVERSION_EVENTS.signup_completed,
    tenantId: input.tenantId ?? null,
    userId: input.userId ?? null,
    payload: {
      audience: input.audience ?? null,
      tenant_slug: input.tenantSlug ?? null,
      // A reused workspace is not a new customer. Counting it as one would
      // quietly inflate every signup number downstream.
      reused_existing: Boolean(input.reusedExisting),
      source: input.source ?? null,
    },
  });
}

/**
 * ACTIVATION — call ONLY on the transition from zero published offerings to
 * one. The caller owns that check, because only the caller can see the count
 * cheaply inside the write it is already doing.
 */
export async function trackWorkspaceActivated(
  input: Base & { offeringId?: string | null; daysSinceSignup?: number | null },
): Promise<void> {
  await logAnalyticsEventServer({
    name: CONVERSION_EVENTS.workspace_activated,
    tenantId: input.tenantId ?? null,
    userId: input.userId ?? null,
    talentId: input.talentId ?? null,
    payload: {
      offering_id: input.offeringId ?? null,
      days_since_signup: input.daysSinceSignup ?? null,
      source: input.source ?? null,
    },
  });
}

/** A plan started or moved up. `from` is null on a first paid plan. */
export async function trackPlanChanged(
  input: Base & {
    direction: "up" | "down";
    fromPlan?: string | null;
    toPlan?: string | null;
    interval?: string | null;
  },
): Promise<void> {
  await logAnalyticsEventServer({
    name:
      input.direction === "up"
        ? CONVERSION_EVENTS.plan_upgraded
        : CONVERSION_EVENTS.plan_downgraded,
    tenantId: input.tenantId ?? null,
    userId: input.userId ?? null,
    payload: {
      from_plan: input.fromPlan ?? null,
      to_plan: input.toPlan ?? null,
      interval: input.interval ?? null,
      source: input.source ?? null,
    },
  });
}
