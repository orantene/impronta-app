"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { getTenantPortalScopeBySlug } from "@/lib/saas/scope";
import { logServerError } from "@/lib/server/safe-error";
import type { ServerActionResult } from "@/lib/server-actions/result";
import { loadTalentSelfProfile } from "../../../_data-bridge";
import { loadClientTrustState } from "@/lib/client-trust/evaluator";
import { mapToGuestTrustChipProps } from "@/lib/inquiry/guest-trust-chip-mapper";
import type { GuestTrustChipProps, InquiryReportReason, TrustSignalState } from "@/lib/inquiry/guest-chat-contract";
import { blockSubject, reportInquiry } from "@/lib/inquiry/recipient-safety";
import {
  listClientIntegrations,
  isClientIntegrationVerifiedTrustSignal,
} from "@/lib/client-integrations/repository";
import { getClientIntegrationDef } from "@/lib/client-integrations/catalog";

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

  // Authorize against the INQUIRY's own tenant, never the talent's active
  // workspace. A talent on several agencies — or replying via the Tulala hub —
  // holds a thread whose tenant_id is the agency that OWNS the inquiry, which
  // routinely differs from the URL / effective-workspace slug. The old code
  // scoped BOTH the talent profile (roster-scoped loadTalentSelfProfile) and the
  // inquiry lookup to `scope.tenantId`, so a cross-tenant reply failed with
  // "Inquiry not found in this workspace." even though the talent legitimately
  // participates. Mirror the already-correct read path (loadTalentInquiryThread):
  // resolve the inquiry's own tenant + authorize on participant membership via
  // the service-role client (a platform talent whose agency-roster row is
  // inactive still participates and must be able to reply). The INSERT stays on
  // the user client so the participant-scoped RLS — which has NO tenant check —
  // remains the security backstop.
  const admin = createServiceRoleClient();
  const authzClient = admin ?? supabase;

  const { data: inquiry } = await authzClient
    .from("inquiries")
    .select("id, tenant_id")
    .eq("id", inquiryId)
    .maybeSingle();
  if (!inquiry?.tenant_id) {
    return { ok: false, error: "Inquiry not found." };
  }
  const inquiryTenantId = inquiry.tenant_id as string;

  // Resolve the talent profile by user_id (NOT the roster/tenant-scoped
  // loadTalentSelfProfile) so cross-agency participation is honored.
  const { data: tp } = await authzClient
    .from("talent_profiles")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();
  const talentProfileId = (tp as { id: string } | null)?.id ?? null;

  // Pull the role on EVERY participant row this user holds on the inquiry.
  // A self-coordinating talent has TWO rows: their lineup row (keyed on
  // talent_profile_id) AND a coordinator row (keyed on user_id, no
  // talent_profile_id — same shape as the agency multi-coordinator fan-out).
  // Match on either key so the coordinator role is visible here. (RLS now
  // exposes a user's own coordinator row via
  // inquiry_participants_own_coordinator_select.)
  const orMatch = talentProfileId
    ? `user_id.eq.${user.id},talent_profile_id.eq.${talentProfileId}`
    : `user_id.eq.${user.id}`;
  const { data: participantRows } = await authzClient
    .from("inquiry_participants")
    .select("role")
    .eq("inquiry_id", inquiryId)
    .or(orMatch)
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
      tenant_id: inquiryTenantId,
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
  _tenantSlug: string,
  inquiryId: string,
): Promise<void> {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return;

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  // Tenant-agnostic, like loadTalentInquiryThread / sendTalentInquiryMessage:
  // authorize on the inquiry's own tenant + participant membership (resolved by
  // user_id, not the roster-scoped self profile) so a cross-agency / hub thread
  // still marks read. Authz reads run via service-role; the RPC runs as the user.
  const admin = createServiceRoleClient();
  const authzClient = admin ?? supabase;

  const { data: inquiry } = await authzClient
    .from("inquiries")
    .select("id")
    .eq("id", inquiryId)
    .maybeSingle();
  if (!inquiry) return;

  const { data: tp } = await authzClient
    .from("talent_profiles")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();
  const talentProfileId = (tp as { id: string } | null)?.id ?? null;
  if (!talentProfileId) return;

  const { data: participant } = await authzClient
    .from("inquiry_participants")
    .select("inquiry_id")
    .eq("inquiry_id", inquiryId)
    .eq("talent_profile_id", talentProfileId)
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
  senderRole: "you" | "coordinator" | "client" | "system";
  body: string;
  ts: string;
  messageKind: string;
  cardPayload: Record<string, unknown> | null;
  /**
   * For `messageKind === 'order'`: the order the card describes.
   *
   * Null on this surface today — the talent thread does not load orders, and a
   * null renders the card's neutral state rather than a wrong figure. Declared
   * so the renderer's contract is the same on every surface: a card that hangs
   * off a type which cannot carry an order is a card that silently shows
   * nothing, which is the failure the whole four-layer guard exists for.
   */
  order?: {
    id: string;
    status: string;
    currency: string;
    totalCents: number;
    outstandingCents?: number | null;
    lineCount: number;
  } | null;
  /** Raw message metadata jsonb — carries the voice-note descriptor for
   *  message_kind='voice' (parsed bubble-side via readVoiceMetaFromMessageMetadata). */
  metadata: Record<string, unknown> | null;
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
      .select("id, tenant_id, contact_name, client_user_id")
      .eq("id", inquiryId)
      .maybeSingle();
    if (!inquiry?.tenant_id) return [];
    const tenantId = inquiry.tenant_id as string;
    // The guest IS the client: a private-thread row with sender_user_id NULL +
    // a guest_session_id is the guest/client's own message. Label it with the
    // inquiry contact name (no PII leak — it's the client they're brokering),
    // never the "system" fallback. Registered clients post with their user id.
    const contactName = ((inquiry as { contact_name?: string | null }).contact_name ?? "")?.trim();
    const clientUserId = (inquiry as { client_user_id?: string | null }).client_user_id ?? null;

    // History window for a coordinator added with "start fresh" — only client
    // (private) messages created at/after visible_from are shown to them.
    let privateVisibleFrom: string | null = null;
    if (threadType === "private") {
      // Private/client thread is coordinator-only. Authorize on a COORDINATOR
      // participant row keyed on the user (the self-coordinator's role row
      // carries user_id, no talent_profile_id) — mirrors the private-thread
      // RLS + the sendTalentInquiryMessage guard. A plain lineup talent has no
      // coordinator row, so they get [] here and never see the client chat.
      const { data: coordPart } = await readClient
        .from("inquiry_participants")
        .select("inquiry_id, visible_from")
        .eq("inquiry_id", inquiryId)
        .eq("user_id", user.id)
        .eq("role", "coordinator")
        .in("status", ["invited", "active"])
        .maybeSingle();
      if (!coordPart) return [];
      privateVisibleFrom = (coordPart as { visible_from?: string | null }).visible_from ?? null;
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

    let messagesQuery = readClient
      .from("inquiry_messages")
      .select("id, sender_user_id, guest_session_id, body, created_at, message_kind, card_payload, metadata, profiles:sender_user_id(display_name)")
      .eq("inquiry_id", inquiryId)
      .eq("thread_type", threadType)
      .eq("tenant_id", tenantId)
      .is("deleted_at", null);
    // "Start fresh" coordinator: hide client-thread messages that predate the
    // assignment (visible_from). Full-history coordinators have null → no filter.
    if (threadType === "private" && privateVisibleFrom) {
      messagesQuery = messagesQuery.gte("created_at", privateVisibleFrom);
    }
    const { data, error } = await messagesQuery
      .order("created_at", { ascending: true })
      .limit(200);
    if (error) {
      logServerError("talent.thread.load", error);
      return [];
    }

    type Row = {
      id: string;
      sender_user_id: string | null;
      guest_session_id: string | null;
      body: string;
      created_at: string;
      message_kind: string | null;
      card_payload: Record<string, unknown> | null;
      metadata: Record<string, unknown> | null;
      profiles: { display_name: string | null } | { display_name: string | null }[] | null;
    };
    const clientLabel = contactName || "Client";
    return ((data ?? []) as unknown as Row[]).map((row) => {
      const profile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
      const isMine = !!row.sender_user_id && row.sender_user_id === user.id;
      // The guest IS the client: a row with no sender but a guest_session_id is
      // the client's own message — show it as the CLIENT (contact name), not a
      // "system" bubble. A registered client posts with client_user_id.
      const isGuestClient = !row.sender_user_id && !!row.guest_session_id;
      const isRegisteredClient = !!row.sender_user_id && !!clientUserId && row.sender_user_id === clientUserId;
      let senderRole: TalentThreadMessage["senderRole"];
      let senderName: string;
      if (isMine) {
        senderRole = "you";
        senderName = "You";
      } else if (isGuestClient || isRegisteredClient) {
        senderRole = "client";
        senderName = clientLabel;
      } else if (!row.sender_user_id) {
        // True system/platform row (no sender, no guest) — preserves the prior
        // label so existing group-thread system rows render unchanged.
        senderRole = "system";
        senderName = "Coordinator";
      } else {
        senderRole = "coordinator";
        senderName = profile?.display_name?.trim() || "Coordinator";
      }
      return {
        id: row.id,
        isMine,
        senderName,
        senderRole,
        body: row.body,
        ts: row.created_at,
        messageKind: row.message_kind ?? "text",
        cardPayload: row.card_payload ?? null,
        metadata: row.metadata ?? null,
      };
    });
  } catch (err) {
    logServerError("talent.thread.load", err);
    return [];
  }
}

