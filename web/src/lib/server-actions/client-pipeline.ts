"use server";

/**
 * Client-side pipeline server actions for the prototype client shell.
 *
 * Mirrors `talent-pipeline.ts`: any authenticated user, with engine-level
 * permission validation per action. The client surface uses these to
 * Approve / Counter-reject the current offer, send messages on the
 * private (client) thread, and request payment-related actions.
 *
 * All wrappers translate `EngineResult` to a flat `{ ok, error }` shape.
 */

import { revalidatePath } from "next/cache";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { logServerError } from "@/lib/server/safe-error";
import { clientAcceptOffer } from "@/lib/inquiry/inquiry-engine-approvals";
import { clientRejectOffer } from "@/lib/inquiry/inquiry-engine-offers";

export type ClientActionResult = { ok: true } | { ok: false; error: string };

async function loadClientInquiryContext(inquiryId: string): Promise<
  | { ok: false; error: string }
  | {
      ok: true;
      supabase: import("@supabase/supabase-js").SupabaseClient;
      userId: string;
      tenantId: string;
      version: number;
      currentOfferId: string | null;
    }
> {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return { ok: false, error: "Database unavailable." };
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not authenticated." };

  const { data: inq } = await supabase
    .from("inquiries")
    .select("tenant_id, version, current_offer_id, client_user_id")
    .eq("id", inquiryId)
    .maybeSingle();
  if (!inq) return { ok: false, error: "Inquiry not found." };
  // The client_user_id check below is a belt-and-suspenders gate — the
  // engine itself uses participant-role validation, so even if a user
  // with no client_user_id binding tried this they'd be rejected at
  // validateActorPermission. But fail fast here for cleaner error copy.
  if (inq.client_user_id && inq.client_user_id !== user.id) {
    return { ok: false, error: "Not your inquiry." };
  }

  return {
    ok: true,
    supabase,
    userId: user.id,
    tenantId: inq.tenant_id as string,
    version: (inq.version as number | null) ?? 1,
    currentOfferId: (inq.current_offer_id as string | null) ?? null,
  };
}

/**
 * Client approves the current offer on an inquiry. Records the approval
 * via the engine's `clientAcceptOffer` (which resolves the client's
 * participant row and writes to `inquiry_approvals` + advances the
 * inquiry to `approved` once all approvals land).
 */
export async function clientApproveCurrentOffer(inquiryId: string): Promise<ClientActionResult> {
  try {
    const ctx = await loadClientInquiryContext(inquiryId);
    if (!ctx.ok) return ctx;
    if (!ctx.currentOfferId) return { ok: false, error: "No active offer to approve yet." };

    const result = await clientAcceptOffer(ctx.supabase, {
      inquiryId,
      tenantId: ctx.tenantId,
      offerId: ctx.currentOfferId,
      actorUserId: ctx.userId,
      expectedVersion: ctx.version,
    });
    if (!result.success) {
      const reason = (result as { reason?: string; error?: string }).reason
        ?? (result as { error?: string }).error
        ?? "Could not approve offer.";
      const friendly =
        reason === "no_client_participant" ? "We couldn't find your client record on this inquiry."
        : reason === "version_conflict" ? "This inquiry was updated — refresh and retry."
        : reason === "forbidden" ? "You don't have permission to approve this offer."
        : reason;
      return { ok: false, error: friendly };
    }
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (err) {
    logServerError("client-pipeline.clientApproveCurrentOffer", err);
    return { ok: false, error: "Unexpected error." };
  }
}

/**
 * Client rejects the current offer. Optional `reason` + `reasonText`.
 * Sends the inquiry back to coordination so the agency can counter.
 */
export async function clientRejectCurrentOffer(
  inquiryId: string,
  reason: "too_expensive" | "wrong_talent" | "timing" | "changed_plans" | "other" = "other",
  reasonText?: string,
): Promise<ClientActionResult> {
  try {
    const ctx = await loadClientInquiryContext(inquiryId);
    if (!ctx.ok) return ctx;
    if (!ctx.currentOfferId) return { ok: false, error: "No active offer to reject." };

    const result = await clientRejectOffer(ctx.supabase, {
      inquiryId,
      tenantId: ctx.tenantId,
      offerId: ctx.currentOfferId,
      actorUserId: ctx.userId,
      expectedVersion: ctx.version,
      rejectionReason: reason,
      rejectionReasonText: reasonText ?? null,
    });
    if (!result.success) {
      const r = (result as { reason?: string; error?: string }).reason
        ?? (result as { error?: string }).error
        ?? "Could not reject offer.";
      return { ok: false, error: r };
    }
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (err) {
    logServerError("client-pipeline.clientRejectCurrentOffer", err);
    return { ok: false, error: "Unexpected error." };
  }
}

/**
 * Client sends a message on the private (client) thread. Bypasses the
 * staff-capability gate by validating the actor is the inquiry's client.
 */
export async function sendInquiryMessageAsClient(
  inquiryId: string,
  body: string,
): Promise<ClientActionResult> {
  try {
    const trimmed = body.trim();
    if (!trimmed) return { ok: false, error: "Message body is empty." };
    if (trimmed.length > 10000) return { ok: false, error: "Message too long." };

    const ctx = await loadClientInquiryContext(inquiryId);
    if (!ctx.ok) return ctx;

    const { error } = await ctx.supabase
      .from("inquiry_messages")
      .insert({
        inquiry_id: inquiryId,
        thread_type: "private",
        sender_user_id: ctx.userId,
        body: trimmed,
        tenant_id: ctx.tenantId,
      });
    if (error) {
      logServerError("client-pipeline.sendInquiryMessageAsClient", error);
      return { ok: false, error: "Failed to send message." };
    }

    revalidatePath("/", "layout");
    return { ok: true };
  } catch (err) {
    logServerError("client-pipeline.sendInquiryMessageAsClient", err);
    return { ok: false, error: "Unexpected error." };
  }
}
