"use server";

/**
 * Admin-suggested-talent — server action for the chat-card CTA.
 *
 * Inquiry-funnel sprint — Step 7.
 *
 * Flow:
 *   1. Admin (or staff) attaches a SuggestedTalentCard to a Client-thread
 *      message. card_payload carries { talent_profile_id, talent_name,
 *      rate_label?, requirement_group_id?, status: "pending" }.
 *   2. Client (or admin themselves) clicks "Add to lineup".
 *   3. This action validates staff scope, calls the existing
 *      `addTalentToRoster` engine (RLS-fixed in 7984128cb), then flips
 *      the originating message's card_payload.status to "added".
 *
 * TODO (composer-side, follow-up): the upstream insert that creates the
 * 'admin_suggested_talent' message in the first place is not yet wired
 * — admin currently has no UI to pick a talent + attach. This commit
 * ships the render + click-handler side only.
 */

import { revalidatePath } from "next/cache";
import { addTalentToRoster } from "@/lib/inquiry/inquiry-engine";
import { requireStaffTenantAction } from "@/lib/saas/admin-scope";
import { logServerError } from "@/lib/server/safe-error";

export type AdminAddSuggestedTalentResult =
  | { ok: true }
  | { ok: false; error: string };

export async function adminAddSuggestedTalent(args: {
  inquiryId: string;
  talentProfileId: string;
  /** Optional — falls back to the inquiry's default requirement group. */
  requirementGroupId?: string | null;
  /** Optional — when set, this message's card_payload.status flips to "added". */
  messageId?: string | null;
}): Promise<AdminAddSuggestedTalentResult> {
  const inquiryId = args.inquiryId?.trim() ?? "";
  const talentProfileId = args.talentProfileId?.trim() ?? "";
  const requirementGroupId = args.requirementGroupId?.trim() || null;
  const messageId = args.messageId?.trim() || null;

  if (!inquiryId || !talentProfileId) {
    return { ok: false, error: "Missing inquiry or talent." };
  }

  const auth = await requireStaffTenantAction();
  if (!auth.ok) {
    return { ok: false, error: auth.error };
  }
  const { supabase, user, tenantId } = auth;

  // Pull the inquiry's current version so the engine's optimistic-lock
  // check passes. We don't expose the version to the chat-card caller
  // (the click happens inside the thread; UI doesn't track it).
  const { data: inq, error: inqErr } = await supabase
    .from("inquiries")
    .select("version")
    .eq("id", inquiryId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (inqErr || !inq) {
    return { ok: false, error: "Inquiry not found." };
  }
  const expectedVersion = Number(inq.version ?? 1);

  const res = await addTalentToRoster(supabase, {
    inquiryId,
    tenantId,
    talentProfileId,
    actorUserId: user.id,
    expectedVersion: Number.isFinite(expectedVersion) ? expectedVersion : 1,
    requirementGroupId,
  });

  if (!res.success) {
    if (res.forbidden) {
      return { ok: false, error: "You cannot edit this lineup." };
    }
    if (res.conflict) {
      return { ok: false, error: "Inquiry was updated. Refresh and try again." };
    }
    if (res.reason === "post_booking_immutable") {
      return { ok: false, error: "Lineup is locked after booking." };
    }
    return { ok: false, error: res.error ?? "Could not add talent." };
  }

  // Flip the originating message's card status → 'added'. Fire-and-forget
  // — never block the user-visible action on this cosmetic update.
  if (messageId) {
    const { data: msg } = await supabase
      .from("inquiry_messages")
      .select("card_payload, message_kind")
      .eq("id", messageId)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (msg && msg.message_kind === "admin_suggested_talent") {
      const existing = (msg.card_payload as Record<string, unknown> | null) ?? {};
      const nextPayload = { ...existing, status: "added" };
      const { error: updErr } = await supabase
        .from("inquiry_messages")
        .update({ card_payload: nextPayload })
        .eq("id", messageId)
        .eq("tenant_id", tenantId);
      if (updErr) {
        logServerError("admin-suggested-talent.flip-status", updErr);
      }
    }
  }

  revalidatePath("/", "layout");
  return { ok: true };
}
