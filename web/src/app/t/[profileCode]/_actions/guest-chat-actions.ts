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

import { headers } from "next/headers";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";
import { ensureGuestClientByEmail } from "@/lib/inquiry/guest-client";
import { evaluateGuestConversationGate } from "@/lib/inquiry/guest-trust-gate";
import { createInquiryFromIntent } from "@/lib/inquiry/inquiry-intent-engine";
import type { InquiryIntent } from "@/lib/inquiry/inquiry-intent";
import { captureGuestMessageDetails } from "@/lib/inquiry/guest-message-extract";
import { sendMessage } from "@/lib/inquiry/inquiry-engine-messages";
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
import { sendGuestClaimEmail } from "@/lib/inquiry/guest-claim-link";
import { getTypicalReplyLabel } from "@/lib/inquiry/guest-reply-latency";
import { getAppUrl } from "@/lib/auth-flow";
import type {
  AddGuestClaimEmailInput,
  AddGuestClaimEmailResult,
  GetActiveGuestInquiryResult,
  GetGuestThreadInput,
  GetGuestThreadResult,
  GuestChatErrorCode,
  GuestChatFailure,
  GuestIdentityTier,
  GuestMessageAuthorRole,
  GuestMessageKind,
  GuestThreadMessage,
  GuestThreadStatus,
  SendGuestMessageInput,
  SendGuestMessageResult,
  StartGuestChatInput,
  StartGuestChatResult,
} from "@/lib/inquiry/guest-chat-contract";

const GUEST_HEADER = "x-impronta-guest";
const MAX_BODY = 10_000;

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

// ─────────────────────────────────────────────────────────────────────────────
// Client IP — the TRUSTED hop. Vercel appends the real client IP to the RIGHT
// of x-forwarded-for at the edge, so the rightmost entry is the platform-set,
// non-spoofable value; the leftmost is attacker-controllable (a client can send
// its own x-forwarded-for). Using split(',')[0] would key the rate-limit on a
// value the abuser can rotate per request — defeating the IP dimension. Prefer
// x-real-ip (single value, also platform-set) and fall back to the rightmost
// x-forwarded-for hop. Returns null when unavailable.
// ─────────────────────────────────────────────────────────────────────────────

