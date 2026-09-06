"use server";

/**
 * guest-chat-actions.ts — the three server actions for the talent-profile
 * conversational-inquiry MVP (Lane A / jobs B2 + B3).
 *
 * ┌─ THE SECURITY BOUNDARY ─────────────────────────────────────────────────┐
 * │ The guest's identity is the `x-impronta-guest` cookie, injected by       │
 * │ middleware as a request header and resolved to a guest_sessions.id        │
 * │ SERVER-SIDE here. It is NEVER a client-supplied argument. Ownership of an  │
 * │ inquiry is proven by `inquiries.guest_session_id === lookup(cookie)`.      │
 * │ Any code path that accepted a session id/key from the client would be a    │
 * │ guest-ownership bypass — do not add one.                                   │
 * └───────────────────────────────────────────────────────────────────────────┘
 *
 * Writes use the service-role client behind an app-layer ownership/permission
 * gate, exactly like the existing client-message path: RLS on inquiry_messages
 * is auth.uid()-based and rejects even legitimate clients, so a guest (anon, no
 * JWT) cannot write under RLS. The engine's guest-sender branch
 * (validateActorPermission with guestSessionId) is the gate.
 *
 * Reuses the proven submit path verbatim (mirrors submitInquiryNowAction's
 * guest branch): ensureGuestClientByEmail → createInquiryFromIntent with
 * actor_user_id:null + client_user_id + guest_session_id.
 *
 * Contract: web/src/lib/inquiry/guest-chat-contract.ts (pure types).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";
import { ensureGuestClientByEmail } from "@/lib/inquiry/guest-client";
import { evaluateGuestConversationGate } from "@/lib/inquiry/guest-trust-gate";
import { createInquiryFromIntent } from "@/lib/inquiry/inquiry-intent-engine";
import { assertAllTalentOnTenantRoster } from "@/lib/saas/talent-roster";
import { getPublicHostContext } from "@/lib/saas/scope";
import type { InquiryIntent } from "@/lib/inquiry/inquiry-intent";
import { captureGuestMessageDetails } from "@/lib/inquiry/guest-message-extract";
import { sendMessage } from "@/lib/inquiry/inquiry-engine-messages";
import { promoteEarlyInquiryToSubmitted } from "@/lib/inquiry/promote-early-inquiry";
import { isSeedContact, shouldRefuseGuestSend } from "@/lib/inquiry/guest-send-gate";
import {
  pickGuestEnsureTargetOrForceNew,
  pickGuestResumeTarget,
} from "@/lib/inquiry/guest-draft-resume";
import {
  checkGuestInquiryAbuse,
  checkGuestMessageAbuse,
} from "@/lib/inquiry/guest-abuse-guard";
import {
  checkGuestMessageSend,
  guestCreateEmailKey,
  normalizeEmailForKey,
} from "@/lib/rate-limit-kv";
import { isBlocked } from "@/lib/inquiry/recipient-safety";
import { resolveInquiryRecipients } from "@/lib/notifications/recipients";
import { emitGuestAutoAck } from "@/lib/inquiry/guest-auto-ack";
import { scanGuestConversationForDetails } from "@/app/t/[profileCode]/_actions/guest-conversation-scan-action";
import { sendGuestClaimEmail } from "@/lib/inquiry/guest-claim-link";
import { getTypicalReplyLabel } from "@/lib/inquiry/guest-reply-latency";
import {
  buildInquiryReceipt,
  isReceiptVisibleStatus,
} from "@/lib/inquiry/inquiry-receipt-data";
import { getAppUrl } from "@/lib/auth-flow";
import { resolveClientIp, resolveGuestSessionId } from "@/lib/guest/guest-session";
import type {
  AddGuestClaimEmailInput,
  AddGuestClaimEmailResult,
  CheckGuestClaimEmailInput,
  CheckGuestClaimEmailResult,
  EnsureGuestInquiryInput,
  EnsureGuestInquiryResult,
  GetActiveGuestInquiryResult,
  GetGuestThreadInput,
  GetGuestThreadResult,
  GuestChatErrorCode,
  GuestChatFailure,
  GuestClaimEmailStatus,
  GuestIdentityTier,
  GuestMessageAuthorRole,
  GuestMessageKind,
  GuestOfferCardLine,
  GuestThreadMessage,
  GuestThreadStatus,
  InquiryReceiptData,
  SendGuestMessageInput,
  SendGuestMessageResult,
  StartGuestChatInput,
  StartGuestChatResult,
} from "@/lib/inquiry/guest-chat-contract";

const MAX_BODY = 10_000;


// isSeedContact — the synthetic early-row contact seed detector (see
// ensureGuestChatInquiry below). A row is "contact promoted" once it no longer
// carries this placeholder, i.e. the guest has supplied real contact details
// via the ContactCard gate. Lives in guest-send-gate.ts (pure, DB-free) so the
// seed shape is asserted in exactly ONE place and is unit-testable alongside
// shouldRefuseGuestSend (P0-6 / W0-D); the client never string-matches the
// placeholder itself (it reads the contactPromoted flag instead).

// ─────────────────────────────────────────────────────────────────────────────
// Small failure helper.
// ─────────────────────────────────────────────────────────────────────────────

function fail(
  code: GuestChatErrorCode,
  message: string,
  extra?: { retryAfterMs?: number; missingFields?: string[] },
): GuestChatFailure {
  return { ok: false, code, message, ...extra };
}

type GuestContext = {
  admin: SupabaseClient;
  guestSessionId: string;
};

async function resolveGuestContext(): Promise<
  { ok: true; ctx: GuestContext } | { ok: false; failure: GuestChatFailure }
> {
  const admin = createServiceRoleClient();
  if (!admin) {
    return { ok: false, failure: fail("db_unavailable", "Messaging is temporarily unavailable.") };
  }

  const guestSessionId = await resolveGuestSessionId();
  if (!guestSessionId) {
    return { ok: false, failure: fail("forbidden", "We couldn't identify your session. Please refresh and try again.") };
  }

  return { ok: true, ctx: { admin, guestSessionId } };
}

// ─────────────────────────────────────────────────────────────────────────────
// Ownership — load the inquiry IFF it belongs to this guest session.
// This is the read-side mirror of the engine's guest permission branch.
// ─────────────────────────────────────────────────────────────────────────────

type OwnedInquiry = {
  id: string;
  tenantId: string;
  status: string;
  clientUserId: string | null;
};

async function loadOwnedInquiry(
  admin: SupabaseClient,
  inquiryId: string,
  guestSessionId: string,
): Promise<{ ok: true; inquiry: OwnedInquiry } | { ok: false; failure: GuestChatFailure }> {
  const { data, error } = await admin
    .from("inquiries")
    .select("id, tenant_id, status, client_user_id, guest_session_id")
    .eq("id", inquiryId)
    .maybeSingle();

  if (error) {
    logServerError("guest-chat-actions.loadOwnedInquiry", error);
    return { ok: false, failure: fail("engine_error", "Could not load the conversation.") };
  }
  if (!data) {
    return { ok: false, failure: fail("not_found", "This conversation no longer exists.") };
  }
  // THE OWNERSHIP CHECK. A guest may only touch an inquiry whose
  // guest_session_id matches their cookie-resolved session.
  if ((data.guest_session_id as string | null) !== guestSessionId) {
    return { ok: false, failure: fail("forbidden", "You don't have access to this conversation.") };
  }

  return {
    ok: true,
    inquiry: {
      id: data.id as string,
      tenantId: data.tenant_id as string,
      status: data.status as string,
      clientUserId: (data.client_user_id as string | null) ?? null,
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Tenant resolution — service-role lookup of the agency by slug. The guest is
// on the brand's public host (the storefront submit path is already public),
// so we resolve the tenant directly rather than through the staff/portal scope
// (which gates on a caller relationship a guest doesn't have).
// ─────────────────────────────────────────────────────────────────────────────

async function resolveTenantIdBySlug(
  admin: SupabaseClient,
  tenantSlug: string,
): Promise<string | null> {
  const normalized = tenantSlug.trim().toLowerCase();
  if (!normalized) return null;
  const { data, error } = await admin
    .from("agencies")
    .select("id, status")
    .eq("slug", normalized)
    .limit(1)
    .maybeSingle();
  if (error) {
    logServerError("guest-chat-actions.resolveTenantIdBySlug", error);
    return null;
  }
  if (!data) return null;
  if (data.status === "cancelled" || data.status === "archived") return null;
  return data.id as string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Recipient resolution for the block check on INQUIRY CREATE (no inquiry row
// exists yet, so we can't use resolveInquiryRecipients). The recipients that may
// legitimately have blocked this sender are: the targeted talent's owning user +
// every active tenant staff member. isBlocked() honors only blocks authored by
// one of these, so a forged/unrelated block in the tenant can't deny the chat.
// ─────────────────────────────────────────────────────────────────────────────

async function resolveCreateRecipientUserIds(
  admin: SupabaseClient,
  tenantId: string,
  talentProfileId: string | null | undefined,
): Promise<string[]> {
  const ids = new Set<string>();
  // Agency-level (talent-less) chats have no talent recipient — only staff.
  const talentRes = talentProfileId
    ? await admin
        .from("talent_profiles")
        .select("user_id")
        .eq("id", talentProfileId)
        .maybeSingle()
    : null;
  const staffRes = await admin
    .from("agency_memberships")
    .select("profile_id")
    .eq("tenant_id", tenantId)
    .eq("status", "active");
  const talentUserId = (talentRes?.data?.user_id as string | null) ?? null;
  if (talentUserId) ids.add(talentUserId);
  for (const m of (staffRes.data ?? []) as Array<{ profile_id: string | null }>) {
    if (m.profile_id) ids.add(m.profile_id);
  }
  return Array.from(ids);
}

// ─────────────────────────────────────────────────────────────────────────────
// Author-role resolution + message mapping (server-side; the UI trusts these).
// ─────────────────────────────────────────────────────────────────────────────

const VISIBLE_KINDS: ReadonlySet<string> = new Set<GuestMessageKind>([
  "text",
  "offer_event",
  "payment_request",
  "payment_paid",
  "coordinator_request",
  "talent_rate",
  "call_sheet_update",
  "booking_status",
  "booking_confirmed",
  "balance_due",
  "voice",
  "system_event",
]);

type RawMessageRow = {
  id: string;
  inquiry_id: string;
  sender_user_id: string | null;
  guest_session_id: string | null;
  body: string;
  message_kind: string;
  card_payload: unknown | null;
  created_at: string;
  edited_at: string | null;
  deleted_at: string | null;
  reply_to_message_id: string | null;
};

/**
 * Per-participant identity used to derive authorRole + a privacy-safe label.
 * Built once per thread read from inquiry_participants + profiles + talent.
 */
