"use server";

/**
 * Client in-chat talent picker (feature 2.10).
 *
 * Lets the inquiry's own client propose adding a roster talent to their
 * lineup. Layered guards:
 *   1. session + the inquiry's client_user_id must match the caller
 *   2. the talent must be on the tenant's visible roster
 *      (assertAllTalentOnTenantRoster)
 *   3. the inquiry must be in a mutable phase (not booked/frozen)
 *   4. idempotent — re-adding an existing participant is a no-op success
 * The engine's addTalentToRoster re-validates the add_talent permission
 * (client role added to clientActions in inquiry-permissions.ts) and, when an
 * offer was already sent, invalidates it back to coordination so the
 * coordinator re-prices to include the new talent.
 */

import { revalidatePath } from "next/cache";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";
import { getTenantPortalScopeBySlug } from "@/lib/saas/scope";
import { assertAllTalentOnTenantRoster } from "@/lib/saas/talent-roster";
import { addTalentToRoster } from "@/lib/inquiry/inquiry-engine-roster";
import { isMutablePhase } from "@/lib/inquiry/inquiry-lifecycle";

export type ClientAddTalentResult = { ok: true } | { ok: false; error: string };

export async function clientAddTalentToInquiryAction(
  tenantSlug: string,
  inquiryId: string,
  talentProfileId: string,
): Promise<ClientAddTalentResult> {
  try {
    const supabase = await createSupabaseServerClient();
    if (!supabase) return { ok: false, error: "Service unavailable." };
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { ok: false, error: "Please sign in." };

    const scope = await getTenantPortalScopeBySlug(tenantSlug);
    if (!scope) return { ok: false, error: "Tenant not found." };
    const tenantId = scope.tenantId;

    const admin = createServiceRoleClient();
    if (!admin) return { ok: false, error: "Service unavailable." };

    const { data: inq } = await admin
      .from("inquiries")
      .select("id, client_user_id, version, status, is_frozen")
      .eq("id", inquiryId)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (!inq) return { ok: false, error: "Inquiry not found." };
    if ((inq.client_user_id as string | null) !== user.id) {
      return { ok: false, error: "This isn't your inquiry." };
    }
    if (!isMutablePhase(inq.status as string, (inq.is_frozen as boolean) ?? false)) {
      return { ok: false, error: "This inquiry can no longer be changed." };
    }

    // Roster guard — only a talent on the tenant's visible roster can be added.
    const roster = await assertAllTalentOnTenantRoster(admin, tenantId, [talentProfileId]);
    if (!roster.ok) {
      return { ok: false, error: "That talent isn't on this agency's visible roster." };
    }

    // Idempotency — already on this inquiry (any non-removed status) → success.
    const { data: existing } = await admin
      .from("inquiry_participants")
      .select("id, status")
      .eq("inquiry_id", inquiryId)
      .eq("talent_profile_id", talentProfileId)
      .eq("role", "talent")
      .maybeSingle();
    if (existing && existing.status !== "removed" && existing.status !== "declined") {
      return { ok: true };
    }

    const res = await addTalentToRoster(admin, {
      inquiryId,
      tenantId,
      talentProfileId,
      actorUserId: user.id,
      expectedVersion: Number(inq.version ?? 0),
      requirementGroupId: null,
    });
    if (!(res as { success?: boolean }).success) {
      const reason = (res as { reason?: string; error?: string }).reason ?? (res as { error?: string }).error ?? "could not add talent";
      // A version conflict means a concurrent edit raced us; surface a retryable
      // message rather than a hard failure.
      if (reason === "version_conflict") return { ok: false, error: "Someone just changed the lineup — please reopen and try again." };
      return { ok: false, error: "We couldn't add that talent. Please try again." };
    }

    // If an offer was already sent, addTalentToRoster invalidates it back to
    // coordination. Drop a thread note so everyone knows the coordinator must
    // re-send to include the new talent.
    const { data: inqAfter } = await admin
      .from("inquiries")
      .select("current_offer_id")
      .eq("id", inquiryId)
      .maybeSingle();
    if (inqAfter?.current_offer_id) {
      const { data: off } = await admin
        .from("inquiry_offers")
        .select("status")
        .eq("id", inqAfter.current_offer_id as string)
        .maybeSingle();
      if (off && (off.status === "invalidated" || off.status === "sent")) {
        await admin.from("inquiry_messages").insert({
          inquiry_id: inquiryId,
          tenant_id: tenantId,
          thread_type: "private",
          sender_user_id: null,
          body: "Client added a talent. The coordinator must re-send the offer to include them.",
          message_kind: "system_event",
          card_payload: { text: "Client added a talent — the coordinator must re-send the offer to include them." },
        });
      }
    }

    revalidatePath(`/${tenantSlug}/client/messages`);
    return { ok: true };
  } catch (err) {
    logServerError("clientAddTalentToInquiryAction", err);
    return { ok: false, error: "Unexpected error. Please try again." };
  }
}
