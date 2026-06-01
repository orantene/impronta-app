"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { getTenantPortalScopeBySlug } from "@/lib/saas/scope";
import { logServerError } from "@/lib/server/safe-error";
import type { ServerActionResult } from "@/lib/server-actions/result";
import { clientAcceptOffer } from "@/lib/inquiry/inquiry-engine-approvals";
import { clientRejectOffer } from "@/lib/inquiry/inquiry-engine-offers";

export type SendClientInquiryMessageResult = ServerActionResult<{
  id: string;
  created_at: string;
}>;

function returnToThread(
  tenantSlug: string,
  inquiryId: string,
  params: URLSearchParams,
): never {
  redirect(`/${tenantSlug}/client/inquiries/${inquiryId}?${params.toString()}`);
}

export async function sendClientInquiryMessage(
  tenantSlug: string,
  inquiryId: string,
  body: string,
): Promise<SendClientInquiryMessageResult> {
  const trimmed = body.trim();
  if (!trimmed || trimmed.length > 10000) {
    return { ok: false, error: "Message is empty or too long." };
  }

  const scope = await getTenantPortalScopeBySlug(tenantSlug);
  if (!scope) {
    return { ok: false, error: "Workspace not found." };
  }

  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return { ok: false, error: "Database unavailable." };
  }

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: "Not authenticated." };
  }

  const { data: inquiry } = await supabase
    .from("inquiries")
    .select("id")
    .eq("id", inquiryId)
    .eq("tenant_id", scope.tenantId)
    .eq("client_user_id", user.id)
    .maybeSingle();
  if (!inquiry) {
    return { ok: false, error: "You cannot message on this inquiry." };
  }

  const { data, error: insertError } = await supabase
    .from("inquiry_messages")
    .insert({
      inquiry_id: inquiryId,
      thread_type: "private",
      sender_user_id: user.id,
      body: trimmed,
      tenant_id: scope.tenantId,
    })
    .select("id, created_at")
    .single();

  if (insertError) {
    logServerError("client.thread.send", insertError);
    return { ok: false, error: "Could not send message." };
  }

  const { error: readErr } = await supabase.rpc("inquiry_mark_thread_read", {
    p_inquiry_id: inquiryId,
    p_thread_type: "private",
  });
  if (readErr) {
    logServerError("client.thread.markRead", readErr);
  }

  revalidatePath(`/${tenantSlug}/client/inquiries/${inquiryId}`);
  revalidatePath(`/${tenantSlug}/client/inquiries`);
  return { ok: true, data: { id: data.id, created_at: data.created_at } };
}

export async function markClientInquiryThreadRead(
  tenantSlug: string,
  inquiryId: string,
): Promise<void> {
  const scope = await getTenantPortalScopeBySlug(tenantSlug);
  if (!scope) return;

  const supabase = await createSupabaseServerClient();
  if (!supabase) return;

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  const { data: inquiry } = await supabase
    .from("inquiries")
    .select("id")
    .eq("id", inquiryId)
    .eq("tenant_id", scope.tenantId)
    .eq("client_user_id", user.id)
    .maybeSingle();
  if (!inquiry) return;

  const { error } = await supabase.rpc("inquiry_mark_thread_read", {
    p_inquiry_id: inquiryId,
    p_thread_type: "private",
  });
  if (error) {
    logServerError("client.thread.markRead", error);
  }
}

/**
 * Client approves an active offer. Translates the engine result to a
 * flat ServerActionResult and revalidates the inquiry path so the page
 * re-renders into the approved state on the next request.
 *
 * Phase A PR 4 — client offer-response surface. The engine
 * (`clientAcceptOffer`) handles version-conflict + tenant scope + RLS;
 * we just translate.
 */
