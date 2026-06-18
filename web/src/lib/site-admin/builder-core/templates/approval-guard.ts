/**
 * approval-guard.ts — G4 two-person approval, pure logic.
 *
 * Splits the deterministic decisions out of the DB-backed server actions in
 * registry-actions.ts so they can be unit-tested without Supabase:
 *   - `isSelfApprove` — the self-approve guard predicate (reviewer == submitter)
 *   - `buildSubmitStamp` / `buildReviewStamp` — the provenance patches stamped
 *     onto builder_templates when a template enters review or is acted on.
 *
 * The actions own the auth gate + the Supabase write; these helpers own the
 * shape of what gets written and the block-self-approve verdict.
 */

import { normalizeChangelog } from "./registry-rows";

/** Columns stamped when a template is submitted for review. */
export interface SubmitStamp {
  submitted_by: string;
  submitted_at: string;
  /** A fresh submit clears any prior review provenance — a re-submitted
   *  template has not yet been reviewed in its new round. */
  reviewed_by: null;
  reviewed_at: null;
  review_note: null;
}

/** Columns stamped when a reviewer acts (publish-approval or reject). */
export interface ReviewStamp {
  reviewed_by: string;
  reviewed_at: string;
  /** Normalized reviewer note (e.g. a rejection reason). `undefined` ⇒ leave
   *  the column untouched; blank ⇒ null. Mirrors normalizeChangelog. */
  review_note?: string | null;
}

/**
 * The self-approve guard predicate. Returns true when the acting reviewer is
 * the same person who submitted the template for review — i.e. the publish
 * should be blocked when two-person approval is enforced.
 *
 * Pure + total: a missing submitter (null/undefined) is NOT a self-approve
 * (nobody to collide with), so an un-stamped legacy row never falsely blocks.
 */
export function isSelfApprove(
  submittedBy: string | null | undefined,
  reviewerId: string,
): boolean {
  if (!submittedBy) return false;
  return submittedBy === reviewerId;
}

/** Build the submit-for-review provenance patch. `now` defaults to wall clock. */
export function buildSubmitStamp(
  submittedBy: string,
  now: string = new Date().toISOString(),
): SubmitStamp {
  return {
    submitted_by: submittedBy,
    submitted_at: now,
    reviewed_by: null,
    reviewed_at: null,
    review_note: null,
  };
}

/**
 * Build the reviewer-action provenance patch. `note` is normalized through the
 * shared `normalizeChangelog` rule (undefined ⇒ omit the column; blank ⇒ null;
 * else trimmed). `now` defaults to wall clock.
 */
export function buildReviewStamp(
  reviewerId: string,
  note?: string | null,
  now: string = new Date().toISOString(),
): ReviewStamp {
  const stamp: ReviewStamp = {
    reviewed_by: reviewerId,
    reviewed_at: now,
  };
  const normalized = normalizeChangelog(note);
  if (normalized !== undefined) {
    stamp.review_note = normalized;
  }
  return stamp;
}
