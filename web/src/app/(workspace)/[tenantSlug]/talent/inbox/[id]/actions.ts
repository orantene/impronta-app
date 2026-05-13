"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { getTenantPortalScopeBySlug } from "@/lib/saas/scope";
import { logServerError } from "@/lib/server/safe-error";
import type { ServerActionResult } from "@/lib/server-actions/result";
import { loadTalentSelfProfile } from "../../../_data-bridge";

export type SendTalentInquiryMessageResult = ServerActionResult<{
  id: string;
  created_at: string;
}>;

function returnToThread(
  tenantSlug: string,
  inquiryId: string,
  params: URLSearchParams,
): never {
  redirect(`/${tenantSlug}/talent/inbox/${inquiryId}?${params.toString()}`);
}

export async function sendTalentInquiryMessage(
  tenantSlug: string,
  inquiryId: string,
  body: string,
): Promise<SendTalentInquiryMessageResult> {
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

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: "Not authenticated." };
  }

  const talent = await loadTalentSelfProfile(user.id, scope.tenantId);
  if (!talent) {
    return { ok: false, error: "Talent profile not found in this workspace." };
  }

  const { data: inquiry } = await supabase
    .from("inquiries")
    .select("id")
    .eq("id", inquiryId)
    .eq("tenant_id", scope.tenantId)
    .maybeSingle();
  if (!inquiry) {
    return { ok: false, error: "Inquiry not found in this workspace." };
  }

  const { data: participant } = await supabase
    .from("inquiry_participants")
    .select("inquiry_id")
    .eq("inquiry_id", inquiryId)
    .eq("talent_profile_id", talent.id)
    .in("status", ["invited", "active"])
    .maybeSingle();
  if (!participant) {
    return { ok: false, error: "You cannot message on this inquiry." };
  }

  const { data, error: insertError } = await supabase
    .from("inquiry_messages")
    .insert({
      inquiry_id: inquiryId,
      thread_type: "group",
      sender_user_id: user.id,
      body: trimmed,
      tenant_id: scope.tenantId,
    })
    .select("id, created_at")
    .single();

  if (insertError) {
    logServerError("talent.thread.send", insertError);
    return { ok: false, error: "Could not send message." };
  }

  const { error: readErr } = await supabase.rpc("inquiry_mark_thread_read", {
    p_inquiry_id: inquiryId,
    p_thread_type: "group",
  });
  if (readErr) {
    logServerError("talent.thread.markRead", readErr);
  }

  revalidatePath(`/${tenantSlug}/talent/inbox/${inquiryId}`);
  revalidatePath(`/${tenantSlug}/talent/inbox`);
  return { ok: true, data: { id: data.id, created_at: data.created_at } };
}

export async function markTalentInquiryThreadRead(
  tenantSlug: string,
  inquiryId: string,
): Promise<void> {
  const scope = await getTenantPortalScopeBySlug(tenantSlug);
  if (!scope) return;

  const supabase = await createSupabaseServerClient();
  if (!supabase) return;

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  const talent = await loadTalentSelfProfile(user.id, scope.tenantId);
  if (!talent) return;

  const { data: inquiry } = await supabase
    .from("inquiries")
    .select("id")
    .eq("id", inquiryId)
    .eq("tenant_id", scope.tenantId)
    .maybeSingle();
  if (!inquiry) return;

  const { data: participant } = await supabase
    .from("inquiry_participants")
    .select("inquiry_id")
    .eq("inquiry_id", inquiryId)
    .eq("talent_profile_id", talent.id)
    .in("status", ["invited", "active"])
    .maybeSingle();
  if (!participant) return;

  const { error } = await supabase.rpc("inquiry_mark_thread_read", {
    p_inquiry_id: inquiryId,
    p_thread_type: "group",
  });
  if (error) {
    logServerError("talent.thread.markRead", error);
  }
}

// ─── Accept / decline invitation ────────────────────────────────────────────

export type InvitationActionResult = ServerActionResult;

