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
import type { TalentRatingSummary, TalentReview } from "./review-types";
import type { OwnerPrivateNote } from "./load-reviews";
import {
  loadOwnerPrivateNoteThemes,
  loadTalentRatingSummary,
  loadTalentReviewsForOwner,
} from "./load-reviews";

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
