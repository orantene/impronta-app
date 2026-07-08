"use server";

/**
 * Server-action boundary for the reported-reviews QUEUE (a "use client" admin
 * surface). The queue cannot import the plain ./review-moderation-loaders
 * server module directly, so this file is that boundary — it mirrors how
 * ./review-owner-actions wraps ./load-reviews.
 *
 * Per the "use server" rule this module exports ONLY async functions; shared
 * types come from the plain ./review-moderation-loaders module. The staff gate
 * lives in the underlying loaders (requireStaff), so these wrappers add no extra
 * check beyond delegating. Hide/unhide is not re-implemented here — it reuses
 * the existing adminHideReviewAction (which already writes the immutable
 * review_moderation_events audit row with the reason code).
 */

import {
  loadModerationIntegritySignals,
  loadReportedReviews,
  type ModerationIntegritySignal,
  type ReportedReview,
} from "./review-moderation-loaders";

/** Reported (subject-flagged) reviews for a tenant, staff-scoped. */
export async function loadReportedReviewsAction(
  tenantId: string,
): Promise<ReportedReview[]> {
  return loadReportedReviews(tenantId);
}

/** Per-talent laundering-fingerprint signals for a tenant, staff-scoped. */
export async function loadModerationIntegritySignalsAction(
  tenantId: string,
): Promise<ModerationIntegritySignal[]> {
  return loadModerationIntegritySignals(tenantId);
}