async function resolveParticipant(tenantSlug: string, inquiryId: string) {
  const scope = await getTenantPortalScopeBySlug(tenantSlug);
  if (!scope) return { ok: false as const, error: "Workspace not found." };

  const supabase = await createSupabaseServerClient();
  if (!supabase) return { ok: false as const, error: "Database unavailable." };

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Not authenticated." };

  const talent = await loadTalentSelfProfile(user.id, scope.tenantId);
  if (!talent) return { ok: false as const, error: "Talent profile not found." };

  const { data: participant } = await supabase
    .from("inquiry_participants")
    .select("id")
    .eq("inquiry_id", inquiryId)
    .eq("talent_profile_id", talent.id)
    .eq("status", "invited")
    .maybeSingle();

  if (!participant) return { ok: false as const, error: "Invitation not found or already actioned." };

  return { ok: true as const, supabase, participantId: (participant as { id: string }).id, tenantSlug, inquiryId };
}

export async function acceptTalentInvitation(
  tenantSlug: string,
  inquiryId: string,
): Promise<InvitationActionResult> {
  const ctx = await resolveParticipant(tenantSlug, inquiryId);
  if (!ctx.ok) return { ok: false, error: ctx.error };

  const { error } = await ctx.supabase
    .from("inquiry_participants")
    .update({ status: "active", updated_at: new Date().toISOString() })
    .eq("id", ctx.participantId);

  if (error) {
    logServerError("talent.acceptInvitation", error);
    return { ok: false, error: "Could not accept invitation. Try again." };
  }

  revalidatePath(`/${tenantSlug}/talent/inbox/${inquiryId}`);
  revalidatePath(`/${tenantSlug}/talent/inbox`);
  return { ok: true, data: undefined };
}

export async function declineTalentInvitation(
  tenantSlug: string,
  inquiryId: string,
): Promise<InvitationActionResult> {
  const ctx = await resolveParticipant(tenantSlug, inquiryId);
  if (!ctx.ok) return { ok: false, error: ctx.error };

  const { error } = await ctx.supabase
    .from("inquiry_participants")
    .update({ status: "declined", updated_at: new Date().toISOString() })
    .eq("id", ctx.participantId);

  if (error) {
    logServerError("talent.declineInvitation", error);
    return { ok: false, error: "Could not decline invitation. Try again." };
  }

  revalidatePath(`/${tenantSlug}/talent/inbox/${inquiryId}`);
  revalidatePath(`/${tenantSlug}/talent/inbox`);
  return { ok: true, data: undefined };
}

// Form-action wrappers for invitation (redirect-based, usable as <form action>)
export async function acceptInvitationFormAction(
  tenantSlug: string,
  inquiryId: string,
  _formData: FormData,
): Promise<void> {
  const res = await acceptTalentInvitation(tenantSlug, inquiryId);
  if (!res.ok) {
    redirect(`/${tenantSlug}/talent/inbox/${inquiryId}?err=${encodeURIComponent(res.error)}`);
  }
  redirect(`/${tenantSlug}/talent/inbox/${inquiryId}?ok=${encodeURIComponent("You've accepted this booking — welcome to the team!")}`);
}

export async function declineInvitationFormAction(
  tenantSlug: string,
  inquiryId: string,
  _formData: FormData,
): Promise<void> {
  const res = await declineTalentInvitation(tenantSlug, inquiryId);
  if (!res.ok) {
    redirect(`/${tenantSlug}/talent/inbox/${inquiryId}?err=${encodeURIComponent(res.error)}`);
  }
  redirect(`/${tenantSlug}/talent/inbox?declined=1`);
}

export async function sendTalentInquiryMessageAction(formData: FormData): Promise<never> {
  const tenantSlug = String(formData.get("tenantSlug") ?? "");
  const inquiryId = String(formData.get("inquiryId") ?? "");
  const body = String(formData.get("body") ?? "").trim();

  if (!tenantSlug || !inquiryId) {
    redirect("/login");
  }

  const result = await sendTalentInquiryMessage(tenantSlug, inquiryId, body);
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