/**
 * Talent-readable lineup headcount for the Group-tab visibility gate (F2).
 *
 * The admin `loadInquiryLineup` is staff-scoped (`requireStaffTenantAction`), so
 * a SELF-COORDINATING hub talent — who is NOT staff of the hub tenant — gets a
 * failed read, leaving the count undefined and the Group tab defaulting to
 * shown (even on a sole-talent inquiry). This action authorizes on the caller's
 * OWN participant row (the engine keys both the talent lineup row AND the
 * self-coordinator row on `user_id`), then service-role counts the
 * `role='talent'` participants on the inquiry. Returns `null` when the caller
 * doesn't participate or on any error — the caller treats `null` as "unknown"
 * and keeps the Group tab shown (the safe, non-disruptive default).
 */
export async function loadTalentInquiryLineupCount(
  inquiryId: string,
): Promise<number | null> {
  try {
    const supabase = await createSupabaseServerClient();
    if (!supabase) return null;
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return null;

    const admin = createServiceRoleClient();
    const readClient = admin ?? supabase;

    // Authorize: the caller must hold a non-removed participant row keyed on
    // their user_id (talent lineup row OR self/agency coordinator row). Mirrors
    // the thread authz — no roster/staff scope required. The count itself is
    // non-sensitive (an integer), so any participation suffices.
    const { data: ownRow } = await readClient
      .from("inquiry_participants")
      .select("inquiry_id")
      .eq("inquiry_id", inquiryId)
      .eq("user_id", user.id)
      .neq("status", "removed")
      .limit(1)
      .maybeSingle();
    if (!ownRow) return null;

    // Count the role='talent' lineup participants (exclude removed).
    const { count, error } = await readClient
      .from("inquiry_participants")
      .select("id", { count: "exact", head: true })
      .eq("inquiry_id", inquiryId)
      .eq("role", "talent")
      .neq("status", "removed");
    if (error) return null;
    return count ?? 0;
  } catch (err) {
    logServerError("talent.lineup.count", err);
    return null;
  }
}

