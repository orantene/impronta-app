"use server";

/**
 * guest-conversation-scan-action.ts — W2-I: the AI conversation scan.
 *
 * `scanGuestConversationForDetails(inquiryId)` reads the recent guest chat, runs
 * the cheap Haiku extractor over it, and auto-fills the inquiry's EMPTY detail
 * fields with AI-suggested values. It is the server half of "AI reads the chat
 * and auto-fills the sections" (owner's Addendum B). The UI lane wires it to a
 * "Scan conversation" button; a future auto path can call it after a guest
 * message lands (behind the same guards).
 *
 * Reuses, does not rebuild:
 *   • captureGuestMessageDetails (guest-message-extract.ts) — the AI extractor,
 *     which owns ALL the gate plumbing (AI master/usage toggles, 6s timeout,
 *     fail-open-to-empty, spend recording). We pass the pinned Haiku model.
 *   • captureGuestChip (guest-detail-chips-actions.ts) — the UNIFIED write path;
 *     every fill goes through it, so a fill lands exactly like a user chip
 *     (interpreted_query + flat columns + coordinator/client notes). It re-proves
 *     ownership + draft status per call, so a frozen inquiry refuses gracefully.
 *   • conversationWorthScanning (guest-conversation-prefilter.ts) — the cheap
 *     regex gate that skips the paid model call on chit-chat.
 *   • planScanFills (guest-conversation-scan-merge.ts) — the EMPTY-ONLY merge:
 *     only fields that are empty AND for which the model found a value get a
 *     fill, so a user-set value is never overwritten.
 *
 * Security model mirrors the other guest actions: guest session resolved
 * server-side from the x-impronta-guest cookie; ownership proven by
 * guest_session_id match. Best-effort — never throws; any failure yields
 * "nothing filled".
 */

import { headers } from "next/headers";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";
import { tenantScopedQuery } from "@/lib/supabase/tenant-scoped-query";
import { isGuestChipWritableStatus } from "@/lib/inquiry/guest-chip-write-policy";
import { captureGuestMessageDetails } from "@/lib/inquiry/guest-message-extract";
import { conversationWorthScanning } from "@/lib/inquiry/guest-conversation-prefilter";
import { planScanFills } from "@/lib/inquiry/guest-conversation-scan-merge";
import { captureGuestChip } from "@/app/t/[profileCode]/_actions/guest-detail-chips-actions";
import type {
  GuestChatErrorCode,
  GuestChatFailure,
  GuestChipKind,
  ScanGuestConversationResult,
} from "@/lib/inquiry/guest-chat-contract";
import type { SupabaseClient } from "@supabase/supabase-js";

const GUEST_HEADER = "x-impronta-guest";

/**
 * The model the scan pins. Haiku 4.5 is the cheap tier ($1/$5 per MTok) chosen
 * for this high-volume, best-effort auto-fill. Threaded per-call into the shared
 * extractor so it never repurposes the global chat default other features use.
 */
const SCAN_MODEL = "claude-haiku-4-5";
/** How many recent guest messages the scan feeds the model. */
const SCAN_MESSAGE_LIMIT = 8;
/** Hard cap on the combined chat text handed to the extractor (cost guard). */
const SCAN_MAX_CHARS = 4000;

/** interpreted_query sub-object each filled kind lives on (for the source stamp). */
const KIND_QUERY_KEY: Record<string, string> = {
  date: "date",
  location: "location",
  headcount: "talent",
  event_type: "source_context",
  budget: "budget",
};

function fail(code: GuestChatErrorCode, message: string): GuestChatFailure {
  return { ok: false, code, message };
}

/** Resolve guest_sessions.id from the x-impronta-guest cookie (server-side only). */
async function resolveGuestSession(): Promise<
  | { ok: true; admin: SupabaseClient; guestSessionId: string }
  | { ok: false; failure: GuestChatFailure }
