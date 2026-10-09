/**
 * Synthetic last-message previews the talent inbox bridge stamps when there
 * is no real thread text yet. English keys; Spanish rows live in
 * dashboard-i18n-inbox.ts. inboxPreviewText always translates these, even when
 * the adapter tags the row as coordinator (so the agency prefix stays).
 */

export const INBOX_PREVIEW_AWAITING = "Awaiting your response.";
export const INBOX_PREVIEW_BOOKED = "Booking confirmed. Check the logistics tab.";

/** Prior key with an em dash; kept so any leftover call sites still translate. */
export const INBOX_PREVIEW_BOOKED_LEGACY = "Booking confirmed — check logistics tab.";

const GENERATED = new Set<string>([
  INBOX_PREVIEW_AWAITING,
  INBOX_PREVIEW_BOOKED,
  INBOX_PREVIEW_BOOKED_LEGACY,
]);

export function isGeneratedInboxPreview(preview: string): boolean {
  return GENERATED.has(preview);
}
