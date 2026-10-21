"use server";

/**
 * TUL-1463: "Leave a review" from `/account/visits/<id>`.
 *
 * The decision is the pure `decideVisitReview` (owner, this host's tenant, completed visit,
 * one review per visit, an open request reused). The write is the EXISTING review path,
 * `submitTalentReviewAction`: the client's own session, the DB verify trigger and RLS
 * (completed / paid-and-ended only), published like every other review and subject to the
 * same moderation (the talent can report it, staff can hide it; a hidden review still
 * counts as this visit's one review). No new insert path.
 */

import { z } from "zod";

import { assertNotImpersonating } from "@/lib/impersonation/readonly-guard";
import { submitTalentReviewAction } from "@/lib/reviews/review-actions";
import { getCachedActorSession } from "@/lib/server/request-cache";

import { isClientAccountEligible } from "./pure";
import { accountSurfaceEnabledForRequest, resolveAccountTenant } from "./tenant.server";
import { decideVisitReview, type VisitReviewBlock } from "./visit-review";
import { loadVisitReviewFacts, readHostTalentProfileId } from "./visit-review.server";

export type LeaveReviewRefusal = VisitReviewBlock | "invalid" | "unavailable" | "already_reviewed" | "use_request" | "failed";

export async function leaveVisitReview(input: {
  bookingId: string;
  rating: number;
  body: string;
}): Promise<{ ok: true } | { ok: false; reason: LeaveReviewRefusal }> {
  if (!(await assertNotImpersonating()).ok) return { ok: false, reason: "unavailable" };
  const parsed = z
    .object({ bookingId: z.string().uuid(), rating: z.number().int().min(1).max(5), body: z.string().max(4000) })
    .safeParse(input);
  if (!parsed.success) return { ok: false, reason: "invalid" };
  if (!(await accountSurfaceEnabledForRequest())) return { ok: false, reason: "unavailable" };
  const session = await getCachedActorSession();
  const userId = session.user?.id ?? null;
  if (!userId) return { ok: false, reason: "not_signed_in" };
  if (!isClientAccountEligible(session.profile?.app_role ?? null)) return { ok: false, reason: "not_owner" };
  const tenant = await resolveAccountTenant();
  if (!tenant) return { ok: false, reason: "unavailable" };
  const facts = await loadVisitReviewFacts(userId, tenant.tenantId, parsed.data.bookingId);
  // Another tenant's booking, or one that does not exist, reads as "not yours".
  if (!facts) return { ok: false, reason: "not_owner" };
  const state = decideVisitReview({ sessionUserId: userId, siteTenantId: tenant.tenantId, hostTalentProfileId: await readHostTalentProfileId(), facts });
  if (state.kind === "none") return { ok: false, reason: state.reason };
  if (state.kind === "done") return { ok: false, reason: "already_reviewed" };
  if (state.kind === "request") return { ok: false, reason: "use_request" };
  const res = await submitTalentReviewAction(tenant.slug, facts.bookingId, state.talentProfileId, parsed.data.rating, parsed.data.body);
  return res.ok ? { ok: true } : { ok: false, reason: "failed" };
}
