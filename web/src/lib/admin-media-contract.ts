/**
 * Contract for agency staff ↔ talent media pipeline (admin UI to be layered on top).
 * RLS: `media_write_staff` allows staff full access; app-layer actions use `requireStaff()`.
 */

export type StaffMediaApprovalState = "pending" | "approved" | "rejected";

/** Optional keys inside `media_assets.metadata` for future staff review UI (no migration required). */
export const STAFF_MEDIA_METADATA_KEYS = {
  lastReviewedAt: "staff_last_reviewed_at",
  reviewedByUserId: "staff_reviewed_by_user_id",
  notes: "staff_notes",
} as const;

export type StaffMediaMetadata = {
  [STAFF_MEDIA_METADATA_KEYS.lastReviewedAt]?: string;
  [STAFF_MEDIA_METADATA_KEYS.reviewedByUserId]?: string;
  [STAFF_MEDIA_METADATA_KEYS.notes]?: string;
};
