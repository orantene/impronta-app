/**
 * Canonical plain-English status label maps and helpers.
 *
 * Framework-agnostic: plain data + pure helper functions only.
 * No React, no i18n translator calls.
 *
 * DESIGN NOTES
 * ─────────────
 * Several surfaces have their own label sets that are intentionally NOT merged
 * here. Each is documented below so future authors know the reason:
 *
 * 1. STAGE_COLORS in ClientMessagesShell.tsx — i18n-keyed via `dashboard.*`
 *    namespace. Labels are resolved at render time through the translator;
 *    only the colors live in that dict. Merging would break locale switching.
 *
 * 2. InquiryStatusChip in admin/work/[id]/page.tsx — also i18n-keyed
 *    (`admin.work.detail.inquiryStatus.*`). Same reason as #1.
 *
 * 3. INQUIRY_STATUS_LABELS in client/messages/DetailsTab.tsx — client-facing
 *    wording that intentionally differs from the admin canonical set (e.g.
 *    "In review" not "Coordination", "Declined" not "Rejected"). Merging would
 *    require auditing every surface; left in place with a cross-reference.
 *
 * 4. BOOKING_STATUS_CLIENT / PAYMENT_STATUS_CLIENT in client-booking-copy.ts —
 *    consumer-friendly rewords ("Planning" for "draft", "Paid in full" for
 *    "paid"). These intentionally differ and must not be aliased to the admin
 *    set.
 *
 * 5. STATUS_LABEL in admin/inspector/modules/talent-inspector.tsx — describes
 *    talent PROFILE states (draft/under_review/approved/…), not inquiry or
 *    booking statuses. Different domain, left in place.
 *
 * 6. stageMeta inside ShortlistCard (admin/shell/internal/client.tsx) — an
 *    inline dict for the SHORTLIST workflow (draft/shared/inquiry-sent/booked).
 *    Different entity type; the "booked" meaning is shortlist-booked, not
 *    inquiry-booked.
 *
 * 7. STATUS_COPY_KEYS in mini-chat-styles.ts — GuestThreadStatus enum mapped to
 *    i18n keys (`public.guestChat.*`). i18n path; correct to leave.
 *
 * 8. PITCH_STATUS_TONE in PitchesPage-1.tsx — pitch workflow, different entity.
 *
 * What IS centralized here:
 *   - INQUIRY_STATUS_LABELS  (canonical admin-side labels, authoritative source)
 *   - TRANSACTION_STATUS_LABELS (booking_transactions.status labels)
 *   - helper: inquiryStatusLabel(status)
 *   - helper: transactionStatusLabel(status)
 *
 * INQUIRY_STAGE_META in fixtures.ts and PAYMENT_STATUS_META are richer
 * (tone + description) and live inside the admin shell state. They are
 * deliberately not moved here because they depend on the shell's tone tokens
 * and are already exported from the shell state barrel.
 */

/** Humanize a raw DB snake_case status string (fallback). */
export function humanizeStatus(status: string): string {
  return status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

// ─── Inquiry statuses ────────────────────────────────────────────────────────

/**
 * Admin-canonical inquiry status labels.
 *
 * Covers both the current pipeline statuses and legacy ones (new/reviewing/…)
 * that appear in older rows. This is the single source of truth for
 * non-localised admin surfaces.
 *
 * Surfaces using this:
 *   - lib/inquiries.ts  (re-exports this)
 *   - admin-inquiry-list-row-actions.tsx  (via lib/inquiries.ts)
 *   - admin-client-inquiries-panel.tsx  was using a different, smaller subset
 *     with different wording — see note #3 in the header above.
 */
export const INQUIRY_STATUS_LABELS: Record<string, string> = {
  // Current pipeline statuses
  draft: "Draft",
  submitted: "Submitted",
  coordination: "Coordination",
  offer_pending: "Offer pending",
  offer_sent: "Offer sent",
  approved: "Approved",
  booked: "Booked",
  converted: "Booked",
  rejected: "Rejected",
  expired: "Expired",
  cancelled: "Cancelled",
  closed: "Closed",
  closed_lost: "Closed (lost)",
  archived: "Archived",
  // Legacy / older statuses present on historical rows
  new: "New",
  reviewing: "Under review",
  waiting_for_client: "Waiting for you",
  talent_suggested: "Talent suggested",
  in_progress: "In progress",
  qualified: "Qualified",
};

/** Return a human-readable label for an inquiry status. */
export function inquiryStatusLabel(status: string): string {
  return INQUIRY_STATUS_LABELS[status] ?? humanizeStatus(status);
}

// ─── Booking transaction statuses ────────────────────────────────────────────

/**
 * Friendly labels for booking_transactions.status enum.
 *
 * Previously defined inline in machinery-6.tsx (TRANSACTION_STATUS_LABEL).
 * That file's export is preserved as a re-export to avoid breaking callers.
 */
export const TRANSACTION_STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  payment_requested: "Payment requested",
  pending: "Pending",
  paid: "Paid",
  payout_pending: "Payout pending",
  payout_sent: "Payout sent",
  cancelled: "Cancelled",
  failed: "Failed",
  disputed: "Disputed",
  refunded: "Refunded",
};

/** Return a human-readable label for a booking transaction status. */
export function transactionStatusLabel(status: string): string {
  return TRANSACTION_STATUS_LABELS[status] ?? humanizeStatus(status);
}
