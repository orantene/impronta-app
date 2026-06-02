"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/admin";
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
  // Hub hybrid: a talent who is ALSO the inquiry's coordinator (auto-assigned
  // for a Tulala-hub booking, or added by an agency) can post to the CLIENT
  // (private) thread — the same client chat any coordinator gets. Plain talents
  // stay on the group thread. Defaults to group for the normal talent path.
  threadType: "group" | "private" = "group",
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

  // Pull the role on EVERY participant row this user holds on the inquiry.
  // A self-coordinating talent has TWO rows: their lineup row (keyed on
  // talent_profile_id) AND a coordinator row (keyed on user_id, no
  // talent_profile_id — same shape as the agency multi-coordinator fan-out).
  // Match on either key so the coordinator role is visible here. (RLS now
  // exposes a user's own coordinator row via
  // inquiry_participants_own_coordinator_select.)
  const { data: participantRows } = await supabase
    .from("inquiry_participants")
    .select("role")
    .eq("inquiry_id", inquiryId)
    .or(`user_id.eq.${user.id},talent_profile_id.eq.${talent.id}`)
    .in("status", ["invited", "active"]);
  const roles = new Set((participantRows ?? []).map((p) => (p as { role: string }).role));
  if (roles.size === 0) {
    return { ok: false, error: "You cannot message on this inquiry." };
  }
  // Only a coordinator may post to the client (private) thread. (The DB RLS
  // enforces this too; this is the friendly app-layer guard.)
  if (threadType === "private" && !roles.has("coordinator")) {
    return { ok: false, error: "Only the job coordinator can message the client directly." };
  }

  const { data, error: insertError } = await supabase
    .from("inquiry_messages")
    .insert({
      inquiry_id: inquiryId,
      thread_type: threadType,
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
    p_thread_type: threadType,
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

// ─── Real thread load (talent group thread — text + money cards) ─────────────

export type TalentThreadMessage = {
  id: string;
  isMine: boolean;
  senderName: string;
  senderRole: "you" | "coordinator" | "system";
  body: string;
  ts: string;
  messageKind: string;
  cardPayload: Record<string, unknown> | null;
};

/**
 * Load the talent's real conversation for an inquiry (the GROUP thread the
 * talent participates in) WITH message_kind + card_payload, so the talent
 * Chat can render the money/booking story as structured cards instead of the
 * mock prototype thread. Tenant is derived from the inquiry (RLS scopes the
 * talent to inquiries they participate in). Returns [] when the caller isn't a
 * participant or on any error — the SPA falls back to its empty state.
 *
 * Role-safe by construction: card_payload for talent-thread cards carries only
 * labels (talent rate, booking-confirmed), never margin/commission — the
 * client-facing offer/payment amounts live on the PRIVATE thread, not here.
 */
export async function loadTalentInquiryThread(
  inquiryId: string,
  // Hub hybrid: a talent who is ALSO the inquiry's coordinator can load the
  // CLIENT (private) thread — the client chat they broker. Defaults to the
  // talent's own GROUP thread (the normal lineup-talent view). The private
  // branch is authorized on a coordinator participant row, never on the
  // lineup-talent row, so a plain talent can't read the client thread.
  threadType: "group" | "private" = "group",
): Promise<TalentThreadMessage[]> {
  try {
    const supabase = await createSupabaseServerClient();
    if (!supabase) return [];

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return [];

    // Reads use the service-role client AFTER the participant authorization
    // below — mirrors loadInquiryMessages. Talent RLS doesn't grant SELECT on
    // system (sender_user_id null) group-thread rows, so a user-scoped read
    // silently returns [] even for a valid participant.
    const admin = createServiceRoleClient();
    const readClient = admin ?? supabase;

    const { data: inquiry } = await readClient
      .from("inquiries")
      .select("id, tenant_id")
      .eq("id", inquiryId)
      .maybeSingle();
    if (!inquiry?.tenant_id) return [];
    const tenantId = inquiry.tenant_id as string;

    if (threadType === "private") {
      // Private/client thread is coordinator-only. Authorize on a COORDINATOR
      // participant row keyed on the user (the self-coordinator's role row
      // carries user_id, no talent_profile_id) — mirrors the private-thread
      // RLS + the sendTalentInquiryMessage guard. A plain lineup talent has no
      // coordinator row, so they get [] here and never see the client chat.
      const { data: coordPart } = await readClient
        .from("inquiry_participants")
        .select("inquiry_id")
        .eq("inquiry_id", inquiryId)
        .eq("user_id", user.id)
        .eq("role", "coordinator")
        .in("status", ["invited", "active"])
        .maybeSingle();
      if (!coordPart) return [];
    } else {
      // Group thread — authorize on the signed-in user's talent profile being
      // a participant. Resolve by user_id (NOT the tenant/roster-scoped
      // loadTalentSelfProfile — a platform talent whose agency roster row is
      // inactive still legitimately participates and must see their thread).
      const { data: tp } = await readClient
        .from("talent_profiles")
        .select("id")
        .eq("user_id", user.id)
        .maybeSingle();
      const talentProfileId = (tp as { id: string } | null)?.id;
      if (!talentProfileId) return [];
      const { data: participant } = await readClient
        .from("inquiry_participants")
        .select("inquiry_id")
        .eq("inquiry_id", inquiryId)
        .eq("talent_profile_id", talentProfileId)
        .in("status", ["invited", "active"])
        .maybeSingle();
      if (!participant) return [];
    }

    const { data, error } = await readClient
      .from("inquiry_messages")
      .select("id, sender_user_id, body, created_at, message_kind, card_payload, profiles:sender_user_id(display_name)")
      .eq("inquiry_id", inquiryId)
      .eq("thread_type", threadType)
      .eq("tenant_id", tenantId)
      .is("deleted_at", null)
      .order("created_at", { ascending: true })
      .limit(200);
    if (error) {
      logServerError("talent.thread.load", error);
      return [];
    }

    type Row = {
      id: string;
      sender_user_id: string | null;
      body: string;
      created_at: string;
      message_kind: string | null;
      card_payload: Record<string, unknown> | null;
      profiles: { display_name: string | null } | { display_name: string | null }[] | null;
    };
    return ((data ?? []) as unknown as Row[]).map((row) => {
      const profile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
      const isMine = !!row.sender_user_id && row.sender_user_id === user.id;
      const senderRole: TalentThreadMessage["senderRole"] = !row.sender_user_id
        ? "system"
        : isMine
          ? "you"
          : "coordinator";
      return {
        id: row.id,
        isMine,
        senderName: isMine ? "You" : profile?.display_name?.trim() || "Coordinator",
        senderRole,
        body: row.body,
        ts: row.created_at,
        messageKind: row.message_kind ?? "text",
        cardPayload: row.card_payload ?? null,
      };
    });
  } catch (err) {
    logServerError("talent.thread.load", err);
    return [];
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