type ParticipantIdentity = {
  role: "client" | "coordinator" | "talent";
  label: string | null;
  avatarUrl: string | null;
};

function deriveAuthorRole(
  row: RawMessageRow,
  thisGuestSessionId: string,
  identityByUserId: Map<string, ParticipantIdentity>,
): GuestMessageAuthorRole {
  // Guest's own message (this session).
  if (!row.sender_user_id && row.guest_session_id === thisGuestSessionId) {
    return "guest";
  }
  // System / platform-authored (no sender, no guest) → system bubble.
  if (!row.sender_user_id) {
    return "system";
  }
  const ident = identityByUserId.get(row.sender_user_id);
  if (!ident) return "other";
  if (ident.role === "coordinator") return "staff";
  if (ident.role === "talent") return "talent";
  // The client participant — for the guest that's effectively "their own
  // account" voice; render as guest-side so it aligns right.
  if (ident.role === "client") return "guest";
  return "other";
}

function toGuestThreadMessage(
  row: RawMessageRow,
  authorRole: GuestMessageAuthorRole,
  identityByUserId: Map<string, ParticipantIdentity>,
): GuestThreadMessage {
  const isDeleted = !!row.deleted_at;
  // Only left-aligned non-guest/non-system bubbles carry a label/avatar. Never
  // leak staff PII — for staff we show the agency-facing role label resolved
  // by the caller (already privacy-filtered into ParticipantIdentity.label).
  let authorLabel: string | null = null;
  let authorAvatarUrl: string | null = null;
  if ((authorRole === "talent" || authorRole === "staff") && row.sender_user_id) {
    const ident = identityByUserId.get(row.sender_user_id);
    authorLabel = ident?.label ?? null;
    authorAvatarUrl = ident?.avatarUrl ?? null;
  }

  return {
    id: row.id,
    inquiryId: row.inquiry_id,
    authorRole,
    authorLabel,
    authorAvatarUrl,
    body: isDeleted ? "" : row.body,
    kind: (VISIBLE_KINDS.has(row.message_kind) ? row.message_kind : "text") as GuestMessageKind,
    cardPayload: row.card_payload ?? null,
    createdAt: row.created_at,
    editedAt: row.edited_at,
    isDeleted,
    replyToMessageId: row.reply_to_message_id,
  };
}

/** Build the participant identity map for a thread (PII-filtered). */
async function loadParticipantIdentities(
  admin: SupabaseClient,
  inquiryId: string,
  agencyName: string | null,
): Promise<Map<string, ParticipantIdentity>> {
  const map = new Map<string, ParticipantIdentity>();
  const { data: participants } = await admin
    .from("inquiry_participants")
    .select("user_id, role, talent_profile_id")
    .eq("inquiry_id", inquiryId);
  if (!participants) return map;

  // Resolve talent display names. Portrait/avatar resolution (which lives in
  // the media tables, not talent_profiles) is a UI fast-follow — the contract
  // permits authorAvatarUrl:null, and the popup keys off the label.
  const talentIds = participants
    .map((p) => p.talent_profile_id as string | null)
    .filter((id): id is string => !!id);
  const talentNameById = new Map<string, string | null>();
  if (talentIds.length > 0) {
    const { data: talents } = await admin
      .from("talent_profiles")
      .select("id, display_name")
      .in("id", talentIds);
    for (const t of talents ?? []) {
      talentNameById.set(t.id as string, (t.display_name as string | null) ?? null);
    }
  }

  // A self-coordinating hub talent holds TWO rows with the SAME user_id (one
  // role='talent', one role='coordinator'). The participant query is unordered,
  // so a naive map.set would let row order decide the guest-visible label. Apply
  // an explicit precedence instead: 'talent' wins over 'coordinator' wins over
  // 'client'. Rationale — the guest messaged this person's TALENT profile, so
  // their reply should read as the talent's own name (Orlando), not the agency
  // brand ("Booking team"). A separate, coordinator-only user (the hub-owner
  // agency coordinator) still presents as the brand.
  const rolePriority: Record<"client" | "coordinator" | "talent", number> = {
    talent: 3,
    coordinator: 2,
    client: 1,
  };
  for (const p of participants) {
    const userId = p.user_id as string | null;
    if (!userId) continue;
    const role = p.role as "client" | "coordinator" | "talent";
    const existing = map.get(userId);
    if (existing && rolePriority[existing.role] >= rolePriority[role]) continue;
    if (role === "talent") {
      const name = p.talent_profile_id ? talentNameById.get(p.talent_profile_id as string) : null;
      map.set(userId, { role, label: name ?? "Talent", avatarUrl: null });
    } else if (role === "coordinator") {
      // Staff PII is intentionally hidden from the guest — present the agency
      // brand as the voice, not the coordinator's personal name.
      map.set(userId, { role, label: agencyName ?? "Booking team", avatarUrl: null });
    } else {
      map.set(userId, { role, label: null, avatarUrl: null });
    }
  }
  return map;
}