> {
  const admin = createServiceRoleClient();
  if (!admin) {
    return { ok: false, failure: fail("db_unavailable", "Messaging is temporarily unavailable.") };
  }
  const guestKey = (await headers()).get(GUEST_HEADER);
  if (!guestKey) {
    return {
      ok: false,
      failure: fail("forbidden", "We couldn't identify your session. Please refresh and try again."),
    };
  }
  await admin.rpc("ensure_guest_session", { p_session_key: guestKey });
  const { data: guestRow, error } = await admin
    .from("guest_sessions")
    .select("id")
    .eq("session_key", guestKey)
    .maybeSingle();
  if (error) {
    logServerError("guest-conversation-scan-action.resolveGuestSession", error);
    return { ok: false, failure: fail("engine_error", "Could not start a session. Please try again.") };
  }
  const guestSessionId = (guestRow?.id as string | undefined) ?? null;
  if (!guestSessionId) {
    return {
      ok: false,
      failure: fail("forbidden", "We couldn't identify your session. Please refresh and try again."),
    };
  }
  return { ok: true, admin, guestSessionId };
}

type OwnedInquiry = {
  id: string;
  tenantId: string;
  status: string;
  interpretedQuery: Record<string, unknown> | null;
};

/** Load the inquiry IFF it belongs to this guest session (ownership gate). */
async function loadOwnedInquiry(
  admin: SupabaseClient,
  inquiryId: string,
  guestSessionId: string,
): Promise<{ ok: true; inquiry: OwnedInquiry } | { ok: false; failure: GuestChatFailure }> {
  const { data, error } = await admin
    .from("inquiries")
    .select("id, tenant_id, status, guest_session_id, interpreted_query")
    .eq("id", inquiryId)
    .maybeSingle();
  if (error) {
    logServerError("guest-conversation-scan-action.loadOwnedInquiry", error);
    return { ok: false, failure: fail("engine_error", "Could not load the conversation.") };
  }
  if (!data) {
    return { ok: false, failure: fail("not_found", "This conversation no longer exists.") };
  }
  if ((data.guest_session_id as string | null) !== guestSessionId) {
    return { ok: false, failure: fail("forbidden", "You don't have access to this conversation.") };
  }
  return {
    ok: true,
    inquiry: {
      id: data.id as string,
      tenantId: data.tenant_id as string,
      status: data.status as string,
      interpretedQuery: (data.interpreted_query as Record<string, unknown> | null) ?? null,
    },
  };
}

/** Load the recent guest-authored text messages for an inquiry, oldest→newest. */
async function loadRecentGuestMessages(
  admin: SupabaseClient,
  inquiry: OwnedInquiry,
  guestSessionId: string,
): Promise<string[]> {
  const { data, error } = await admin
    .from("inquiry_messages")
    .select("body, created_at")
    .eq("inquiry_id", inquiry.id)
    .eq("tenant_id", inquiry.tenantId)
    // The guest IS the client; their own words live on the PRIVATE thread with
    // their guest_session_id stamped. This reads only what the guest typed, not
    // the coordinator's replies — the signal we want to extract from.
    .eq("thread_type", "private")
    .eq("guest_session_id", guestSessionId)
    .eq("message_kind", "text")
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(SCAN_MESSAGE_LIMIT);
  if (error) {
    logServerError("guest-conversation-scan-action.loadRecentGuestMessages", error);
    return [];
  }
  return (data ?? [])
    .reverse() // back to chronological
    .map((r) => (typeof r.body === "string" ? r.body.trim() : ""))
    .filter((b) => b.length > 0);
}

/**
 * Best-effort provenance stamp: mark each filled sub-object as AI-suggested
 * (interpreted_query.<field>.source = "ai_suggested") so the UI + downstream
 * readers can tell a suggestion from a user confirmation. Runs AFTER the fills
 * land, reads the post-fill query, and writes once via the tenant-scoped path.
 * A failure here never fails the scan — the values are already written.
 */
