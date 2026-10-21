"use server";

import { z } from "zod";
import { getCachedServerSupabase } from "@/lib/server/request-cache";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { requireNotImpersonating } from "@/lib/impersonation/readonly-guard";
import { answerOwnOfferLine, readOfferLineAnswers } from "@/lib/coordinator/offer-line-confirmation.server";
import { buildOfferLineConfirmationView } from "@/lib/coordinator/offer-line-confirmation-view";
import { requireInquiryManagerAction } from "@/lib/saas/admin-scope";
import { logServerError } from "@/lib/server/safe-error";

/**
 * TUL-1607: a person answers for THEIR OWN line of an offer. The signed-in user
 * comes from the session (never the input); answerOwnOfferLine refuses any line
 * whose current person is not theirs. Other lines are never touched.
 */
export async function answerMyOfferLineAction(input: { lineId: string; status: "confirmed" | "declined" }) {
  await requireNotImpersonating();
  const parsed = z.object({ lineId: z.string().uuid(), status: z.enum(["confirmed", "declined"]) }).safeParse(input);
  if (!parsed.success) return { ok: false as const, reason: "invalid" as const };
  const supabase = await getCachedServerSupabase();
  if (!supabase) return { ok: false as const, reason: "unavailable" as const };
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) return { ok: false as const, reason: "not_signed_in" as const };
  const admin = createServiceRoleClient();
  if (!admin) return { ok: false as const, reason: "unavailable" as const };
  return answerOwnOfferLine(admin, { userId: user.id, lineId: parsed.data.lineId, status: parsed.data.status });
}

/**
 * TUL-1608: the per-line readiness view for one offer. A manager (staff or the
 * appointed coordinator of this inquiry) sees every talent line; anyone else
 * sees only the lines that are theirs. Read-only and fail-closed: any error
 * returns no view, and unreadable answers are Awaiting (never Confirmed).
 */
export async function loadOfferLineConfirmationViewAction(input: { inquiryId: string; offerId?: string }) {
  const parsed = z.object({ inquiryId: z.string().uuid(), offerId: z.string().uuid().optional() }).safeParse(input);
  if (!parsed.success) return { ok: false as const };
  try {
    const supabase = await getCachedServerSupabase();
    if (!supabase) return { ok: false as const };
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();
    if (error || !user) return { ok: false as const };
    const admin = createServiceRoleClient();
    if (!admin) return { ok: false as const };

    // Defence in depth: identity FIRST. A caller who is neither a manager of this inquiry nor the
    // owner of a talent profile never makes the service role read an offer or its lines.
    // The bail below checks "has any talent profile", not "has a line here": the per-line filter further
    // down is what narrows a talent to their own lines.
    const [guard, mineRes] = await Promise.all([
      requireInquiryManagerAction(parsed.data.inquiryId),
      // eslint-disable-next-line ratchet/no-untenanted-from -- talent_profiles is global: the signed-in person's own profiles, by their user id
      admin.from("talent_profiles").select("id").eq("user_id", user.id),
    ]);
    const ownProfileIds = ((mineRes.data ?? []) as Array<{ id: string }>).map((p) => p.id);
    if (!guard.ok && (mineRes.error || ownProfileIds.length === 0)) return { ok: false as const };

    // The talent surface has no offer id, so it passes none: use the inquiry's current offer.
    let offerId = parsed.data.offerId;
    if (!offerId) {
      // eslint-disable-next-line ratchet/no-untenanted-from -- resolves the inquiry's own current offer by its id; access is gated by requireInquiryManagerAction / own-line filtering below
      const inqRes = await admin.from("inquiries").select("current_offer_id").eq("id", parsed.data.inquiryId).maybeSingle();
      offerId = ((inqRes.data as { current_offer_id?: string | null } | null)?.current_offer_id ?? undefined) || undefined;
      if (inqRes.error || !offerId) return { ok: false as const };
    }
    // eslint-disable-next-line ratchet/no-untenanted-from -- the tenant comes FROM this offer row (checked against the inquiry id)
    const offerRes = await admin
      .from("inquiry_offers")
      .select("id, inquiry_id, tenant_id, status")
      .eq("id", offerId)
      .maybeSingle();
    const offer = offerRes.data as { id: string; inquiry_id: string; tenant_id: string; status: string | null } | null;
    if (offerRes.error || !offer || offer.inquiry_id !== parsed.data.inquiryId) return { ok: false as const };
    // Readiness is shown on sent offers only, never on a draft.
    if (offer.status === "draft") return { ok: false as const };

    const [linesRes, read] = await Promise.all([
      admin
        .from("inquiry_offer_line_items")
        .select("id, label, talent_profile_id, sort_order, talent_profiles ( display_name )")
        .eq("tenant_id", offer.tenant_id)
        .eq("offer_id", offer.id)
        .order("sort_order", { ascending: true }),
      readOfferLineAnswers(admin, { tenantId: offer.tenant_id, offerId: offer.id }),
    ]);
    // Unreadable answers: show nothing, so it never looks like "0 of N confirmed".
    if (linesRes.error || !read.ok) return { ok: false as const };

    const lines = (
      (linesRes.data ?? []) as unknown as Array<{
        id: string;
        label: string | null;
        talent_profile_id: string | null;
        talent_profiles: { display_name: string | null } | null;
      }>
    ).map((r) => ({
      id: r.id,
      kind: r.talent_profile_id ? ("talent" as const) : ("custom" as const),
      talentProfileId: r.talent_profile_id,
      label: r.talent_profiles?.display_name ?? r.label ?? "",
    }));

    const view = buildOfferLineConfirmationView({ lines, read, viewer: { manager: guard.ok, ownProfileIds } });
    if (!guard.ok && view.rows.length === 0) return { ok: false as const };
    return { ok: true as const, view };
  } catch (err) {
    logServerError("offerLines.view", err);
    return { ok: false as const };
  }
}
