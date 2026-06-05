"use server";

/**
 * guest-detail-chips-actions.ts — U4 Lane: deterministic guided chips for the
 * talent-profile conversational-inquiry popup.
 *
 * Each chip (Date / Location / Headcount / Type / Budget) maps 1:1 to a field
 * on inquiries.interpreted_query and/or a flat inquiry column. When the guest
 * confirms a chip value this action:
 *   1. Resolves + verifies the guest session (cookie-side only — same pattern as
 *      the other guest actions in guest-chat-actions.ts).
 *   2. Proves ownership of the inquiry (inquiries.guest_session_id matches).
 *   3. READ-MODIFY-WRITEs inquiries.interpreted_query, merging the chip payload
 *      into the same nested shape buildInterpretedQuery() produces in
 *      inquiry-intent.ts (location / date / talent / budget sub-objects).
 *   4. Also updates the relevant FLAT column(s) so the Details loader
 *      (client-inquiry-details.ts) picks them up without extra parsing:
 *        date       → interpreted_query.date  + flat event_date (YYYY-MM-DD)
 *        location   → interpreted_query.location  + flat event_location
 *        headcount  → interpreted_query.talent.count_needed  + flat quantity
 *        event_type → interpreted_query.source_context.ai_event_type
 *        budget     → interpreted_query.budget
 *   5. Optionally appends a system_event group-thread bubble so the coordinator
 *      sees the new detail in-thread ("Added: 40 guests").
 *
 * HARD RULES enforced structurally:
 *   • NEVER calls engine_send_offer / createOffer. Chips write the structured
 *     spine only; creating an offer remains coordinator-driven.
 *   • All writes go through tenantScopedQuery (NO raw .from() in server actions
 *     — the lint ratchet forbids it).
 *   • Best-effort + NEVER throws. On any failure return a GuestChatFailure.
 *
 * Integration note (WIRING):
 *   The integration agent must add the following to guest-chat-contract.ts:
 *     export type GuestChipKind = "date"|"location"|"headcount"|"event_type"|"budget";
 *     export type GuestChipValue = { ... }; (see local copy below)
 *     export type GuestChipInput = { inquiryId: string; kind: GuestChipKind; value: GuestChipValue };
 *     export type GuestChipResult = { ok: true; appliedSummary: string } | GuestChatFailure;
 *     export type CaptureGuestChipCallback = (input: GuestChipInput) => Promise<GuestChipResult>;
 *   Until then the types are local to this file (they compile standalone).
 *
 * NO migration required — interpreted_query (jsonb) + flat columns
 * (event_date, event_location, quantity) already exist on inquiries.
 */

import { headers } from "next/headers";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";
import { tenantScopedQuery } from "@/lib/supabase/tenant-scoped-query";
import type {
  GuestChatErrorCode,
  GuestChatFailure,
  GuestChipInput,
  GuestChipKind,
  GuestChipResult,
  GuestChipValue,
} from "@/lib/inquiry/guest-chat-contract";
import type { SupabaseClient } from "@supabase/supabase-js";

// Chip types are the canonical ones from the shared contract (consolidated at
// integration). Re-export the local bindings for any caller that still imports
// them from here.
export type { GuestChipKind, GuestChipValue, GuestChipInput, GuestChipResult };

// ─────────────────────────────────────────────────────────────────────────────
// Internal helpers — mirrors the pattern in guest-chat-actions.ts so this file
// is self-contained and compile-standalone without importing private helpers.
// ─────────────────────────────────────────────────────────────────────────────

const GUEST_HEADER = "x-impronta-guest";

function fail(
  code: GuestChatErrorCode,
  message: string,
  extra?: { retryAfterMs?: number; missingFields?: string[] },
): GuestChatFailure {
  return { ok: false, code, message, ...extra };
}

/** Resolve guest_sessions.id from the x-impronta-guest cookie (server-side only). */
async function resolveGuestSessionId(): Promise<
  { ok: true; admin: SupabaseClient; guestSessionId: string } | { ok: false; failure: GuestChatFailure }