async function stampSuggestedSource(
  admin: SupabaseClient,
  inquiry: OwnedInquiry,
  filledKinds: GuestChipKind[],
): Promise<void> {
  try {
    const { data, error } = await admin
      .from("inquiries")
      .select("interpreted_query")
      .eq("id", inquiry.id)
      .eq("tenant_id", inquiry.tenantId)
      .maybeSingle();
    if (error || !data) return;
    const query = (data.interpreted_query as Record<string, unknown> | null) ?? null;
    if (!query) return;

    let changed = false;
    for (const kind of filledKinds) {
      const key = KIND_QUERY_KEY[kind];
      if (!key) continue;
      const sub = query[key];
      if (sub && typeof sub === "object" && !Array.isArray(sub)) {
        (sub as Record<string, unknown>).source = "ai_suggested";
        changed = true;
      }
    }
    if (!changed) return;

    const { error: writeErr } = await tenantScopedQuery(admin, "inquiries", inquiry.tenantId)
      .update({ interpreted_query: query })
      .eq("id", inquiry.id);
    if (writeErr) {
      logServerError("guest-conversation-scan-action.stampSuggestedSource/write", writeErr);
    }
  } catch (err) {
    logServerError("guest-conversation-scan-action.stampSuggestedSource", err);
  }
}

/**
 * scanGuestConversationForDetails — see file header. Gates: guest-session +
 * ownership; DRAFT-only (a frozen inquiry short-circuits with scanned:false);
 * cheap PRE-FILTER before any model call; EMPTY-ONLY fills; best-effort.
 */
export async function scanGuestConversationForDetails(input: {
  inquiryId: string;
}): Promise<ScanGuestConversationResult> {
  try {
    if (!input.inquiryId?.trim()) {
      return fail("validation_failed", "Missing conversation.");
    }

    const guestCtx = await resolveGuestSession();
    if (!guestCtx.ok) return guestCtx.failure;
    const { admin, guestSessionId } = guestCtx;

    const owned = await loadOwnedInquiry(admin, input.inquiryId, guestSessionId);
    if (!owned.ok) return owned.failure;
    const { inquiry } = owned;

    // FREEZE ON SEND: only a private DRAFT may be auto-filled. A sent/live
    // inquiry short-circuits (writes nothing) rather than returning a failure —
    // the button simply has nothing to do.
    if (!isGuestChipWritableStatus(inquiry.status)) {
      return { ok: true, scanned: false, filledKinds: [] };
    }

    const messages = await loadRecentGuestMessages(admin, inquiry, guestSessionId);
    if (messages.length === 0) {
      return { ok: true, scanned: false, filledKinds: [] };
    }

    // Cheap PRE-FILTER: skip the paid model call when nothing looks scannable.
    if (!conversationWorthScanning(messages)) {
      return { ok: true, scanned: false, filledKinds: [] };
    }

    // Combine (keep the most recent chars) and extract with the pinned Haiku
    // model. captureGuestMessageDetails owns the AI gates + timeout + fail-open;
    // an empty capture just yields an empty plan below.
    const combined = messages.join("\n").slice(-SCAN_MAX_CHARS);
    const capture = await captureGuestMessageDetails(combined, inquiry.tenantId, {
      model: SCAN_MODEL,
    });

    // EMPTY-ONLY plan against the CURRENT interpreted_query.
    const fills = planScanFills(inquiry.interpretedQuery, capture);
    if (fills.length === 0) {
      return { ok: true, scanned: true, filledKinds: [] };
    }

    // Write each fill through the SAME unified path guest chips use.
    // captureGuestChip re-proves ownership + draft status per call and is
    // best-effort; a per-chip refusal is skipped, not fatal.
    const filledKinds: GuestChipKind[] = [];
    for (const fill of fills) {
      const res = await captureGuestChip({
        inquiryId: inquiry.id,
        kind: fill.kind,
        value: fill.value,
      });
      if (res.ok) filledKinds.push(fill.kind);
    }

    if (filledKinds.length > 0) {
      await stampSuggestedSource(admin, inquiry, filledKinds);
    }

    return { ok: true, scanned: true, filledKinds };
  } catch (err) {
    logServerError("guest-conversation-scan-action.scanGuestConversationForDetails", err);
    return fail("engine_error", "Couldn't scan the conversation.");
  }
}