/** Map inquiries.status → the coarse popup header status. */
function toThreadStatus(status: string): GuestThreadStatus {
  switch (status) {
    case "draft":
      // Early-partial row: built but NOT yet sent. Must surface as a DRAFT so
      // the launcher pill reads its working state ("Your lineup · N") and never
      // "Inquiry sent" (P0-2 / W0-B). Drafts stay out of every agency inbox.
      return "draft";
    case "offer_pending":
      return "offer_pending";
    case "approved":
    case "qualified":
      return "approved";
    case "booked":
    case "converted":
      return "booked";
    case "closed":
    case "archived":
    case "rejected":
    case "expired":
    case "closed_lost":
      return "closed";
    default:
      return "open";
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared: fetch the agency display name (for staff label + opener).
// ─────────────────────────────────────────────────────────────────────────────

async function loadAgencyName(admin: SupabaseClient, tenantId: string): Promise<string | null> {
  const { data } = await admin
    .from("agencies")
    .select("display_name")
    .eq("id", tenantId)
    .maybeSingle();
  return (data?.display_name as string | null) ?? null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared: read the guest-visible messages for an inquiry, oldest→newest.
// The guest IS the client, so the guest reads the PRIVATE (client) thread — the
// same thread the talent's Client tab and a registered client read/write. The
// GROUP thread is the talent-coordination channel and must NOT reach the guest.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Read the offer_id off an offer_event card's (opaque) payload. Returns null for
 * any non-offer / malformed row.
 */
function offerIdOfCard(m: GuestThreadMessage): string | null {
  if (m.kind !== "offer_event") return null;
  const p = m.cardPayload;
  const offerId = p && typeof p === "object" ? (p as { offer_id?: unknown }).offer_id : null;
  return typeof offerId === "string" && offerId ? offerId : null;
}

/**
 * Enrich `offer_event` cards with a client-safe per-line breakdown (label + note
 * + client-facing line price) so the guest offer card shows the honest, "travel
 * baked in" detail W2 made editable — not just a bare total. The guest IS the
 * client, so label / note / client line price are theirs to see; talent cost /
 * margin is NEVER read here. Two batched queries per thread read, and a no-op
 * (zero queries) when the thread carries no offer cards. Best-effort: any query
 * failure falls back to the bare card rather than dropping the message.
 */
async function enrichOfferCardsWithLines(
  admin: SupabaseClient,
  tenantId: string,
  messages: GuestThreadMessage[],
): Promise<GuestThreadMessage[]> {
  const offerIds = new Set<string>();
  for (const m of messages) {
    const id = offerIdOfCard(m);
    if (id) offerIds.add(id);
  }
  if (offerIds.size === 0) return messages;

  const ids = Array.from(offerIds);
  const [lineRes, offerRes] = await Promise.all([
    admin
      .from("inquiry_offer_line_items")
      .select("offer_id, label, notes, total_price, sort_order")
      .in("offer_id", ids)
      .order("sort_order", { ascending: true }),
    admin
      .from("inquiry_offers")
      .select("id, currency_code")
      .eq("tenant_id", tenantId)
      .in("id", ids),
  ]);
  if (lineRes.error) {
    logServerError("guest-chat-actions.enrichOfferCards", lineRes.error);
    return messages;
  }

  const currencyByOffer = new Map<string, string>();
  for (const o of (offerRes.data ?? []) as Array<{ id: string; currency_code: string | null }>) {
    currencyByOffer.set(o.id, o.currency_code ?? "");
  }

  const linesByOffer = new Map<string, GuestOfferCardLine[]>();
  for (const row of (lineRes.data ?? []) as Array<{
    offer_id: string;
    label: string | null;
    notes: string | null;
    total_price: number | null;
  }>) {
    const currency = currencyByOffer.get(row.offer_id) ?? "";
    const price = typeof row.total_price === "number" ? row.total_price : null;
    const line: GuestOfferCardLine = {
      label: (row.label ?? "").trim(),
      note: row.notes && row.notes.trim() ? row.notes.trim() : null,
      feeLabel: price != null ? `${price.toFixed(2)}${currency ? ` ${currency}` : ""}` : null,
    };
    const bucket = linesByOffer.get(row.offer_id);
    if (bucket) bucket.push(line);
    else linesByOffer.set(row.offer_id, [line]);
  }

  return messages.map((m) => {
    const id = offerIdOfCard(m);
    if (!id) return m;
    const lines = linesByOffer.get(id);
    if (!lines || lines.length === 0) return m;
    return { ...m, cardPayload: { ...(m.cardPayload as Record<string, unknown>), lines } };
  });
}

async function readGuestVisibleMessages(
  admin: SupabaseClient,
  inquiry: OwnedInquiry,
  guestSessionId: string,
  afterIso: string | null,
): Promise<GuestThreadMessage[]> {
  const agencyName = await loadAgencyName(admin, inquiry.tenantId);
  const identityByUserId = await loadParticipantIdentities(admin, inquiry.id, agencyName);

  let query = admin
    .from("inquiry_messages")
    .select(
      "id, inquiry_id, sender_user_id, guest_session_id, body, message_kind, card_payload, created_at, edited_at, deleted_at, reply_to_message_id, thread_type, metadata",
    )
    .eq("inquiry_id", inquiry.id)
    .eq("tenant_id", inquiry.tenantId)
    // PRIVATE (client) thread — the guest IS the client, so they read the same
    // thread the talent's Client tab and a registered client use. This surfaces
    // the talent-coordinator's replies (which live on 'private'). The GROUP
    // thread is the talent-coordination channel and must NOT reach the guest.
    .eq("thread_type", "private")
    .order("created_at", { ascending: true });

  if (afterIso) {
    query = query.gt("created_at", afterIso);
  }

  const { data, error } = await query;
  if (error) {
    logServerError("guest-chat-actions.readGuestVisibleMessages", error);
    return [];
  }

  // Jon 360 Phase 2: once the inquiry is genuinely sent, the pinned
  // InquiryReceiptCard upgrades the thin auto-ack bubble — so suppress the
  // workspace_auto_ack system bubble to avoid doubling up the same "we received
  // your message" beat. The metadata stamp (set in guest-auto-ack.ts) is the
  // load-bearing signal; we never string-match the body copy.
  const suppressAutoAck = isReceiptVisibleStatus(inquiry.status);

  const mapped = (data ?? [])
    .filter((raw) => {
      if (!suppressAutoAck) return true;
      const meta = (raw as { metadata?: unknown }).metadata;
      const eventType =
        meta && typeof meta === "object" && meta !== null
          ? (meta as { system_event_type?: unknown }).system_event_type
          : undefined;
      return eventType !== "workspace_auto_ack";
    })
    .map((raw) => {
      const row = raw as unknown as RawMessageRow;
      const role = deriveAuthorRole(row, guestSessionId, identityByUserId);
      return toGuestThreadMessage(row, role, identityByUserId);
    });

  // W2-3 — graduate the offer card from its MVP fallback: attach the client-safe
  // per-line label + note + price so the guest sees the honest breakdown.
  return enrichOfferCardsWithLines(admin, inquiry.tenantId, mapped);
}

// ═════════════════════════════════════════════════════════════════════════════
// 3a. startGuestChatInquiry
// ═════════════════════════════════════════════════════════════════════════════

export async function startGuestChatInquiry(
  input: StartGuestChatInput,
): Promise<StartGuestChatResult> {
  // L0 — honeypot: a populated value ⇒ silent spam reject. We return a generic
  // forbidden so a bot can't distinguish honeypot rejection from a real error.
  if (input.honeypot && input.honeypot.trim().length > 0) {
    return fail("forbidden", "Unable to send your message.");
  }

  const contactFirstName = input.contactFirstName?.trim() ?? "";
  const contactLastName = input.contactLastName?.trim() ?? "";
  const contactName =
    input.contactName?.trim() ||
    [contactFirstName, contactLastName].filter(Boolean).join(" ");
  const contactEmail = input.contactEmail?.trim() ?? "";
  // Storefront carry: when the guest clicked a specific offering, make the
  // request VISIBLE in the thread (coordinator + guest both see exactly what
  // was asked for) and persist the structured payload in source_context below.
  const offering = input.offering ?? null;
  const offeringPrefix = offering
    ? `Requesting: ${offering.title}${
        offering.amount_cents != null
          ? ` (${offering.currency} ${(offering.amount_cents / 100).toLocaleString()})`
          : ""
      }\n\n`
    : "";
  const rawFirstMessage = input.firstMessage?.trim() ?? "";
  const firstMessage = rawFirstMessage ? `${offeringPrefix}${rawFirstMessage}` : rawFirstMessage;

  const missing: string[] = [];
  if (!contactFirstName) missing.push("requester.first_name");
  if (!contactName) missing.push("requester.name");
  if (!contactEmail) missing.push("requester.email");
  if (!firstMessage) missing.push("brief.summary");
  if (missing.length > 0) {
    return fail("validation_failed", "Add your first name, email, and a message to start.", {
      missingFields: missing,
    });
  }
  // talentProfileId is OPTIONAL: present on a talent profile page (source
  // `public_talent_profile`), absent on the agency directory/home launcher,
  // which starts a talent-less "message the agency" inquiry (source `agency_site`).
  const talentProfileId = input.talentProfileId?.trim() || null;
  const hasTalent = talentProfileId !== null;

  const guest = await resolveGuestContext();
  if (!guest.ok) return guest.failure;
  const { admin, guestSessionId } = guest.ctx;

  const tenantId = await resolveTenantIdBySlug(admin, input.tenantSlug);
  if (!tenantId) {
    return fail("tenant_unavailable", "We couldn't find this workspace.");
  }

  // SECURITY (L1-F1): the targeted talent id is client-supplied and the insert
  // below runs under the service-role client, so we MUST verify the talent is on
  // THIS tenant's publicly visible roster before creating the inquiry. Without
  // this gate a crafted request could file an inquiry naming a hidden /
  // unapproved / off-roster / cross-agency talent. Talent-less "message the
  // agency" inquiries (hasTalent === false) have nothing to gate. Legitimate hub
  // + agency storefront paths always surface roster-visible talent, so this
  // never rejects a real conversation.
  if (talentProfileId) {
    const rosterCheck = await assertAllTalentOnTenantRoster(admin, tenantId, [
      talentProfileId,
    ]);
    if (!rosterCheck.ok) {
      logServerError(
        "guest-chat-actions.startGuestChatInquiry/roster",
        new Error(`talent not on tenant roster: ${rosterCheck.missingIds.join(",")}`),
      );
      // The workspace resolved fine; this talent is not on its visible roster.
      // Saying "we couldn't find this workspace" sent visitors chasing the
      // wrong problem. The profile page now 404s before anyone can get here,
      // so this is the crafted-request / raced-removal path only.
      return fail(
        "talent_unavailable",
        "This talent is not taking inquiries here right now.",
      );
    }
  }

  // ── Anti-abuse floor (Lane B): honeypot re-check (L0) + disposable-email
  // block (L1) + cross-instance KV rate-limit (L2) + velocity-triggered captcha
  // (L3). Runs BEFORE any DB write. Returns a contract-shaped GuestChatFailure
  // on the first tripped layer; the UI branches on the code. No-op for the KV /
  // captcha layers when their env vars are unset (local dev / unconfigured).
  const ip = await resolveClientIp();
  const abuse = await checkGuestInquiryAbuse({
    honeypot: input.honeypot,
    email: contactEmail,
    guestSessionId,
    ip,
    tenantId,
    captchaToken: input.captchaToken,
  });
  if (!abuse.ok) return abuse;

  // Provision (or match) a guest client by email — same as the proven submit
  // path. "unlinked" means the email belongs to a privileged account; the
  // inquiry then carries client_user_id:null but guest_session_id still links
  // it for the (email-verified) claim later.
  const provisioned = await ensureGuestClientByEmail({
    email: contactEmail,
    name: contactName,
    firstName: contactFirstName,
    lastName: contactLastName,
    company: "",
    phone: input.contactPhone?.trim() ?? "",
  });

  // ── Trust gate (U3): per-tenant active-conversation cap by identity tier. The
  // unlock currency is VERIFICATION, never money — a guest at their cap is
  // nudged to verify their email / create a free account, never to pay. Runs
  // ONLY on the inquiry-CREATE path (here); continuing an already-owned thread
  // (sendGuestMessageAction) is NEVER gated. The gate FAILS OPEN internally, so a
  // config/DB blip can never block a real buyer from reaching the agency.
  const gate = await evaluateGuestConversationGate({
    admin,
    tenantId,
    guestSessionId,
    clientUserId: provisioned.clientUserId,
    contactEmail,
  });
  if (!gate.allowed) {
    return {
      ...fail(
        "limit_reached",
        gate.tier === "account"
          ? "You've reached your open-conversation limit. Wrap up or close one to start another."
          : gate.tier === "email_verified"
            ? "You have a few conversations going — create a free account to start more."
            : "You have a conversation going — verify your email to start more.",
      ),
      // Surface the resolved tier + real counts so TrustGateNudge can show
      // accurate numbers (fixes the 0/0 display — fix 7).
      // GuestTrustTier (guest-trust-gate.ts) and GuestIdentityTier (contract)
      // have the identical union spelling — the cast is safe.
      gateTier: gate.tier as GuestIdentityTier,
      activeCount: gate.activeCount,
      limit: gate.limit,
    };
  }

  // ── Recipient safety (Lane C): refuse to create the inquiry when this sender
  // (guest session and/or the just-provisioned client user) is blocked by a
  // RECIPIENT of this conversation — the targeted talent or tenant staff. Scoped
  // so a forged/unrelated block in the tenant can't deny the chat. Fail-open on
  // infra error (see isBlocked docs).
  const createRecipientIds = await resolveCreateRecipientUserIds(
    admin,
    tenantId,
    talentProfileId,
  );
  const block = await isBlocked(
    {
      tenantId,
      guestSessionId,
      clientUserId: provisioned.clientUserId,
      recipientUserIds: createRecipientIds,
    },
    admin,
  );
  if (block.blocked) {
    return fail("blocked", "This conversation can't be started right now.");
  }

  // ── AI conversational capture (Lane D): parse the first message into
  // structured InquiryIntent fragments (location / date / event_type / headcount
  // / budget / service hints) so the coordinator sees real details rather than a
  // raw blob + `not_sure` everywhere. BEST-EFFORT + NON-BLOCKING — the extractor
  // never throws and returns {} on ANY failure (AI off, no key, rate-limited,
  // timeout, bad JSON), in which case we keep the `not_sure` defaults below so
  // validateIntentForSubmit still passes and the inquiry is always created. The
  // extractor honors the existing AI master/draft toggles + usage gate.
  const capture = await captureGuestMessageDetails(firstMessage, tenantId);

  // Assemble the full InquiryIntent server-side. firstMessage → brief.summary
  // so validateIntentForSubmit passes (it requires brief.summary OR a selected
  // talent — here BOTH are satisfied), and the talent is pre-selected.
  //
  // location/date hard-require .(city|status) / .(event_date|status); we seed
  // "not_sure" and let any AI-derived fragment OVERRIDE it (a derived fragment
  // always carries its own status, so the validator stays satisfied). Other
  // captured fragments (talent count/types, budget, event_type) only ADD signal.
  const talentTypesNeeded = capture.talent?.types_needed;
  // Talent block: a pre-selected single talent on a profile page, or — on the
  // agency directory/home launcher — a talent-less "agency recommends" intent.
  // validateIntentForSubmit is satisfied either way: brief.summary is always set,
  // and it requires `brief.summary OR talent.selected_ids`.
  const talentIntent = hasTalent
    ? {
        selected_ids: [talentProfileId as string],
        selection_mode: "i_know_who" as const,
        ...(capture.talent?.count_needed ? { count_needed: capture.talent.count_needed } : {}),
        ...(talentTypesNeeded && talentTypesNeeded.length > 0
          ? { types_needed: talentTypesNeeded }
          : {}),
      }
    : {
        selection_mode: "agency_recommends" as const,
        ...(capture.talent?.count_needed ? { count_needed: capture.talent.count_needed } : {}),
        ...(talentTypesNeeded && talentTypesNeeded.length > 0
          ? { types_needed: talentTypesNeeded }
          : {}),
      };
  const intent: InquiryIntent = {
    source: hasTalent ? "public_talent_profile" : "agency_site",
    source_context: {
      ...(hasTalent && input.talentProfileCode
        ? { public_profile_code: input.talentProfileCode }
        : {}),
      referrer_page: input.sourcePage,
      tenant_id: tenantId,
      ...(capture.eventType ? { ai_event_type: capture.eventType } : {}),
      ...(offering ? { offering } : {}),
    },
    requester: {
      name: contactName,
      email: contactEmail,
      phone: input.contactPhone?.trim() || undefined,
      trust_level: "basic",
    },
    talent: talentIntent,
    // Default to "not_sure"; an AI-derived fragment (which carries its own
    // exact/flexible/online/unconfirmed status) replaces it when present.
    location: capture.location ?? { status: "not_sure" },
    date: capture.date ?? { status: "not_sure" },
    ...(capture.budget ? { budget: capture.budget } : {}),
    brief: {
      summary: firstMessage,
    },
  };

  // Channel attribution (Phase A invariant): stamp the HOST tenant the guest
  // entered through as source_workspace_id, and the exact hostname as
  // origin_domain. `tenantId` here is resolved from the storefront/hub slug the
  // profile page was served under, so it IS the originating host. Without this
  // the engine defaults source_workspace_id from tenant_id — which, once
  // XTENANT_REHOME re-homes the inquiry onto the managing agency, would record
  // the AGENCY as the channel (breaking hub channel-performance + the referral
  // lane) and would violate the invariant that a re-homed inquiry always has
  // source_workspace_id != tenant_id. Mirrors contact/actions.ts +
  // api/discover/inquiry/route.ts. No-op with the flag off (source == tenant).
  const hostCtx = await getPublicHostContext();
  const created = await createInquiryFromIntent(admin, intent, {
    tenant_id: tenantId,
    actor_user_id: null,
    client_user_id: provisioned.clientUserId,
    guest_session_id: guestSessionId,
    source_workspace_id: tenantId,
    origin_domain: hostCtx.hostname ?? null,
    host_kind: hostCtx.kind,
    host_tenant_id: hostCtx.tenantId,
  });

  if (!created.ok) {
    if (created.reason === "rate_limited") {
      return fail("rate_limited", "You're starting conversations too quickly — please wait a moment.");
    }
    if (created.reason === "validation_failed") {
      return fail("validation_failed", "Add the missing details and try again.", {
        missingFields: created.missingFields,
      });
    }
    if (created.reason === "forbidden") {
      return fail("forbidden", "You don't have permission to do that.");
    }
    if (created.reason === "slot_taken") {
      return fail("engine_error", created.error ?? "That time was just taken. Pick another time.");
    }
    return fail("engine_error", created.error ?? "Could not start the conversation.");
  }

  const inquiryId = created.inquiryId;

  // Seed the FIRST provisioned account as the initial claim candidate so the
  // "use a different/additional email" path (sendGuestClaimToEmail) and the
  // first-confirm-wins relink in /auth/confirm share one candidate set. Only the
  // matched/created account is a candidate; an "unlinked" (staff/talent) email
  // has no client account to claim. Best-effort — never block inquiry creation.
  if (provisioned.clientUserId) {
    const { error: seedErr } = await admin
      .from("inquiries")
      .update({ claim_candidate_user_ids: [provisioned.clientUserId] })
      .eq("id", inquiryId);
    if (seedErr) {
      logServerError("guest-chat-actions.startGuestChatInquiry/seedCandidate", seedErr);
    }
  }

  // Append the first message as a PRIVATE/client-thread guest message so it
  // lands on the same client↔coordinator thread the talent's Client tab and a
  // registered client read — the guest IS the client. This fires the
  // coordinator realtime + notification fanout. The brief.summary above seeds
  // the inquiry record; this is the visible bubble.
  const sent = await sendMessage(admin, {
    inquiryId,
    tenantId,
    actorUserId: null,
    guestSessionId,
    threadType: "private",
    body: firstMessage,
  });

  // Honest auto-ack (Lane E / P2): post a system_event bubble into the GROUP
  // thread confirming receipt, with the real "typically replies in ~X" latency
  // woven in (or an honest no-timeframe fallback when there isn't enough data).
  // Returns null when disabled or on insert failure — we then fall back to any
  // system bubble found in the read-back. Defaults (enabled, no custom copy);
  // a future enhancement can pass the tenant's auto_ack_message/enabled flag.
  // The tenant's OWN auto-ack copy, emitted here — after the guest's message —
  // rather than by the engine's fire-and-forget block, which raced it and won.
  // This is the "future enhancement" the previous comment named: the arguments
  // have existed since this module shipped and nothing ever passed them, so
  // every guest saw the generic body while the tenant's configured sentence
  // went out of order in a thread only the client and the workspace could read.
  const { data: ackSettings, error: ackSettingsError } = await admin
    .from("agencies")
    .select("auto_ack_enabled, auto_ack_message")
    .eq("id", tenantId)
    .maybeSingle();
  if (ackSettingsError) {
    // Fails OPEN, deliberately: a read failure leaves `ackSettings` null, which
    // is read as enabled below, so the guest still gets acknowledged — with the
    // generic body rather than the tenant's. Silence would make a tenant whose
    // custom copy stopped appearing indistinguishable from one who never set it.
    logServerError("guest-chat-actions.autoAckSettings", ackSettingsError);
  }
  const emittedAutoAck = await emitGuestAutoAck({
    inquiryId,
    tenantId,
    talentProfileId,
    // A null row means enabled, matching the engine's own default — an agency
    // that has never opened the setting still acknowledges its guests.
    autoAckEnabled: ackSettings == null ? true : ackSettings.auto_ack_enabled !== false,
    customAckMessage:
      typeof ackSettings?.auto_ack_message === "string" ? ackSettings.auto_ack_message : null,
  });

  // GUEST → CLIENT CLAIM (best-effort): email the guest a magic-link so they can
  // sign in (passwordless, proves email ownership) and continue THIS conversation
  // from the client Messages surface. Only when a real client account was
  // provisioned/matched — an "unlinked" guest has no account to claim.
  let claimEmailSent = false;
  if (provisioned.clientUserId) {
    // Talent display name for the subject/body — best-effort; fall back to the
    // agency name so the copy is never empty.
    let talentName = "";
    if (talentProfileId) {
      const { data: talentRow } = await admin
        .from("talent_profiles")
        .select("display_name")
        .eq("id", talentProfileId)
        .maybeSingle();
      talentName = (talentRow?.display_name as string | null)?.trim() || "";
    }
    if (!talentName) {
      talentName = (await loadAgencyName(admin, tenantId)) ?? "the team";
    }

    const claimResult = await sendGuestClaimEmail({
      email: contactEmail,
      tenantSlug: input.tenantSlug,
      talentName,
      appUrl: getAppUrl(),
      tenantId,
    });
    claimEmailSent = claimResult.ok;
    if (!claimResult.ok) {
      logServerError(
        "guest-chat-actions.startGuestChatInquiry/claimEmail",
        new Error(`${claimResult.reason}${claimResult.detail ? `: ${claimResult.detail}` : ""}`),
      );
    }
  }

  // Load the inquiry as an OwnedInquiry to read back the opening + auto-ack.
  const owned = await loadOwnedInquiry(admin, inquiryId, guestSessionId);
  if (!owned.ok) {
    // The inquiry was created but we can't read it back as owned — surface the
    // id so the popup can still poll; treat as a soft engine error otherwise.
    if (sent.success) {
      return {
        ok: true,
        inquiryId,
        openingMessage: synthOpeningMessage(inquiryId, sent.data?.messageId ?? "", firstMessage),
        autoAckMessage: emittedAutoAck,
        guestEmail: contactEmail,
        claimEmailSent,
        guestActivation: provisioned.status,
      };
    }
    return fail("engine_error", "Started the conversation but couldn't load it. Please refresh.");
  }

  const messages = await readGuestVisibleMessages(admin, owned.inquiry, guestSessionId, null);
  const openingMessage =
    messages.find((m) => m.authorRole === "guest") ??
    synthOpeningMessage(inquiryId, sent.success ? sent.data?.messageId ?? "" : "", firstMessage);
  // Prefer the ack we just emitted; fall back to any system bubble in the
  // read-back (covers a pre-existing group system_event, e.g. from the engine).
  const autoAckMessage =
    emittedAutoAck ?? messages.find((m) => m.authorRole === "system") ?? null;

  return {
    ok: true,
    inquiryId,
    openingMessage,
    autoAckMessage,
    guestEmail: contactEmail,
    claimEmailSent,
    guestActivation: provisioned.status,
  };
}

/** Last-resort opening bubble when we couldn't read the row back. */
function synthOpeningMessage(inquiryId: string, messageId: string, body: string): GuestThreadMessage {
  return {
    id: messageId || `pending-${inquiryId}`,
    inquiryId,
    authorRole: "guest",
    authorLabel: null,
    authorAvatarUrl: null,
    body,
    kind: "text",
    cardPayload: null,
    createdAt: new Date().toISOString(),
    editedAt: null,
    isDeleted: false,
    replyToMessageId: null,
  };
}

// ═════════════════════════════════════════════════════════════════════════════
// 3b. sendGuestMessageAction
// ═════════════════════════════════════════════════════════════════════════════

/**
 * W3-5 — attach a tapped service to a LIVE guest thread as STRUCTURED data
 * (inquiries.source_context.offerings[]), not just visible text. Guest-cookie
 * ownership gated exactly like sendGuestMessageAction. Best-effort UX: the
 * chip tap also prefills the composer, so a failure here only loses analytics
 * provenance, never the conversation.
 */
export async function attachOfferingToGuestInquiry(input: {
  inquiryId: string;
  offering: {
    offering_id: string;
    title: string;
    amount_cents: number | null;
    currency: string;
    price_type: string;
    kind: string;
  };
}): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!input?.inquiryId || !input.offering?.offering_id) {
    return { ok: false, error: "Missing conversation or service." };
  }
  const guest = await resolveGuestContext();
  if (!guest.ok) return { ok: false, error: "Not your conversation." };
  const { admin, guestSessionId } = guest.ctx;
  const owned = await loadOwnedInquiry(admin, input.inquiryId, guestSessionId);
  if (!owned.ok) return { ok: false, error: "Not your conversation." };

  const { data: row } = await admin
    .from("inquiries")
    .select("source_context")
    .eq("id", input.inquiryId)
    .maybeSingle();
  const ctx = (row?.source_context ?? {}) as Record<string, unknown>;
  const existing = Array.isArray(ctx.offerings) ? (ctx.offerings as Record<string, unknown>[]) : [];
  if (existing.some((o) => o.offering_id === input.offering.offering_id)) return { ok: true };
  const next = {
    ...ctx,
    ...(ctx.offering ? {} : { offering: input.offering }),
    offerings: [...existing, { ...input.offering, attached_at: new Date().toISOString() }].slice(0, 10),
  };
  const { error } = await admin
    .from("inquiries")
    .update({ source_context: next })
    .eq("id", input.inquiryId);
  if (error) {
    logServerError("guestChat.attachOffering", error);
    return { ok: false, error: "Could not attach the service." };
  }
  return { ok: true };
}

export async function sendGuestMessageAction(
  input: SendGuestMessageInput,
): Promise<SendGuestMessageResult> {
  // L0 — honeypot.
  if (input.honeypot && input.honeypot.trim().length > 0) {
    return fail("forbidden", "Unable to send your message.");
  }

  const body = input.body?.trim() ?? "";
  if (!body) {
    return fail("validation_failed", "Type a message first.", { missingFields: ["body"] });
  }
  if (body.length > MAX_BODY) {
    return fail("validation_failed", "That message is too long.", { missingFields: ["body"] });
  }
  if (!input.inquiryId) {
    return fail("validation_failed", "Missing conversation.", { missingFields: ["inquiryId"] });
  }

  const guest = await resolveGuestContext();
  if (!guest.ok) return guest.failure;
  const { admin, guestSessionId } = guest.ctx;

  // OWNERSHIP GATE — proves inquiries.guest_session_id === cookie session.
  const owned = await loadOwnedInquiry(admin, input.inquiryId, guestSessionId);
  if (!owned.ok) return owned.failure;

  // ── Anti-abuse floor (Lane B) for follow-up sends: honeypot re-check (L0) +
  // KV rate-limit (L2) + velocity-captcha (L3). Disposable-email (L1) is NOT
  // re-checked — it was gated at inquiry create. Runs after the ownership gate
  // (we need the tenant) and before the engine write.
  const ip = await resolveClientIp();
  const abuse = await checkGuestMessageAbuse({
    honeypot: input.honeypot,
    guestSessionId,
    ip,
    tenantId: owned.inquiry.tenantId,
    email: null,
    captchaToken: input.captchaToken,
  });
  if (!abuse.ok) return abuse;

  // ── Recipient safety (Lane C): refuse the send when this sender is blocked
  // by an actual RECIPIENT of this inquiry (its talent participants + tenant
  // staff). Scoped so a forged/unrelated block can't deny the thread. Fail-open
  // on infra error.
  const recipients = await resolveInquiryRecipients(
    admin,
    owned.inquiry.id,
    owned.inquiry.tenantId,
  );
  const block = await isBlocked(
    {
      tenantId: owned.inquiry.tenantId,
      guestSessionId,
      clientUserId: owned.inquiry.clientUserId,
      recipientUserIds: [...recipients.talentUserIds, ...recipients.workspaceUserIds],
    },
    admin,
  );
  if (block.blocked) {
    return fail("blocked", "This conversation can't continue.");
  }

  // ── Placeholder-contact gate (P0-6 / W0-D) — BEFORE the insert. Refuse
  // (write nothing) when the target inquiry is STILL a pre-send DRAFT and its
  // contact is STILL the synthetic seed placeholder. Previously this same
  // check ran only AFTER the message was already inserted (gating just the
  // submitted-promotion), so a call that skipped the client's promote-then-send
  // flow (a replayed/direct call to this action) could durably write a message
  // into inquiry_messages while the inquiry stayed a hidden draft with an
  // UNREACHABLE contact. The legitimate first-send flow (continueEarlyInquiry /
  // sendToAgency in use-mini-chat-send.ts) always awaits promoteContact —
  // which durably writes the REAL contact via captureGuestChip(kind:"contact")
  // — BEFORE calling this action, so a legitimate send's contact row is already
  // real by the time we read it here and this never trips for a real guest. A
  // non-draft inquiry (already promoted, or any other lifecycle status) skips
  // this read entirely and proceeds exactly as before. Pure predicate +
  // isRealContact reused below so the post-send promotion doesn't re-query.
  // See guest-send-gate.ts for the decision logic + its unit tests.
  let isRealContact = true;
  if (owned.inquiry.status === "draft") {
    const { data: contactRow, error: contactErr } = await admin
      .from("inquiries")
      .select("contact_name, contact_email")
      .eq("id", owned.inquiry.id)
      .eq("tenant_id", owned.inquiry.tenantId)
      .maybeSingle();
    if (contactErr) {
      logServerError("guest-chat-actions.sendGuestMessageAction/contactRead", contactErr);
      return fail("engine_error", "Could not send your message.");
    }
    if (!contactRow) {
      // The inquiry vanished between the ownership check above and this read
      // (contact_name/contact_email are NOT NULL columns, so a row that exists
      // always has a value in both — the only way to get here is no row at
      // all). Treat as not-found rather than silently sending into an
      // unverifiable draft.
      return fail("not_found", "This conversation no longer exists.");
    }
    const contactName = contactRow.contact_name as string | null;
    const contactEmail = contactRow.contact_email as string | null;
    if (
      shouldRefuseGuestSend({
        status: owned.inquiry.status,
        contactName,
        contactEmail,
      })
    ) {
      return fail("forbidden", "You don't have access to this conversation.");
    }
    isRealContact = !isSeedContact(contactName, contactEmail);
  }

  // ── W2-I auto-scan: on the FIRST real send (still a draft, contact already
  // real) run the AI conversation scan over the OUTGOING body BEFORE the
  // insert + promotion freeze the inquiry — the only window where empty-field
  // fills are still legal. The scan is prefiltered (no model call unless the
  // text looks like event details), EMPTY-ONLY, and best-effort: any failure
  // or timeout never blocks the send.
  if (owned.inquiry.status === "draft" && isRealContact) {
    try {
      await scanGuestConversationForDetails({
        inquiryId: owned.inquiry.id,
        draftText: body,
      });
    } catch (scanErr) {
      logServerError("guest-chat-actions.sendGuestMessageAction/autoScan", scanErr);
    }
  }

  // Send the follow-up onto the PRIVATE/client thread — the guest IS the
  // client, so this is the same client↔coordinator thread the talent's Client
  // tab and a registered client read/write.
  const sent = await sendMessage(admin, {
    inquiryId: owned.inquiry.id,
    tenantId: owned.inquiry.tenantId,
    actorUserId: null,
    guestSessionId,
    threadType: "private",
    body,
  });

  if (!sent.success) {
    if (sent.rateLimited) {
      return fail("rate_limited", "You're sending messages too quickly — please wait a moment.", {
        retryAfterMs: sent.retryAfterMs,
      });
    }
    if (sent.forbidden) {
      return fail("forbidden", "You don't have access to this conversation.");
    }
    return fail("engine_error", sent.error ?? "Could not send your message.");
  }

  // Promote a pre-send DRAFT early-row to `submitted` + coordinator on this, its
  // FIRST real send — mirroring the fresh-create path (submitInquiry). The
  // placeholder-contact case was already refused above (before the insert), so
  // isRealContact is always true here when status was 'draft' — this branch is
  // now just the (unchanged) idempotent promotion, not a contact re-check.
  // Idempotent: promoteEarlyInquiryToSubmitted no-ops once the status is no
  // longer `draft`, so later messages don't re-promote. Best-effort: a
  // promotion failure must not fail the (already persisted) send.
  if (owned.inquiry.status === "draft" && isRealContact) {
    const promoted = await promoteEarlyInquiryToSubmitted(admin, {
      inquiryId: owned.inquiry.id,
      tenantId: owned.inquiry.tenantId,
    });
    if (!promoted.success) {
      logServerError(
        "guest-chat-actions.sendGuestMessageAction/promote",
        new Error(promoted.error ?? promoted.reason ?? "promote_failed"),
      );
    }
  }

  const messageId = sent.data?.messageId ?? "";
  // Read the created row back in the canonical shape (single-row fetch).
  const { data: rawRow } = await admin
    .from("inquiry_messages")
    .select(
      "id, inquiry_id, sender_user_id, guest_session_id, body, message_kind, card_payload, created_at, edited_at, deleted_at, reply_to_message_id",
    )
    .eq("id", messageId)
    .eq("tenant_id", owned.inquiry.tenantId)
    .maybeSingle();

  if (rawRow) {
    const row = rawRow as unknown as RawMessageRow;
    // A guest's own send is always authorRole "guest".
    const message = toGuestThreadMessage(row, "guest", new Map());
    return { ok: true, message };
  }

  // Fallback synthetic echo (insert succeeded but read-back failed).
  return { ok: true, message: synthOpeningMessage(owned.inquiry.id, messageId, body) };
}

// ─────────────────────────────────────────────────────────────────────────────
// Guest claim-email lookup — shared by checkGuestClaimEmail + sendGuestClaimToEmail.
// ─────────────────────────────────────────────────────────────────────────────

const TEAM_EMAIL_MSG =
  "That email is already tied to a team account — try a personal email instead.";
const REGISTERED_REPLACE_MSG =
  "This email is already registered. Sign in with that account, or use a different email.";
const REGISTERED_GATE_MSG =
  "This email already has a Tulala account — we'll send a sign-in link after you send your message.";
const REGISTERED_SAME_MSG =
  "This is the email on your conversation — we'll send a sign-in link here.";

function claimEmailFailureMessage(reason: string | undefined): string {
  if (reason === "skipped") {
    return "Email delivery isn't configured in this environment — sign-in links can't be sent from local dev without RESEND_API_KEY.";
  }
  return "Couldn't send the sign-in link. Please try again in a moment.";
}

type ClaimEmailLookup = {
  status: GuestClaimEmailStatus;
  matchedUserId: string | null;
  message?: string;
  blocksSubmit?: boolean;
};

async function lookupGuestClaimEmail(
  admin: SupabaseClient,
  email: string,
  inquiryClientUserId: string | null,
  opts: { replacePrimary: boolean },
): Promise<ClaimEmailLookup> {
  const normalized = email.trim().toLowerCase();
  if (!normalized) return { status: "available", matchedUserId: null };

  const { data: matchRows, error: matchErr } = await admin.rpc(
    "find_auth_user_identity_by_email",
    { p_email: normalized },
  );
  if (matchErr) {
    logServerError("guest-chat-actions.lookupGuestClaimEmail", matchErr);
    return { status: "available", matchedUserId: null };
  }

  const match = Array.isArray(matchRows) ? matchRows[0] : null;
  if (!match?.user_id) return { status: "available", matchedUserId: null };

  const role = match.app_role as string | null;
  if (role === "super_admin" || role === "agency_staff" || role === "talent") {
    return {
      status: "team_account",
      matchedUserId: match.user_id as string,
      message: TEAM_EMAIL_MSG,
      blocksSubmit: opts.replacePrimary,
    };
  }

  const matchedUserId = match.user_id as string;
  if (inquiryClientUserId && matchedUserId === inquiryClientUserId) {
    return {
      status: "same_account",
      matchedUserId,
      message: REGISTERED_SAME_MSG,
    };
  }

  if (opts.replacePrimary) {
    return {
      status: "already_registered",
      matchedUserId,
      message: REGISTERED_REPLACE_MSG,
      blocksSubmit: true,
    };
  }

  return {
    status: "already_registered",
    matchedUserId,
    message: REGISTERED_GATE_MSG,
    blocksSubmit: false,
  };
}

export async function checkGuestClaimEmail(
  input: CheckGuestClaimEmailInput,
): Promise<CheckGuestClaimEmailResult> {
  const email = input.email?.trim() ?? "";
  if (!email) return { ok: true, status: "available" };

  const guest = await resolveGuestContext();
  if (!guest.ok) return guest.failure;
  const { admin, guestSessionId } = guest.ctx;

  let inquiryClientUserId: string | null = null;
  if (input.inquiryId) {
    const owned = await loadOwnedInquiry(admin, input.inquiryId, guestSessionId);
    if (!owned.ok) return owned.failure;
    inquiryClientUserId = owned.inquiry.clientUserId;
  }

  const lookup = await lookupGuestClaimEmail(admin, email, inquiryClientUserId, {
    replacePrimary: Boolean(input.replacePrimary),
  });

  return {
    ok: true,
    status: lookup.status,
    message: lookup.message,
    blocksSubmit: lookup.blocksSubmit,
  };
}

// ═════════════════════════════════════════════════════════════════════════════
// 3b-bis. sendGuestClaimToEmail — send the claim/sign-in link to a different OR
// additional email and register that account as a claim CANDIDATE on the
// guest-owned inquiry. Whichever candidate confirms their magic-link FIRST claims
// the conversation (first-confirm-wins; the relink lives in /auth/confirm).
// ═════════════════════════════════════════════════════════════════════════════

export async function sendGuestClaimToEmail(
  input: AddGuestClaimEmailInput,
): Promise<AddGuestClaimEmailResult> {
  const email = input.email?.trim() ?? "";
  if (!email) {
    return fail("validation_failed", "Enter an email address.", { missingFields: ["email"] });
  }
  if (!input.inquiryId) {
    return fail("validation_failed", "Missing conversation.", { missingFields: ["inquiryId"] });
  }

  const guest = await resolveGuestContext();
  if (!guest.ok) return guest.failure;
  const { admin, guestSessionId } = guest.ctx;

  // OWNERSHIP GATE — the cookie session MUST own this inquiry. Never trust a
  // client-supplied session; this is the same gate the other guest actions use.
  const owned = await loadOwnedInquiry(admin, input.inquiryId, guestSessionId);
  if (!owned.ok) return owned.failure;

  const emailLookup = await lookupGuestClaimEmail(
    admin,
    email,
    owned.inquiry.clientUserId,
    { replacePrimary: Boolean(input.replacePrimary) },
  );
  if (emailLookup.blocksSubmit) {
    return fail(
      "validation_failed",
      emailLookup.message ?? REGISTERED_REPLACE_MSG,
      { missingFields: ["email"] },
    );
  }
  if (emailLookup.status === "team_account") {
    return fail("forbidden", emailLookup.message ?? TEAM_EMAIL_MSG);
  }

  // ── Anti-abuse gate: rate-limit on TARGET email + IP + tenant so an attacker
  // who owns one inquiry cannot spam claim emails to arbitrary addresses.
  // Keyed on the NORMALIZED target email (the one the guest just supplied) and
  // the tenant, so rotating the guest cookie does not bypass it. We reuse the
  // checkGuestMessageSend limiter on a claim-scoped key — the window is
  // intentionally generous for message sends but appropriate here because a
  // legitimate guest has no reason to send dozens of claim emails quickly.
  const claimIp = await resolveClientIp();
  const normalizedClaimEmail = normalizeEmailForKey(email);
  const claimEmailKey = guestCreateEmailKey(owned.inquiry.tenantId, normalizedClaimEmail);
  const claimEmailAbuse = await checkGuestMessageSend(claimEmailKey);
  if (!claimEmailAbuse.ok) {
    return fail("rate_limited", "You're sending claim links too quickly — please wait a moment.", {
      retryAfterMs: claimEmailAbuse.retryAfterMs,
    });
  }
  // Also check by IP when available — stops a single origin burning through
  // many email aliases.
  if (claimIp) {
    const claimIpKey = `guest_claim_ip:${owned.inquiry.tenantId}:${claimIp}`;
    const claimIpAbuse = await checkGuestMessageSend(claimIpKey);
    if (!claimIpAbuse.ok) {
      return fail("rate_limited", "You're sending claim links too quickly — please wait a moment.", {
        retryAfterMs: claimIpAbuse.retryAfterMs,
      });
    }
  }

  // Register the account as a claim candidate (deduped) so the first-confirm-wins
  // relink in /auth/confirm recognizes it. Read-modify-write the uuid[] array.
  const { data: row, error: readErr } = await admin
    .from("inquiries")
    .select("claim_candidate_user_ids, contact_email, contact_name, interpreted_query")
    .eq("id", owned.inquiry.id)
    .maybeSingle();
  if (readErr) {
    logServerError("guest-chat-actions.sendGuestClaimToEmail/readCandidates", readErr);
    return fail("engine_error", "Couldn't send the link. Please try again.");
  }

  // Provision (or match) a client account for this email. "unlinked" means the
  // email belongs to a privileged (staff/talent) account — there is no client
  // account to claim, so we refuse politely and never email a sign-in link there.
  const provisioned = await ensureGuestClientByEmail({
    email,
    name: ((row?.contact_name as string | null) ?? "").trim(),
    company: "",
    phone: "",
  });
  if (provisioned.status === "unlinked" || !provisioned.clientUserId) {
    return fail(
      "forbidden",
      "That email is already tied to a team account — try a personal email instead.",
    );
  }

  const existing = ((row?.claim_candidate_user_ids as string[] | null) ?? []).filter(Boolean);
  const normalizedNew = email.trim().toLowerCase();
  const normalizedOld = ((row?.contact_email as string | null) ?? "").trim().toLowerCase();
  const shouldReplacePrimary =
    Boolean(input.replacePrimary) && normalizedNew.length > 0 && normalizedNew !== normalizedOld;

  const candidatePatch: {
    claim_candidate_user_ids: string[];
    contact_email?: string;
    client_user_id?: string;
    interpreted_query?: Record<string, unknown>;
  } = {
    claim_candidate_user_ids: existing.includes(provisioned.clientUserId)
      ? existing
      : [...existing, provisioned.clientUserId],
  };

  if (shouldReplacePrimary) {
    candidatePatch.contact_email = normalizedNew;
    candidatePatch.client_user_id = provisioned.clientUserId;
    const iq = (row?.interpreted_query as Record<string, unknown> | null) ?? {};
    const requester = (iq.requester as Record<string, unknown> | null) ?? {};
    candidatePatch.interpreted_query = {
      ...iq,
      requester: { ...requester, email: normalizedNew },
    };
  }

  const candidatesChanged =
    candidatePatch.claim_candidate_user_ids.length !== existing.length || shouldReplacePrimary;
  if (candidatesChanged) {
    const { error: writeErr } = await admin
      .from("inquiries")
      .update(candidatePatch)
      .eq("id", owned.inquiry.id)
      .eq("guest_session_id", guestSessionId);
    if (writeErr) {
      logServerError("guest-chat-actions.sendGuestClaimToEmail/writeCandidates", writeErr);
      return fail("engine_error", "Couldn't send the link. Please try again.");
    }
  }

  // Talent display name for the email copy — best-effort, falls back to agency.
  let talentName = "";
  const { data: talentRow } = await admin
    .from("inquiry_participants")
    .select("talent_profile_id")
    .eq("inquiry_id", owned.inquiry.id)
    .eq("role", "talent")
    .not("talent_profile_id", "is", null)
    .limit(1)
    .maybeSingle();
  const talentProfileId = (talentRow?.talent_profile_id as string | null) ?? null;
  if (talentProfileId) {
    const { data: t } = await admin
      .from("talent_profiles")
      .select("display_name")
      .eq("id", talentProfileId)
      .maybeSingle();
    talentName = (t?.display_name as string | null)?.trim() || "";
  }
  if (!talentName) {
    talentName = (await loadAgencyName(admin, owned.inquiry.tenantId)) ?? "the team";
  }

  // Resolve the tenant slug for the post-auth destination + branded email.
  const { data: tenantRow } = await admin
    .from("agencies")
    .select("slug")
    .eq("id", owned.inquiry.tenantId)
    .maybeSingle();
  const tenantSlug = (tenantRow?.slug as string | null) ?? "";

  // Send the magic-link. Fail loudly when Resend didn't accept the message so
  // the UI never shows "check your inbox" for a mail that never left.
  const claimResult = await sendGuestClaimEmail({
    email,
    tenantSlug,
    talentName,
    appUrl: getAppUrl(),
    tenantId: owned.inquiry.tenantId,
  });
  if (!claimResult.ok) {
    logServerError(
      "guest-chat-actions.sendGuestClaimToEmail/claimEmail",
      new Error(`${claimResult.reason}${claimResult.detail ? `: ${claimResult.detail}` : ""}`),
    );
    return fail("engine_error", claimEmailFailureMessage(claimResult.reason));
  }

  return { ok: true, email };
}

// ═════════════════════════════════════════════════════════════════════════════
// 3c. getGuestThreadMessages
// ═════════════════════════════════════════════════════════════════════════════

export async function getGuestThreadMessages(
  input: GetGuestThreadInput,
): Promise<GetGuestThreadResult> {
  if (!input.inquiryId) {
    return fail("validation_failed", "Missing conversation.", { missingFields: ["inquiryId"] });
  }

  const guest = await resolveGuestContext();
  if (!guest.ok) return guest.failure;
  const { admin, guestSessionId } = guest.ctx;

  const owned = await loadOwnedInquiry(admin, input.inquiryId, guestSessionId);
  if (!owned.ok) return owned.failure;

  const messages = await readGuestVisibleMessages(
    admin,
    owned.inquiry,
    guestSessionId,
    input.afterIso ?? null,
  );

  // Lane E / P1: the honest "Typically replies …" presence fragment, scoped to
  // this inquiry's talent when resolvable (falls back to tenant-wide inside the
  // helper). Returns a bare fragment ("in ~2 hours") or null when there isn't
  // enough data — the panel prepends "Typically replies " and shows nothing on
  // null. Only computed on the FULL load (afterIso null) to avoid re-querying
  // the median on every incremental poll.
  let typicalReplyLabel: string | null = null;
  // Jon 360 Phase 2: the pinned SENT->RECEIVED receipt. Only on the full load
  // (afterIso null) and only once the inquiry is genuinely sent. Null otherwise.
  let receipt: InquiryReceiptData | null = null;
  if (!input.afterIso) {
    const { data: talentRow } = await admin
      .from("inquiry_participants")
      .select("talent_profile_id")
      .eq("inquiry_id", owned.inquiry.id)
      .eq("role", "talent")
      .not("talent_profile_id", "is", null)
      .limit(1)
      .maybeSingle();
    typicalReplyLabel = await getTypicalReplyLabel({
      tenantId: owned.inquiry.tenantId,
      talentProfileId: (talentRow?.talent_profile_id as string | null) ?? null,
    });
    if (isReceiptVisibleStatus(owned.inquiry.status)) {
      receipt = await buildInquiryReceipt({
        admin,
        inquiryId: owned.inquiry.id,
        tenantId: owned.inquiry.tenantId,
        status: owned.inquiry.status,
      });
    }
  }

  return {
    ok: true,
    messages,
    threadStatus: toThreadStatus(owned.inquiry.status),
    typicalReplyLabel,
    receipt,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// getActiveGuestInquiry — returning-guest resume (B1 fix).
//
// The launcher mount (a server component) calls this on /t/[code] load so a page
// refresh — or a fresh tab in the same session — REOPENS the guest's live thread
// instead of restarting a brand-new chat. Read-side only; the guest identity is
// the x-impronta-guest cookie (server-resolved), never a client argument, and
// only an inquiry the cookie OWNS (guest_session_id match) is ever returned.
// Cross-device / cleared-cookie recovery stays the emailed magic link.
//
// Scope: resume keys primarily on guest session + tenant. On a talent page the
// preference order is: newest live DRAFT whose lineup contains this talent >
// any live draft (returned with containsTalent:false so the chip-add flow can
// append the talent) > newest sent/live thread whose lineup contains the talent.
// The talent match reads interpreted_query.talent.selected_ids — NOT
// inquiry_participants: early drafts deliberately carry no participant rows
// (P0-1; see guest-draft-resume.ts). Returns { active: null } — NOT an error —
// when there's nothing to resume.
// ─────────────────────────────────────────────────────────────────────────────

export async function getActiveGuestInquiry(input: {
  tenantSlug: string;
  talentProfileId?: string | null;
}): Promise<GetActiveGuestInquiryResult> {
  try {
    const guest = await resolveGuestContext();
    // No cookie / no session row yet = first-time visitor. Any resolve failure
    // here means "nothing to resume", not an error to surface in the launcher.
    if (!guest.ok) return { ok: true, active: null };
    const { admin, guestSessionId } = guest.ctx;

    const tenantId = await resolveTenantIdBySlug(admin, input.tenantSlug);
    if (!tenantId) return { ok: true, active: null };

    const talentProfileId = input.talentProfileId?.trim() || null;

    // Candidate inquiries owned by this guest session on this tenant, newest
    // first. The filter on guest_session_id IS the ownership gate (mirrors
    // loadOwnedInquiry): even via service-role we only ever read this cookie's
    // own inquiries. Keep the set small — the guest funnel never makes many.
    const { data: rows, error } = await admin
      .from("inquiries")
      .select(
        "id, contact_name, contact_email, contact_phone, status, created_at, interpreted_query",
      )
      .eq("guest_session_id", guestSessionId)
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false })
      .limit(20);
    if (error) {
      logServerError("guest-chat-actions.getActiveGuestInquiry", error);
      return { ok: true, active: null };
    }
    if (!rows || rows.length === 0) return { ok: true, active: null };

    // Drop terminal threads — never resume into a dead conversation. Reuses
    // toThreadStatus' "closed" bucket + the cancelled status (see loadOwnedInquiry).
    const live = rows.filter((r) => {
      const s = r.status as string;
      return s !== "cancelled" && toThreadStatus(s) !== "closed";
    });
    if (live.length === 0) return { ok: true, active: null };

    // P0-1 fix — pick the resume target off the lineup spine
    // (interpreted_query.talent.selected_ids), NOT inquiry_participants: early
    // drafts deliberately carry no participant rows, so the old participants
    // gate could never find them and every panel open minted a duplicate. The
    // preference order (draft-with-talent > any draft > sent-with-talent) lives
    // in the pure, unit-tested picker.
    const picked = pickGuestResumeTarget(live, talentProfileId);
    if (!picked) return { ok: true, active: null };
    const chosen = picked.row;

    // W0 follow-up (found by the lifecycle E2E): report whether the resumed
    // row's contact is REAL. The panel's client state used to assume any
    // resumed id was already promoted, which erased the draft banner + the
    // "Send to agency" affordance on a reloaded draft — and the server send
    // gate (W0-D) would then refuse the send with no gate shown to fix it.
    // Seed placeholder values are also kept out of the gate prefill.
    const contactPromoted = !isSeedContact(
      chosen.contact_name as string | null,
      chosen.contact_email as string | null,
    );
    return {
      ok: true,
      active: {
        inquiryId: chosen.id as string,
        containsTalent: picked.containsTalent,
        contactPromoted,
        prefill: {
          name: contactPromoted ? (chosen.contact_name as string | null)?.trim() || null : null,
          email: contactPromoted ? (chosen.contact_email as string | null)?.trim() || null : null,
          phone: (chosen.contact_phone as string | null)?.trim() || null,
        },
      },
    };
  } catch (err) {
    logServerError("guest-chat-actions.getActiveGuestInquiry", err);
    return { ok: true, active: null };
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// 3e. ensureGuestChatInquiry — early-partial inquiry creation (§6.2 / P0-T5).
//
// The unified inquiry cart needs an `inquiryId` to attach structured chip edits
// to BEFORE the guest has finished (and before contact details are required).
// This action is the idempotent "create early" primitive: useUnifiedInquiry calls
// it lazily on the FIRST structured commit (first talent added OR first chip set),
// never on a bare panel open, so browsers that only peek never create a row.
//
// SECURITY: identical boundary to every other guest action. The guest identity
// is the x-impronta-guest cookie, resolved SERVER-SIDE; it is NEVER a client
// argument, and the row is written under guest_session_id ownership.
//
// IDEMPOTENCY (P0-1): if an owned, live DRAFT already exists for this guest +
// tenant, its id is returned instead of creating a duplicate — a session never
// holds more than one working draft per tenant. The talent match reads the
// lineup spine (interpreted_query.talent.selected_ids), NOT inquiry_participants
// (early drafts deliberately carry no participant rows); a draft that does not
// contain the requested talent is STILL returned (the chip-add flow appends the
// talent). Only drafts are ever the write target — a sent inquiry is never
// silently chosen (read-resume of sent threads is getActiveGuestInquiry's job).
//
// SCHEMA HONESTY: inquiries.contact_name / contact_email are NOT NULL, so a truly
// empty skeleton cannot be inserted. We seed clearly-synthetic placeholders that
// the deferred ContactCard overwrites (via the same patch path) once the guest
// supplies real contact details. This honors "create early" without a migration.
// It does NOT call createInquiryFromIntent (validation-gated) — it is a direct,
// ownership-guarded insert mirroring the legacy guest path.
// ═════════════════════════════════════════════════════════════════════════════

export async function ensureGuestChatInquiry(
  input: EnsureGuestInquiryInput,
): Promise<EnsureGuestInquiryResult> {
  try {
    const guest = await resolveGuestContext();
    if (!guest.ok) return guest.failure;
    const { admin, guestSessionId } = guest.ctx;

    const tenantId = await resolveTenantIdBySlug(admin, input.tenantSlug);
    if (!tenantId) {
      return fail("tenant_unavailable", "We couldn't find this workspace.");
    }

    const talentProfileId = input.talentProfileId?.trim() || null;

    // SECURITY (mirrors startGuestChatInquiry): the talent id is client-supplied
    // and the insert runs under the service-role client, so verify the talent is
    // on THIS tenant's publicly visible roster before seeding it into the row.
    // Talent-less "message the agency" partials (talentProfileId === null) have
    // nothing to gate.
    if (talentProfileId) {
      const rosterCheck = await assertAllTalentOnTenantRoster(admin, tenantId, [
        talentProfileId,
      ]);
      if (!rosterCheck.ok) {
        logServerError(
          "guest-chat-actions.ensureGuestChatInquiry/roster",
          new Error(`talent not on tenant roster: ${rosterCheck.missingIds.join(",")}`),
        );
        // See startGuestChatInquiry: the workspace is fine, the talent is not
        // bookable on this tenant.
        return fail(
          "talent_unavailable",
          "This talent is not taking inquiries here right now.",
        );
      }
    }

    // IDEMPOTENCY — reuse an existing owned, non-terminal inquiry for this guest
    // + tenant. The guest_session_id filter IS the ownership gate (mirrors
    // loadOwnedInquiry): even via service-role we only ever read this cookie's
    // own inquiries. Newest first; the funnel never makes many. We also read the
    // contact columns so the result can expose contactPromoted (real contact vs
    // the synthetic early-row seed) WITHOUT the client string-matching the
    // placeholder.
    const { data: existingRows, error: existingErr } = await admin
      .from("inquiries")
      .select("id, status, created_at, contact_name, contact_email, interpreted_query")
      .eq("guest_session_id", guestSessionId)
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false })
      .limit(20);
    if (existingErr) {
      logServerError("guest-chat-actions.ensureGuestChatInquiry/existing", existingErr);
      return fail("engine_error", "Couldn't start your inquiry. Please try again.");
    }

    const live = (existingRows ?? []).filter((r) => {
      const s = r.status as string;
      return s !== "cancelled" && toThreadStatus(s) !== "closed";
    });

    // P0-1 fix — reuse the newest live DRAFT (prefer one whose lineup spine
    // already contains this talent). NEVER insert while the session holds ANY
    // live draft for this tenant, and NEVER pick a sent row as the write
    // target. Selection logic is the pure, unit-tested picker.
    //
    // W0-B — the project-park's "start a SEPARATE inquiry" step passes
    // forceNew:true to bypass the reuse and always mint a distinct project row
    // (otherwise it would get the just-parked draft back and later chip writes
    // could overwrite the parked lineup). All other callers keep the reuse.
    const picked = pickGuestEnsureTargetOrForceNew(
      live,
      talentProfileId,
      input.forceNew === true,
    );
    if (picked) {
      return {
        ok: true,
        inquiryId: picked.row.id as string,
        contactPromoted: !isSeedContact(
          picked.row.contact_name as string | null,
          picked.row.contact_email as string | null,
        ),
      };
    }

    // No reusable partial — create the minimal early row. Placeholder contact
    // values satisfy the NOT NULL contract and are clearly synthetic, so the
    // deferred ContactCard step overwrites them once real details arrive. The
    // interpreted_query seed carries the schema version + provenance + (when
    // present) the pre-selected talent, so the very first chip patch has a base
    // to read-modify-write against.
    const interpretedSeed: Record<string, unknown> = {
      schema_version: 1,
      source: talentProfileId ? "public_talent_profile" : "agency_site",
      source_context: {
        ...(talentProfileId && input.talentProfileCode
          ? { public_profile_code: input.talentProfileCode }
          : {}),
        referrer_page: input.sourcePage,
        tenant_id: tenantId,
      },
      talent: talentProfileId
        ? { selected_ids: [talentProfileId], selection_mode: "i_know_who" }
        : { selected_ids: [], selection_mode: "agency_recommends" },
    };

    const { data: inserted, error: insertErr } = await admin
      .from("inquiries")
      .insert({
        tenant_id: tenantId,
        client_user_id: null,
        guest_session_id: guestSessionId,
        // Canonical pre-send DRAFT: lifecycle's `draft` phase (next_action_by =
        // 'client'). Promoted to 'submitted' + coordinator on the first real send
        // (promoteEarlyInquiryToSubmitted). Drafts stay OUT of every agency inbox.
        status: "draft",
        // Placeholder contact — NOT NULL columns. Overwritten by ContactCard.
        contact_name: "Guest",
        contact_email: `pending-${guestSessionId}@guest.impronta`,
        source_page: input.sourcePage,
        interpreted_query: interpretedSeed,
        // Behave like a new-engine inquiry so admin Messages + the realtime
        // surfaces render it as a live thread once details start arriving.
        uses_new_engine: true,
      })
      .select("id")
      .single();

    if (insertErr || !inserted) {
      logServerError(
        "guest-chat-actions.ensureGuestChatInquiry/insert",
        insertErr ?? new Error("insert returned no row"),
      );
      return fail("engine_error", "Couldn't start your inquiry. Please try again.");
    }

    // A freshly inserted early row always carries the synthetic seed contact.
    return { ok: true, inquiryId: inserted.id as string, contactPromoted: false };
  } catch (err) {
    logServerError("guest-chat-actions.ensureGuestChatInquiry", err);
    return fail("engine_error", "Couldn't start your inquiry. Please try again.");
  }
}