// ─── Guest / client trust chip (talent thread header) ────────────────────────

/** Serialisable trust-chip data for the talent thread header (no callbacks). */
export type TalentGuestTrustChipData = Omit<GuestTrustChipProps, "onBlock" | "onReport"> & {
  /**
   * Subject identity for the recipient-safety actions, resolved server-side
   * from the inquiry sender. `null` when neither a client user nor a guest
   * session is on the inquiry (block/report unavailable — older inquiry rows).
   */
  blockTarget:
    | { inquiryId: string; subjectType: "client_user" | "guest_session"; subjectId: string }
    | null;
};

/**
 * Load the talent-facing trust chip for an inquiry the signed-in talent
 * participates in. Mirrors loadTalentInquiryThread's authorization (the talent
 * must be an active/invited participant on the inquiry) and runs the reads via
 * the service-role client AFTER that gate, since client-trust + auth-email
 * signals aren't RLS-readable by a lineup talent.
 *
 * Returns null when the caller isn't a participant or on any error — the chip
 * simply doesn't render. Data is built with sensible defaults: when there is no
 * registered client (pure guest inquiry) the tier is null + identity collapses
 * to "guest"/"identified" off the captured contact fields.
 */
export async function loadTalentInquiryGuestTrust(
  inquiryId: string,
): Promise<TalentGuestTrustChipData | null> {
  try {
    const supabase = await createSupabaseServerClient();
    if (!supabase) return null;

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;

    const admin = createServiceRoleClient();
    const readClient = admin ?? supabase;

    const { data: inquiry } = await readClient
      .from("inquiries")
      .select("id, tenant_id, contact_name, contact_email, contact_phone, client_user_id, guest_session_id")
      .eq("id", inquiryId)
      .maybeSingle();
    if (!inquiry?.tenant_id) return null;
    const inq = inquiry as {
      tenant_id: string;
      contact_name: string | null;
      contact_email: string | null;
      contact_phone: string | null;
      client_user_id: string | null;
      guest_session_id: string | null;
    };
    const tenantId = inq.tenant_id;

    // Authorize: the signed-in user's talent profile must be a participant on
    // this inquiry. Resolve by user_id (not the roster-scoped self profile) so a
    // platform talent with an inactive agency-roster row still passes.
    const { data: tp } = await readClient
      .from("talent_profiles")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle();
    const talentProfileId = (tp as { id: string } | null)?.id;
    if (!talentProfileId) return null;
    const { data: participant } = await readClient
      .from("inquiry_participants")
      .select("inquiry_id")
      .eq("inquiry_id", inquiryId)
      .eq("talent_profile_id", talentProfileId)
      .in("status", ["invited", "active"])
      .maybeSingle();
    if (!participant) return null;

    // ── Trust tier + payment verification — from client_trust_state.
    // verified_at being non-null means the client completed the $5 Stripe
    // payment verification (or an OAuth-sync wrote it). That is the payment
    // signal source — there is no separate "payment badge" table.
    let clientTrustLevel: GuestTrustChipProps["tier"] = null;
    let paymentSignalOverride: TrustSignalState = "absent";
    if (inq.client_user_id) {
      const state = await loadClientTrustState(inq.client_user_id, tenantId, readClient);
      clientTrustLevel = state?.trustLevel ?? null;
      paymentSignalOverride = state?.verifiedAt ? "verified" : "absent";
    }

    // ── Email verification — the client user's auth email_confirmed_at.
    let isEmailVerified = false;
    if (inq.client_user_id && admin) {
      try {
        const { data: authUser } = await admin.auth.admin.getUserById(inq.client_user_id);
        isEmailVerified = Boolean(authUser?.user?.email_confirmed_at);
      } catch (err) {
        logServerError("talent.trustChip.emailVerify", err);
      }
    }

    // ── Phone signal — client_profiles.phone.
    // There is no dedicated verified-phone flag in the schema; a stored phone
    // number means it was captured but we cannot assert it was verified via SMS.
    // We report present_unverified when a phone exists, absent otherwise.
    let phoneSignalOverride: TrustSignalState = "absent";
    if (inq.client_user_id) {
      try {
        const { data: clientProfile } = await readClient
          .from("client_profiles")
          .select("phone")
          .eq("user_id", inq.client_user_id)
          .maybeSingle();
        const phone = (clientProfile as { phone?: string | null } | null)?.phone;
        phoneSignalOverride = phone ? "present_unverified" : "absent";
      } catch (err) {
        logServerError("talent.trustChip.phone", err);
      }
    }
    // If no registered client but the inquiry captured a phone at submission
    // time, surface that as present_unverified too.
    if (inq.client_user_id === null && inq.contact_phone?.trim()) {
      phoneSignalOverride = "present_unverified";
    }

    // ── Social signal — client_integrations (OAuth-verified social accounts).
    // "verified"          = at least one social integration is OAuth-verified,
    //                       trust_signal_enabled, and talent_visible.
    // "present_unverified"= at least one social integration row exists in the
    //                       social category but none are fully verified.
    // "absent"            = no social integrations at all.
    let socialSignalOverride: TrustSignalState = "absent";
    if (inq.client_user_id) {
      try {
        const integrations = await listClientIntegrations(inq.client_user_id);
        let hasSocialRow = false;
        let hasVerifiedSocial = false;
        for (const row of integrations) {
          const def = getClientIntegrationDef(row.provider_key);
          if (def?.category !== "social") continue;
          hasSocialRow = true;
          if (isClientIntegrationVerifiedTrustSignal(row) && row.talent_visible) {
            hasVerifiedSocial = true;
            break;
          }
        }
        if (hasVerifiedSocial) {
          socialSignalOverride = "verified";
        } else if (hasSocialRow) {
          socialSignalOverride = "present_unverified";
        }
      } catch (err) {
        logServerError("talent.trustChip.social", err);
      }
    }

    // ── Completed bookings — confirmed/completed agency_bookings for the client.
    let completedBookings = 0;
    if (inq.client_user_id) {
      const { count } = await readClient
        .from("agency_bookings")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tenantId)
        .eq("client_user_id", inq.client_user_id)
        .in("status", ["confirmed", "completed"]);
      completedBookings = count ?? 0;
    }

    // ── Block state — has THIS talent (recipient) already blocked the sender?
    let isBlocked = false;
    {
      const orParts: string[] = [];
      if (inq.guest_session_id) orParts.push(`blocked_guest_session_id.eq.${inq.guest_session_id}`);
      if (inq.client_user_id) orParts.push(`blocked_client_user_id.eq.${inq.client_user_id}`);
      if (orParts.length > 0) {
        const { data: blockRow } = await readClient
          .from("user_blocks")
          .select("id")
          .eq("tenant_id", tenantId)
          .eq("blocker_user_id", user.id)
          .or(orParts.join(","))
          .limit(1)
          .maybeSingle();
        isBlocked = !!blockRow;
      }
    }

    const props = mapToGuestTrustChipProps({
      trustSummary: null,
      contactName: inq.contact_name?.trim() || "Guest",
      contactEmail: inq.contact_email?.trim() || null,
      contactPhone: inq.contact_phone?.trim() || null,
      clientTrustLevel,
      completedBookings,
      isEmailVerified,
      isBlocked,
      phoneSignalOverride,
      socialSignalOverride,
      paymentSignalOverride,
    });

    // Resolve the subject for block/report. Prefer the registered client user;
    // fall back to the guest session. Null when neither is present.
    const blockTarget = inq.client_user_id
      ? { inquiryId, subjectType: "client_user" as const, subjectId: inq.client_user_id }
      : inq.guest_session_id
        ? { inquiryId, subjectType: "guest_session" as const, subjectId: inq.guest_session_id }
        : null;

    const { onBlock: _onBlock, onReport: _onReport, ...serialisable } = props;
    void _onBlock;
    void _onReport;
    return { ...serialisable, blockTarget };
  } catch (err) {
    logServerError("talent.trustChip.load", err);
    return null;
  }
}

/**
 * Block the sender on an inquiry (talent thread Block affordance). Thin
 * "use server" wrapper around recipient-safety.blockSubject — the staff/tenant
 * authorization + idempotency live there. Subject resolved server-side in
 * loadTalentInquiryGuestTrust and round-tripped via the chip; never user-typed.
 */
export async function blockInquirySenderAsTalent(
  inquiryId: string,
  subjectType: "client_user" | "guest_session",
  subjectId: string,
): Promise<{ ok: boolean }> {
  return blockSubject({ inquiryId, subjectType, subjectId });
}

/**
 * Report the sender on an inquiry (talent thread Report affordance). Thin
 * "use server" wrapper around recipient-safety.reportInquiry. The reported
 * subject is denormalised from the inquiry server-side.
 */
export async function reportInquirySenderAsTalent(
  inquiryId: string,
  reason: InquiryReportReason,
): Promise<{ ok: boolean }> {
  return reportInquiry({ inquiryId, reason });
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