async function resolveClientIp(): Promise<string | null> {
  const h = await headers();
  // x-real-ip is set by Vercel to the true client IP (not a chain) — trust it.
  const real = h.get("x-real-ip")?.trim();
  if (real) return real;
  const fwd = h.get("x-forwarded-for");
  if (fwd) {
    const hops = fwd.split(",").map((s) => s.trim()).filter(Boolean);
    // Rightmost = the IP the platform appended (trusted); leftmost = spoofable.
    const trusted = hops[hops.length - 1];
    if (trusted) return trusted;
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Guest identity — resolve the guest_sessions.id from the cookie header.
// The session key is read SERVER-SIDE only; never accepted from the client.
// Returns { admin, guestSessionId } or a failure.
// ─────────────────────────────────────────────────────────────────────────────

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

  const guestKey = (await headers()).get(GUEST_HEADER);
  if (!guestKey) {
    return { ok: false, failure: fail("forbidden", "We couldn't identify your session. Please refresh and try again.") };
  }

  // Ensure the guest_sessions row exists (idempotent) and read its id. The
  // session key is the capability; the RPC is SECURITY DEFINER.
  await admin.rpc("ensure_guest_session", { p_session_key: guestKey });
  const { data: guestRow, error } = await admin
    .from("guest_sessions")
    .select("id")
    .eq("session_key", guestKey)
    .maybeSingle();

  if (error) {
    logServerError("guest-chat-actions.resolveGuestContext", error);
    return { ok: false, failure: fail("engine_error", "Could not start a session. Please try again.") };
  }
  const guestSessionId = (guestRow?.id as string | undefined) ?? null;
  if (!guestSessionId) {
    return { ok: false, failure: fail("forbidden", "We couldn't identify your session. Please refresh and try again.") };
  }

  return { ok: true, ctx: { admin, guestSessionId } };
}

/**
 * Public session-id-only resolver so sibling guest server actions (U2 thread
 * switcher, U4 detail chips) reuse the SAME cookie→guest_sessions.id path
 * without copy-pasting it. Returns the guest_sessions.id, or null when there is
 * no usable session (first-time visitor / missing header / db unavailable).
 */
export async function resolveGuestSessionId(): Promise<string | null> {
  const guest = await resolveGuestContext();
  return guest.ok ? guest.ctx.guestSessionId : null;
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

  for (const p of participants) {
    const userId = p.user_id as string | null;
    if (!userId) continue;
    const role = p.role as "client" | "coordinator" | "talent";
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
      "id, inquiry_id, sender_user_id, guest_session_id, body, message_kind, card_payload, created_at, edited_at, deleted_at, reply_to_message_id, thread_type",
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

  return (data ?? []).map((raw) => {
    const row = raw as unknown as RawMessageRow;
    const role = deriveAuthorRole(row, guestSessionId, identityByUserId);
    return toGuestThreadMessage(row, role, identityByUserId);
  });
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

  const contactName = input.contactName?.trim() ?? "";
  const contactEmail = input.contactEmail?.trim() ?? "";
  const firstMessage = input.firstMessage?.trim() ?? "";

  const missing: string[] = [];
  if (!contactName) missing.push("requester.name");
  if (!contactEmail) missing.push("requester.email");
  if (!firstMessage) missing.push("brief.summary");
  if (missing.length > 0) {
    return fail("validation_failed", "Add your name, email, and a message to start.", {
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

  const created = await createInquiryFromIntent(admin, intent, {
    tenant_id: tenantId,
    actor_user_id: null,
    client_user_id: provisioned.clientUserId,
    guest_session_id: guestSessionId,
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
  const emittedAutoAck = await emitGuestAutoAck({
    inquiryId,
    tenantId,
    talentProfileId,
  });

  // GUEST → CLIENT CLAIM (best-effort, non-blocking): email the guest a
  // magic-link so they can sign in (passwordless, proves email ownership now
  // that confirmations are ON) and continue THIS conversation from the client
  // Messages surface. Only when a real client account was provisioned/matched —
  // an "unlinked" guest (the email belongs to staff/talent) has no account to
  // claim, so we never email a sign-in link there. sendGuestClaimEmail swallows
  // all failures (the inquiry is already created); we await it but the function
  // contract is void/never-throws.
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

    await sendGuestClaimEmail({
      email: contactEmail,
      tenantSlug: input.tenantSlug,
      talentName,
      appUrl: getAppUrl(),
      tenantId,
    });
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

  // Provision (or match) a client account for this email. "unlinked" means the
  // email belongs to a privileged (staff/talent) account — there is no client
  // account to claim, so we refuse politely and never email a sign-in link there.
  const provisioned = await ensureGuestClientByEmail({
    email,
    name: "",
    company: "",
    phone: "",
  });
  if (provisioned.status === "unlinked" || !provisioned.clientUserId) {
    return fail(
      "forbidden",
      "That email is already tied to a team account — try a personal email instead.",
    );
  }

  // Register the account as a claim candidate (deduped) so the first-confirm-wins
  // relink in /auth/confirm recognizes it. Read-modify-write the uuid[] array.
  const { data: row, error: readErr } = await admin
    .from("inquiries")
    .select("claim_candidate_user_ids")
    .eq("id", owned.inquiry.id)
    .maybeSingle();
  if (readErr) {
    logServerError("guest-chat-actions.sendGuestClaimToEmail/readCandidates", readErr);
    return fail("engine_error", "Couldn't send the link. Please try again.");
  }
  const existing = ((row?.claim_candidate_user_ids as string[] | null) ?? []).filter(Boolean);
  if (!existing.includes(provisioned.clientUserId)) {
    const next = [...existing, provisioned.clientUserId];
    const { error: writeErr } = await admin
      .from("inquiries")
      .update({ claim_candidate_user_ids: next })
      .eq("id", owned.inquiry.id);
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

  // Send the magic-link. Reuses the existing module (swallows all failures).
  await sendGuestClaimEmail({
    email,
    tenantSlug,
    talentName,
    appUrl: getAppUrl(),
    tenantId: owned.inquiry.tenantId,
  });

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
  }

  return {
    ok: true,
    messages,
    threadStatus: toThreadStatus(owned.inquiry.status),
    typicalReplyLabel,
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
// Scope: the newest NON-terminal inquiry owned by this guest session on this
// tenant where THIS talent participates (so a guest who messaged several talents
// reopens the conversation for the page they're on). Returns { active: null } —
// NOT an error — when there's nothing to resume.
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
      .select("id, contact_name, contact_email, contact_phone, status, created_at")
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

    let chosen = live[0];
    // On a specific talent's page, prefer the newest live thread where THIS
    // talent participates, so we never reopen a different talent's conversation
    // here. No match ⇒ fresh start for this talent (the other thread is still
    // recoverable via the switcher / magic link).
    if (talentProfileId) {
      const ids = live.map((r) => r.id as string);
      const { data: parts } = await admin
        .from("inquiry_participants")
        .select("inquiry_id")
        .in("inquiry_id", ids)
        .eq("talent_profile_id", talentProfileId);
      const withTalent = new Set((parts ?? []).map((p) => p.inquiry_id as string));
      const match = live.find((r) => withTalent.has(r.id as string));
      if (!match) return { ok: true, active: null };
      chosen = match;
    }

    return {
      ok: true,
      active: {
        inquiryId: chosen.id as string,
        prefill: {
          name: (chosen.contact_name as string | null)?.trim() || null,
          email: (chosen.contact_email as string | null)?.trim() || null,
          phone: (chosen.contact_phone as string | null)?.trim() || null,
        },
      },
    };
  } catch (err) {
    logServerError("guest-chat-actions.getActiveGuestInquiry", err);
    return { ok: true, active: null };
  }
}
