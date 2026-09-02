"use client";

import { getSessionId } from "@/lib/analytics/session-id";
import { trackProductEvent } from "@/lib/analytics/track-client";

/**
 * A/B tests for the marketing site.
 *
 * A framework already exists for BUILDER pages: the injected runtime in
 * `builder-node/render.tsx` fires `experiment_view` and `experiment_convert`
 * for tenant sites. It works, and `view_site_page` firing 2,205 times proves
 * the transport is fine. It has simply never been used: both experiment
 * events have zero rows in production.
 *
 * It also does not help marketing. The marketing pages are hand written React,
 * not builder documents, so there was no way to test the homepage headline,
 * the audience split, or any CTA. Every copy decision has been argued rather
 * than measured, including the positioning change that just shipped.
 *
 * This is the marketing side of the same idea, sharing the SAME event names so
 * one analysis reads both surfaces.
 *
 * WHY THIS COULD NOT EXIST BEFORE. Bucketing needs a stable per-visitor key.
 * Until session ids shipped, every marketing event was unjoinable, so a visitor
 * could be assigned an arm and there was no way to tell which arm the person
 * who converted had seen. The test would have produced numbers that could not
 * be attributed. Bucketing on the session id fixes that.
 */

export type Variant = "control" | "treatment";

/**
 * FNV-1a. Small, dependency free, and evenly distributed for short strings,
 * which is all a two-arm split needs.
 */
function hash(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/**
 * Which arm this visit is in, or null when it cannot be decided.
 *
 * DETERMINISTIC, not random: the same session and experiment always give the
 * same arm, so a reader who scrolls away and comes back does not see the page
 * change under them, and a conversion can be attributed to the arm that
 * actually produced it.
 *
 * Salted with the experiment id so two experiments running at once do not
 * assign correlated arms to the same people, which would make either result
 * unreadable.
 *
 * Null when there is no session id (blocked storage, server render). The
 * caller must render the CONTROL in that case: a visitor we cannot measure
 * must not be shown the untested variant.
 */
export function assignVariant(experimentId: string): Variant | null {
  const session = getSessionId();
  if (!session) return null;
  return bucketOf(`${experimentId}:${session}`) < 50 ? "control" : "treatment";
}

/**
 * A 0-99 bucket from the TOP bits of the hash.
 *
 * Not `hash % 2`, which is what this did first and which a test caught.
 * FNV-1a multiplies by an odd prime, so the low bit of the result is just the
 * parity of the input bytes. `"exp-a"` and `"exp-b"` differ by one in their
 * last character, so every session landed in OPPOSITE arms for the two
 * experiments: 0 out of 200 agreed. Two experiments running at once would
 * have contaminated each other completely and neither result could have been
 * believed.
 *
 * Taking the top bits discards that structure, and a 0-99 bucket leaves room
 * for splits other than 50/50 later.
 */
function bucketOf(key: string): number {
  return Math.floor((hash(key) / 0x100000000) * 100);
}

/** Record that this arm was SEEN. Without it there is no denominator. */
export function trackExperimentView(experimentId: string, variant: Variant): void {
  trackProductEvent("experiment_view", { experiment_id: experimentId, variant });
}

/**
 * Record the outcome the experiment is measuring.
 *
 * Pass the same variant that was shown. Re-deriving it here would silently
 * mis-attribute anyone whose storage was cleared mid visit.
 */
export function trackExperimentConvert(experimentId: string, variant: Variant): void {
  trackProductEvent("experiment_convert", { experiment_id: experimentId, variant });
}