export async function clientApproveOfferAction(
  tenantSlug: string,
  inquiryId: string,
  offerId: string,
  expectedVersion: number,
): Promise<ServerActionResult<{ awaitingOthers: boolean }>> {
  const scope = await getTenantPortalScopeBySlug(tenantSlug);
  if (!scope) return { ok: false, error: "Workspace not found." };

  const supabase = await createSupabaseServerClient();
  if (!supabase) return { ok: false, error: "Database unavailable." };

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not authenticated." };

  // Ownership gate — client can only approve offers on inquiries they
  // submitted. RLS would block anyway, but the friendly error is better.
  const { data: inquiry } = await supabase
    .from("inquiries")
    .select("id")
    .eq("id", inquiryId)
    .eq("tenant_id", scope.tenantId)
    .eq("client_user_id", user.id)
    .maybeSingle();
  if (!inquiry) return { ok: false, error: "Inquiry not found." };

  const result = await clientAcceptOffer(supabase, {
    inquiryId,
    tenantId: scope.tenantId,
    offerId,
    actorUserId: user.id,
    expectedVersion,
  });
  if (!result.success) {
    const reason = (result as { reason?: string }).reason;
    const friendly =
      reason === "version_conflict" ? "Something changed since you opened this. Refresh and try again."
      : reason === "forbidden" ? "You don't have permission to approve this offer."
      : reason === "offer_not_active" ? "This offer is no longer awaiting your response."
      : (reason ?? "Could not approve the offer.");
    return { ok: false, error: friendly, reason };
  }

  // Honest feedback: the approval is RECORDED, but the offer only converts to a
  // booking once ALL parties (the client AND every assigned talent) have
  // approved — submitApproval returns success either way. Re-read the offer so
  // the caller can distinguish "approved" from "recorded, waiting on the talent
  // to confirm" instead of silently implying it booked.
  const { data: offerAfter } = await supabase
    .from("inquiry_offers")
    .select("status")
    .eq("id", offerId)
    .maybeSingle();
  const awaitingOthers = (offerAfter?.status as string | undefined) === "sent";

  revalidatePath(`/${tenantSlug}/client/inquiries/${inquiryId}`);
  revalidatePath(`/${tenantSlug}/client/inquiries`);
  return { ok: true, data: { awaitingOthers } };
}

/**
 * Client declines an active offer. Mirrors approve. Optional reason text
 * is captured and shown to the agency in the activity log.
 */
export async function clientDeclineOfferAction(
  tenantSlug: string,
  inquiryId: string,
  offerId: string,
  expectedVersion: number,
  rejectionReasonText?: string | null,
): Promise<ServerActionResult> {
  const scope = await getTenantPortalScopeBySlug(tenantSlug);
  if (!scope) return { ok: false, error: "Workspace not found." };

  const supabase = await createSupabaseServerClient();
  if (!supabase) return { ok: false, error: "Database unavailable." };

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not authenticated." };

  const { data: inquiry } = await supabase
    .from("inquiries")
    .select("id")
    .eq("id", inquiryId)
    .eq("tenant_id", scope.tenantId)
    .eq("client_user_id", user.id)
    .maybeSingle();
  if (!inquiry) return { ok: false, error: "Inquiry not found." };

  const result = await clientRejectOffer(supabase, {
    inquiryId,
    tenantId: scope.tenantId,
    offerId,
    actorUserId: user.id,
    expectedVersion,
    rejectionReasonText: rejectionReasonText ?? null,
  });
  if (!result.success) {
    const reason = (result as { reason?: string }).reason;
    const friendly =
      reason === "version_conflict" ? "Something changed since you opened this. Refresh and try again."
      : reason === "forbidden" ? "You don't have permission to decline this offer."
      : reason === "offer_not_active" ? "This offer is no longer awaiting your response."
      : (reason ?? "Could not decline the offer.");
    return { ok: false, error: friendly, reason };
  }

  revalidatePath(`/${tenantSlug}/client/inquiries/${inquiryId}`);
  revalidatePath(`/${tenantSlug}/client/inquiries`);
  return { ok: true, data: undefined };
}

/**
 * "Counter" from the client side — Phase A PR 4 ships this as a
 * messaging action: the client opens a counter sheet, types what
 * they'd want differently, and we just send that as a client→agency
 * message tagged `kind=counter_request`. A future PR wires the
 * structured-counter engine path (`counterOffer`) once the client gets
 * the full line-item editor.
 *
 * Returning a message-send result keeps the surface consistent and
 * unblocks the conversation immediately.
 */
export async function clientCounterOfferAction(
  tenantSlug: string,
  inquiryId: string,
  body: string,
): Promise<ServerActionResult> {
  const prefixed = `[Counter request] ${body.trim()}`;
  const result = await sendClientInquiryMessage(tenantSlug, inquiryId, prefixed);
  if (!result.ok) return { ok: false, error: result.error };
  return { ok: true, data: undefined };
}

export async function sendClientInquiryMessageAction(formData: FormData): Promise<never> {
  const tenantSlug = String(formData.get("tenantSlug") ?? "");
  const inquiryId = String(formData.get("inquiryId") ?? "");
  const body = String(formData.get("body") ?? "").trim();

  if (!tenantSlug || !inquiryId) {
    redirect("/login");
  }

  const result = await sendClientInquiryMessage(tenantSlug, inquiryId, body);
  if (!result.ok) {
    returnToThread(
      tenantSlug,
      inquiryId,
      new URLSearchParams({ err: result.error }),
    );
  }

  returnToThread(
    tenantSlug,
    inquiryId,
    new URLSearchParams({ ok: "Message sent." }),
  );
}