> {
  const admin = createServiceRoleClient();
  if (!admin) {
    return {
      ok: false,
      failure: fail("db_unavailable", "Messaging is temporarily unavailable."),
    };
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
    logServerError("guest-detail-chips-actions.resolveGuestSessionId", error);
    return {
      ok: false,
      failure: fail("engine_error", "Could not start a session. Please try again."),
    };
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
    logServerError("guest-detail-chips-actions.loadOwnedInquiry", error);
    return { ok: false, failure: fail("engine_error", "Could not load the conversation.") };
  }
  if (!data) {
    return { ok: false, failure: fail("not_found", "This conversation no longer exists.") };
  }

  // THE OWNERSHIP CHECK — same guarantee as the other guest actions.
  if ((data.guest_session_id as string | null) !== guestSessionId) {
    return {
      ok: false,
      failure: fail("forbidden", "You don't have access to this conversation."),
    };
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

// ─────────────────────────────────────────────────────────────────────────────
// Chip → flat column helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Format a city + locationStatus into the same string that
 * formatEventLocation() in inquiry-intent.ts produces (venue·city).
 * We keep it simple here: just the city for MVP chip-level granularity;
 * the InquiryDrawer handles the full venue/address format.
 */
function formatChipLocation(city: string | null | undefined, status: string | undefined): string | null {
  const trimmedCity = city?.trim() ?? null;
  if (!trimmedCity) {
    if (status === "online") return "Online";
    return null;
  }
  return trimmedCity;
}

/**
 * Merges a chip's payload into the existing interpreted_query JSON (read from
 * the DB row) and returns:
 *   1. The merged interpreted_query to write back.
 *   2. A flat column update object (may be empty when no flat column applies).
 *   3. A human-readable appliedSummary for the thread bubble + chip label.
 */
function mergeChipIntoQuery(
  existing: Record<string, unknown> | null,
  input: GuestChipInput,
): {
  mergedQuery: Record<string, unknown>;
  flatColumns: Record<string, unknown>;
  appliedSummary: string;
} {
  const base: Record<string, unknown> = existing
    ? { ...(existing as Record<string, unknown>) }
    : { schema_version: 1 };
  const { kind, value } = input;

  const flatColumns: Record<string, unknown> = {};
  let appliedSummary = "";

  if (kind === "date") {
    const prevDate = (base.date as Record<string, unknown> | undefined) ?? {};
    const dateStatus = value.dateStatus ?? "not_sure";
    const eventDate = value.eventDate ?? null;
    base.date = {
      ...prevDate,
      status: dateStatus,
      ...(eventDate ? { event_date: eventDate } : {}),
    };
    if (eventDate) {
      flatColumns.event_date = eventDate;
      // Format as "Apr 12" for the summary. Fallback to raw string on parse error.
      try {
        appliedSummary = new Date(eventDate + "T00:00:00").toLocaleDateString(undefined, {
          month: "short",
          day: "numeric",
        });
      } catch {
        appliedSummary = eventDate;
      }
    } else {
      appliedSummary =
        dateStatus === "flexible"
          ? "Flexible date"
          : dateStatus === "not_sure"
            ? "Date not sure yet"
            : "Date TBD";
    }
  } else if (kind === "location") {
    const prevLoc = (base.location as Record<string, unknown> | undefined) ?? {};
    const locationStatus = value.locationStatus ?? "not_sure";
    const city = value.city?.trim() || null;
    base.location = {
      ...prevLoc,
      status: locationStatus,
      ...(city ? { city } : {}),
    };
    const formatted = formatChipLocation(city, locationStatus);
    if (formatted) {
      flatColumns.event_location = formatted;
    }
    appliedSummary = formatted ?? (locationStatus === "online" ? "Online" : "Location TBD");
  } else if (kind === "headcount") {
    const prevTalent = (base.talent as Record<string, unknown> | undefined) ?? {};
    const count = value.headcount ?? null;
    base.talent = {
      ...prevTalent,
      ...(count !== null ? { count_needed: count } : {}),
    };
    if (count !== null) {
      flatColumns.quantity = count;
      appliedSummary = `${count} ${count === 1 ? "guest" : "guests"}`;
    } else {
      appliedSummary = "Headcount TBD";
    }
  } else if (kind === "event_type") {
    const prevCtx = (base.source_context as Record<string, unknown> | undefined) ?? {};
    const eventType = value.eventType?.trim() || null;
    base.source_context = {
      ...prevCtx,
      ...(eventType ? { ai_event_type: eventType } : {}),
    };
    appliedSummary = eventType ?? "Event type TBD";
  } else if (kind === "budget") {
    const prevBudget = (base.budget as Record<string, unknown> | undefined) ?? {};
    const preference = value.budgetPreference ?? "not_sure";
    const amount = value.budgetAmount ?? null;
    const currency = value.currency?.trim().toUpperCase() || null;
    base.budget = {
      ...prevBudget,
      preference,
      ...(amount !== null ? { amount } : {}),
      ...(currency ? { currency } : {}),
    };
    if (amount !== null && currency) {
      appliedSummary = `${currency} ${amount.toLocaleString()}`;
    } else if (preference !== "not_sure" && preference !== "agency_recommends") {
      appliedSummary = `Budget: ${preference.replace(/_/g, " ")}`;
    } else {
      appliedSummary = "Budget TBD";
    }
  }

  return { mergedQuery: base, flatColumns, appliedSummary };
}

// ─────────────────────────────────────────────────────────────────────────────
// Exported server action
// ─────────────────────────────────────────────────────────────────────────────

/**
 * captureGuestChip — write a single deterministic chip value into the structured
 * inquiry spine (interpreted_query JSON + relevant flat column(s)).
 *
 * Security model:
 *   • Guest session resolved from the x-impronta-guest cookie (server-side
 *     only — never accepted from the client).
 *   • Ownership of the inquiry proven by guest_session_id match.
 *   • All writes go through tenantScopedQuery (no raw .from() in server actions).
 *   • NEVER calls createOffer or engine_send_offer. Chips are data-only.
 *   • Best-effort — never throws; returns GuestChatFailure on any error.
 */
export async function captureGuestChip(input: GuestChipInput): Promise<GuestChipResult> {
  try {
    // Input validation
    if (!input.inquiryId?.trim()) {
      return fail("validation_failed", "Missing conversation.", {
        missingFields: ["inquiryId"],
      });
    }
    if (!input.kind) {
      return fail("validation_failed", "Missing chip kind.", {
        missingFields: ["kind"],
      });
    }

    // Resolve guest session (cookie-only identity)
    const guestCtx = await resolveGuestSessionId();
    if (!guestCtx.ok) return guestCtx.failure;
    const { admin, guestSessionId } = guestCtx;

    // Ownership gate — same as other guest actions
    const owned = await loadOwnedInquiry(admin, input.inquiryId, guestSessionId);
    if (!owned.ok) return owned.failure;
    const { inquiry } = owned;

    // Merge chip payload into interpreted_query
    const { mergedQuery, flatColumns, appliedSummary } = mergeChipIntoQuery(
      inquiry.interpretedQuery,
      input,
    );

    // Write back via tenantScopedQuery (lint ratchet: no raw .from() allowed)
    const updatePayload: Record<string, unknown> = {
      interpreted_query: mergedQuery,
      ...flatColumns,
    };

    const { error: writeErr } = await tenantScopedQuery(admin, "inquiries", inquiry.tenantId)
      .update(updatePayload)
      .eq("id", inquiry.id);

    if (writeErr) {
      logServerError("guest-detail-chips-actions.captureGuestChip/write", writeErr);
      return fail("engine_error", "Couldn't save that detail. Please try again.");
    }

    // Optionally append a group-thread system_event bubble so the coordinator
    // sees the detail update in-thread ("Added: 40 guests"). We insert directly
    // (bypassing sendMessage / validateActorPermission) because this is a
    // platform-generated system event, not a user message — it has no sender
    // (sender_user_id: null, guest_session_id: null) so deriveAuthorRole()
    // renders it as a "system" bubble (centered/neutral). Best-effort — failure
    // here is non-fatal; the chip data is already written.
    try {
      const bubbleBody = `Added: ${appliedSummary}`;
      await tenantScopedQuery(admin, "inquiry_messages", inquiry.tenantId)
        .insert({
          inquiry_id: inquiry.id,
          thread_type: "group",
          sender_user_id: null,
          guest_session_id: null,
          body: bubbleBody,
          message_kind: "system_event",
          metadata: { chip_kind: input.kind },
        });
    } catch (bubbleErr) {
      // Non-fatal. The chip data is already written.
      logServerError("guest-detail-chips-actions.captureGuestChip/bubble", bubbleErr);
    }

    return { ok: true, appliedSummary };
  } catch (err) {
    logServerError("guest-detail-chips-actions.captureGuestChip", err);
    return fail("engine_error", "Couldn't save that detail. Please try again.");
  }
}
