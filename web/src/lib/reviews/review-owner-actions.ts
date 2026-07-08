"use server";

/**
 * Server-action wrappers that let CLIENT components (the talent dashboard card +
 * the profile-editor drawer "Reviews" section) read a talent's RECEIVED
 * (client→talent) reviews.
 *
 * Agent 1's `loadTalentReviewsForOwner` / `loadTalentRatingSummary` live in the
 * plain ./load-reviews module (server-only, callable from server components).
 * Admin-shell drawers and the talent dashboard are "use client" surfaces, so
 * they cannot import those directly — they need a server-action boundary. This
 * module is that boundary, owned by Agent 2 so Agent 1's contract file is left
 * untouched.
 *
 * Per the "use server" rule this module exports ONLY async functions; shared
 * types come from ./review-types.
 *
 * Auth model: the underlying reader uses the caller's own Supabase session, so
 * RLS does the gating — a talent sees their own received reviews (incl. hidden),
 * tenant staff/platform admin see their tenant's, and nobody else sees hidden
 * rows. No extra check is added here beyond requiring a session.
 */

import { requireSession } from "@/lib/server/action-guards";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import type { TalentRatingSummary, TalentReview } from "./review-types";
import type { OwnerPrivateNote } from "./load-reviews";
import {
  loadOwnerPrivateNoteThemes,
  loadTalentRatingSummary,
  loadTalentReviewsForOwner,
} from "./load-reviews";

const REPLY_MAX = 2000;

/**
 * A talent's received reviews (incl. hidden) plus their public rating summary,
 * for the owner (talent) or tenant staff/platform admin viewing the profile.
 * Returns an empty payload for signed-out callers or an unknown profile.
 */
export async function loadOwnerReceivedReviewsAction(
  talentProfileId: string,
): Promise<{ reviews: TalentReview[]; summary: TalentRatingSummary }> {
  const empty = { reviews: [], summary: { average: 0, count: 0 } };
  const auth = await requireSession();
  if (!auth.ok) return empty;

  const id = (talentProfileId ?? "").trim();
  if (!id) return empty;

  const [reviews, summary] = await Promise.all([
    loadTalentReviewsForOwner(id),
    loadTalentRatingSummary(id),
  ]);
  return { reviews, summary };
}

/**
 * Recent private coaching notes on the talent's OWN received reviews, for the
 * owner's talent-only "Growth notes" card. RLS scopes these to the subject
 * talent (they run as the authed owner via the cached server client), so this
 * never exposes another talent's coaching feedback. Returns an empty list for
 * signed-out callers, an unknown profile, or when there are no notes.
 */
export async function loadOwnerPrivateNoteThemesAction(
  talentProfileId: string,
): Promise<OwnerPrivateNote[]> {
  const auth = await requireSession();
  if (!auth.ok) return [];

  const id = (talentProfileId ?? "").trim();
  if (!id) return [];

  return loadOwnerPrivateNoteThemes(id);
}

/**
 * Post the talent's one-time public REPLY to a received review (their public
 * right-of-reply).
 *
 * The DB edit-guard (migration 20261110040000) blocks authenticated talent
 * UPDATEs of talent_reviews on every column except the reported_at path, so
 * the reply write cannot run as the caller's session. It runs on the
 * SERVICE-ROLE client — which the guard bypasses (auth.uid() IS NULL) — but
 * ONLY after an explicit ownership check: the authenticated caller must own the
 * reviewed talent's profile (talent_profiles.user_id === auth.uid()).
 *
 * Reply-once: rejected if reply_body is already set OR the row is already
 * locked. On success the UPDATE stamps reply_body, reply_at = now() and
 * locked_at = now() atomically — locked_at closes the client's edit window per
 * the edit-guard. Never throws; always returns the result shape.
 */
export async function submitReviewReplyAction(
  reviewId: string,
  replyBody: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const auth = await requireSession();
    if (!auth.ok) return { ok: false, error: "You must be signed in." };

    const id = (reviewId ?? "").trim();
    if (!id) return { ok: false, error: "Missing review." };

    const body = (replyBody ?? "").trim();
    if (!body) return { ok: false, error: "Reply cannot be empty." };
    if (body.length > REPLY_MAX) {
      return {
        ok: false,
        error: `Reply must be ${REPLY_MAX} characters or fewer.`,
      };
    }

    const svc = createServiceRoleClient();
    if (!svc) return { ok: false, error: "Not configured." };

    // Service-role read the review — need the reviewed profile + current
    // reply/lock state (both column-privilege / edit-guard protected paths).
    const { data: review, error: readErr } = await svc
      .from("talent_reviews")
      .select("id, talent_profile_id, reply_body, locked_at")
      .eq("id", id)
      .returns<
        {
          id: string;
          talent_profile_id: string;
          reply_body: string | null;
          locked_at: string | null;
        }[]
      >()
      .maybeSingle();

    if (readErr || !review) {
      return { ok: false, error: "Review not found." };
    }

    // Ownership — the caller must own the reviewed talent's profile.
    const { data: profileRow, error: profErr } = await svc
      .from("talent_profiles")
      .select("user_id")
      .eq("id", review.talent_profile_id)
      .returns<{ user_id: string | null }[]>()
      .maybeSingle();

    if (profErr || !profileRow?.user_id || profileRow.user_id !== auth.user.id) {
      return { ok: false, error: "You can only reply to your own reviews." };
    }

    // Reply-once.
    if (review.reply_body != null && review.reply_body.trim().length > 0) {
      return { ok: false, error: "You have already replied to this review." };
    }
    if (review.locked_at != null) {
      return { ok: false, error: "This review is locked and cannot be replied to." };
    }

    // Atomic reply write: set body + timestamps, and re-assert the once-only
    // guard in the filter so a concurrent double-submit can't double-write.
    const now = new Date().toISOString();
    const { data: updated, error: updErr } = await svc
      .from("talent_reviews")
      .update({ reply_body: body, reply_at: now, locked_at: now })
      .eq("id", id)
      .is("reply_body", null)
      .is("locked_at", null)
      .select("id")
      .returns<{ id: string }[]>();

    if (updErr) {
      return { ok: false, error: "Could not post your reply. Please try again." };
    }
    if (!updated || updated.length === 0) {
      // Row moved out from under the filter (already replied/locked meanwhile).
      return { ok: false, error: "You have already replied to this review." };
    }

    return { ok: true };
  } catch {
    return { ok: false, error: "Could not post your reply. Please try again." };
  }
}
