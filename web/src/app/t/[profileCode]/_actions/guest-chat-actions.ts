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
import { createInquiryFromIntent } from "@/lib/inquiry/inquiry-intent-engine";
import type { InquiryIntent } from "@/lib/inquiry/inquiry-intent";
import { sendMessage } from "@/lib/inquiry/inquiry-engine-messages";
import {
  checkGuestInquiryAbuse,
  checkGuestMessageAbuse,
} from "@/lib/inquiry/guest-abuse-guard";
import { isBlocked } from "@/lib/inquiry/recipient-safety";
import { emitGuestAutoAck } from "@/lib/inquiry/guest-auto-ack";
import type {
  GetGuestThreadInput,
  GetGuestThreadResult,
  GuestChatErrorCode,
  GuestChatFailure,
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
// Client IP — the leftmost x-forwarded-for hop (the platform-proxied value on
// Vercel is reliable). Used as one dimension of the anti-abuse KV key. Returns
// null when unavailable (the guard then rate-limits on session+email+tenant).
// ─────────────────────────────────────────────────────────────────────────────

async function resolveClientIp(): Promise<string | null> {
  const h = await headers();
  const fwd = h.get("x-forwarded-for");
  if (fwd) {
    const first = fwd.split(",")[0]?.trim();
    if (first) return first;
  }
  return h.get("x-real-ip");
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
// NEVER returns private staff-internal thread rows.
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
    // GROUP thread only — the private thread is staff-internal and must never
    // reach a guest.
    .eq("thread_type", "group")
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
  if (!input.talentProfileId) {
    return fail("validation_failed", "Missing talent.", { missingFields: ["talent.selected_ids"] });
  }

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

  // ── Recipient safety (Lane C): refuse to create the inquiry when this sender
  // (guest session and/or the just-provisioned client user) is blocked by a
  // recipient in this tenant. Fail-open on infra error (see isBlocked docs).
  const block = await isBlocked(
    {
      tenantId,
      guestSessionId,
      clientUserId: provisioned.clientUserId,
    },
    admin,
  );
  if (block.blocked) {
    return fail("blocked", "This conversation can't be started right now.");
  }

  // Assemble the full InquiryIntent server-side. firstMessage → brief.summary
  // so validateIntentForSubmit passes (it requires brief.summary OR a selected
  // talent — here BOTH are satisfied), and the talent is pre-selected.
  const intent: InquiryIntent = {
    source: "public_talent_profile",
    source_context: {
      public_profile_code: input.talentProfileCode,
      referrer_page: input.sourcePage,
      tenant_id: tenantId,
    },
    requester: {
      name: contactName,
      email: contactEmail,
      phone: input.contactPhone?.trim() || undefined,
      trust_level: "basic",
    },
    talent: {
      selected_ids: [input.talentProfileId],
      selection_mode: "i_know_who",
    },
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

  // Append the first message as a GROUP-thread guest message so it shows in the
  // popup AND fires the talent/coordinator realtime + notification fanout. The
  // brief.summary above seeds the inquiry record; this is the visible bubble.
  const sent = await sendMessage(admin, {
    inquiryId,
    tenantId,
    actorUserId: null,
    guestSessionId,
    threadType: "group",
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
    talentProfileId: input.talentProfileId,
  });

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
  // by a recipient in the inquiry's tenant. Fail-open on infra error.
  const block = await isBlocked(
    {
      tenantId: owned.inquiry.tenantId,
      guestSessionId,
      clientUserId: owned.inquiry.clientUserId,
    },
    admin,
  );
  if (block.blocked) {
    return fail("blocked", "This conversation can't continue.");
  }

  const sent = await sendMessage(admin, {
    inquiryId: owned.inquiry.id,
    tenantId: owned.inquiry.tenantId,
    actorUserId: null,
    guestSessionId,
    threadType: "group",
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

  return {
    ok: true,
    messages,
    threadStatus: toThreadStatus(owned.inquiry.status),
    // Lane E / P1 owns the honest "typically replies in ~X" median. Null until
    // wired so the UI shows no dishonest presence claim.
    typicalReplyLabel: null,
  };
}
