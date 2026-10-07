/**
 * lib/stripe/webhook-lanes.ts
 *
 * Pure lane vocabulary for `stripe_processed_events`. No I/O, no server-only,
 * so the claim path, the health panel and tests share one definition.
 *
 * The stored `event_id` is `<lane>:<event.id>` for every lane except
 * `platform`, which keeps the bare id (see event-idempotency.ts). The `lane`
 * column (migration 20261231348000) records the lane explicitly so nothing has
 * to infer it from the id shape.
 */

export const WEBHOOK_LANES = ["platform", "platform_mx", "discover_client_subscription"] as const;

/** Which webhook route is claiming. */
export type WebhookLane = (typeof WEBHOOK_LANES)[number];

/** The lane that keeps the bare Stripe event id as its row key. */
export const BARE_ID_LANE: WebhookLane = "platform";

export function laneScopedEventKey(lane: WebhookLane, eventId: string): string {
  return lane === BARE_ID_LANE ? eventId : `${lane}:${eventId}`;
}

/**
 * Lane implied by a stored event_id. Used only for rows with a NULL `lane`
 * (legacy rows, or rows written by old code during the deploy window). Mirrors
 * the one-time SQL backfill: prefix before the first colon, no colon = platform.
 * Returns null for a prefix that is not a known lane.
 */
export function laneForEventId(storedEventId: string): WebhookLane | null {
  const i = storedEventId.indexOf(":");
  if (i < 0) return BARE_ID_LANE;
  const prefix = storedEventId.slice(0, i);
  return (WEBHOOK_LANES as readonly string[]).includes(prefix) ? (prefix as WebhookLane) : null;
}
