"use server";

/**
 * guest-detail-chips-actions.ts — U4 Lane: deterministic guided chips for the
 * talent-profile conversational-inquiry popup.
 *
 * Each chip (Date / Location / Headcount / Type / Budget / Talent / Brief) maps
 * 1:1 to a field on inquiries.interpreted_query and/or a flat inquiry column.
 * When the guest confirms a chip value this action:
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
 *        talent     → interpreted_query.talent.selected_ids + selection_mode
 *                     (no flat column — talent links materialize at full submit)
 *        brief      → interpreted_query.brief.summary + flat message + raw_ai_query
 *        contact    → interpreted_query.requester.{name,email,phone} + flat
 *                     contact_name/contact_email/contact_phone (promotes the
 *                     early-partial placeholder contact to the real values)
 *   5. Appends a system_event group-thread bubble so the coordinator sees the
 *      new detail in-thread ("Added: 40 guests") AND emits the canonical
 *      inquiry_details_updated engine event with a PRIVATE-thread system note
 *      (§6.1 / B.7) so the guest panel, admin Messages, the client dashboard and
 *      the talent workspace all reconcile live via use-inquiry-realtime.
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
import { ENGINE_EVENT_TYPES, emitStandardEngineEvent } from "@/lib/inquiry/inquiry-events";
import type {
  GetGuestInquiryDetailsResult,
  GuestChatErrorCode,
  GuestChatFailure,
  GuestChipInput,
  GuestChipKind,
  GuestChipResult,
  GuestChipValue,
  GuestInquiryDetailValues,
} from "@/lib/inquiry/guest-chat-contract";
import type { SupabaseClient } from "@supabase/supabase-js";

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
    const rawCount = value.headcount ?? null;
    // Server-side bounds: clamp to a sane integer range mirroring the client UI.
    const count =
      rawCount !== null && Number.isFinite(rawCount)
        ? Math.floor(Math.max(1, Math.min(9999, rawCount)))
        : null;
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
    // Server-side bounds: reject non-finite / negative budget amounts.
    // A budget of 0 is treated as "not provided" (null). No upper cap is imposed
    // (luxury budgets can be large), but NaN/Infinity/-1 are all rejected.
    const rawAmount = value.budgetAmount ?? null;
    const amount =
      rawAmount !== null && Number.isFinite(rawAmount) && rawAmount > 0
        ? rawAmount
        : null;
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
  } else if (kind === "talent") {
    // Talent selection — replace semantics on interpreted_query.talent.selected_ids
    // plus the selection mode. No dedicated flat column; talent links are
    // materialized at full submit, not by a guest chip. We merge into the SAME
    // talent sub-object headcount writes into so count_needed is preserved.
    const prevTalent = (base.talent as Record<string, unknown> | undefined) ?? {};
    const rawIds = Array.isArray(value.selectedIds) ? value.selectedIds : [];
    // Normalize to a clean, deduped string[] — never trust raw client input.
    const selectedIds = Array.from(
      new Set(
        rawIds
          .map((id) => (typeof id === "string" ? id.trim() : ""))
          .filter((id) => id.length > 0),
      ),
    );
    // selection_mode: explicit value wins; otherwise infer from whether any
    // talent is selected (i_know_who) vs none (agency_recommends).
    const selectionMode =
      value.selectionMode === "i_know_who" || value.selectionMode === "agency_recommends"
        ? value.selectionMode
        : selectedIds.length > 0
          ? "i_know_who"
          : "agency_recommends";
    base.talent = {
      ...prevTalent,
      selected_ids: selectedIds,
      selection_mode: selectionMode,
    };
    // Friendlier summary off the optional display names; fall back to a count.
    const names = Array.isArray(value.selectedNames)
      ? value.selectedNames
          .map((n) => (typeof n === "string" ? n.trim() : ""))
          .filter((n) => n.length > 0)
      : [];
    if (selectedIds.length === 0) {
      appliedSummary = "Let the agency recommend";
    } else if (names.length === 1) {
      appliedSummary = `Added ${names[0]} to your inquiry`;
    } else if (names.length > 1) {
      appliedSummary = `Added ${names.length} talent to your inquiry`;
    } else {
      appliedSummary =
        selectedIds.length === 1
          ? "Added 1 talent to your inquiry"
          : `Added ${selectedIds.length} talent to your inquiry`;
    }
  } else if (kind === "contact") {
    // Contact — promote the early-partial placeholder contact (the
    // ensureGuestChatInquiry seed: "Guest" / "pending-{id}@guest.impronta") to
    // the real values the guest supplies. Writes the flat contact_* columns the
    // agency reads to reach the client AND mirrors them into
    // interpreted_query.requester so the Details loader + offer-readiness see a
    // coherent requester. Empty/whitespace fields are ignored (never clobber a
    // good value with a blank), so a partial contact edit is additive.
    const prevRequester = (base.requester as Record<string, unknown> | undefined) ?? {};
    const name = value.contactName?.trim() || null;
    const email = value.contactEmail?.trim() || null;
    const phone = value.contactPhone?.trim() || null;
    base.requester = {
      ...prevRequester,
      ...(name ? { name } : {}),
      ...(email ? { email } : {}),
      ...(phone ? { phone } : {}),
    };
    if (name) flatColumns.contact_name = name;
    if (email) flatColumns.contact_email = email;
    if (phone) flatColumns.contact_phone = phone;
    appliedSummary = name || email || (phone ? "Contact added" : "Contact TBD");
  } else if (kind === "brief") {
    // Brief — the free-text project summary. Persisted into
    // interpreted_query.brief.summary AND the flat `message` + `raw_ai_query`
    // columns (the same columns startGuestChatInquiry / the engine populate),
    // so the Details loader + offer-readiness pick it up without extra parsing.
    const prevBrief = (base.brief as Record<string, unknown> | undefined) ?? {};
    const summary = value.summary?.trim() || null;
    base.brief = {
      ...prevBrief,
      ...(summary ? { summary } : {}),
    };
    if (summary) {
      flatColumns.message = summary;
      flatColumns.raw_ai_query = summary;
    }
    appliedSummary = summary ? "Brief updated" : "Brief TBD";
  }

  return { mergedQuery: base, flatColumns, appliedSummary };
}

/**
 * Build the client-friendly inquiry_details_updated system-note body for a chip
 * (§6.1 / B.7). House rules: never "buyer", no em dashes. The summary segment is
 * sanitized (control chars stripped, length-capped) so guest-supplied free text
 * (city / event_type / brief) can neither inject newlines nor spoof system copy;
 * the surrounding phrasing is platform-authored. `talent` summaries already read
 * as a full sentence fragment from mergeChipIntoQuery, so they are used verbatim.
 */
function buildDetailNote(kind: GuestChipKind, appliedSummary: string): string {
  const safe = appliedSummary
    .replace(/[\x00-\x1F\x7F]/g, " ")
    .trim()
    .slice(0, 200);
  switch (kind) {
    case "date":
      return `Event date set to ${safe}.`;
    case "location":
      return `Location set to ${safe}.`;
    case "headcount":
      return `Headcount set to ${safe}.`;
    case "event_type":
      return `Event type set to ${safe}.`;
    case "budget":
      return `Budget: ${safe}.`;
    case "talent":
      // safe already reads e.g. "Added Sofia to your inquiry" /
      // "Let the agency recommend".
      return `${safe}.`;
    case "brief":
      return "Brief updated.";
    case "contact":
      // Never echo the raw email/phone back into the thread (PII restraint);
      // a neutral confirmation is enough for every surface to reconcile.
      return "Contact details updated.";
    default:
      return `${safe}.`;
  }
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
    // Validate kind against the canonical enum before any DB work.
    const VALID_CHIP_KINDS: ReadonlySet<string> = new Set<GuestChipKind>([
      "date", "location", "headcount", "event_type", "budget", "talent", "brief", "contact",
    ]);
    if (!input.kind || !VALID_CHIP_KINDS.has(input.kind)) {
      return fail("validation_failed", "Unknown detail.", {
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

    // Refuse writes on terminal / finalized inquiries. A booked or closed
    // inquiry's structured spine must not be mutated by a guest chip — the
    // coordinator or admin owns the data at that point. Mirrors the
    // TERMINAL_STATUSES set in guest-trust-gate.ts + the "booked"/"closed"
    // buckets from toThreadStatus in guest-chat-actions.ts.
    const terminalStatuses = new Set([
      "cancelled", "closed", "archived", "rejected", "expired", "closed_lost",
      "booked", "converted",
    ]);
    if (terminalStatuses.has(inquiry.status)) {
      return { ok: true, appliedSummary: "" }; // silent no-op, data already settled
    }

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
    // here is non-fatal; the chip data is already written. Skip entirely when
    // appliedSummary is empty (e.g. a chip that produced no text) so we never
    // insert a blank or misleading system bubble.
    if (appliedSummary) {
      try {
        // Sanitize the bubble body: cap length, strip control characters
        // (newlines, carriage returns, other ASCII control chars) so
        // guest-supplied free text (city / event_type) cannot inject newlines
        // or spoof system copy. The "Added: " prefix is platform-authored;
        // only the summary segment comes from guest input. For `contact` we
        // never echo the email/phone into the group thread (PII restraint) and
        // use a neutral confirmation instead.
        const sanitizedSummary =
          input.kind === "contact"
            ? "Contact details"
            : appliedSummary
                .replace(/[\x00-\x1F\x7F]/g, " ")
                .trim()
                .slice(0, 200);
        const bubbleBody =
          input.kind === "contact" ? "Contact details updated" : `Added: ${sanitizedSummary}`;
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

      // Emit the canonical inquiry_details_updated engine event with a
      // PRIVATE-thread system note (§6.1 / B.7). The private (client) thread is
      // the one the guest reads (readGuestVisibleMessages) AND the one admin
      // Messages / the client dashboard / the talent workspace render, so this
      // single emit keeps all four surfaces coherent: use-inquiry-realtime
      // debounces a router.refresh() on the inquiry_messages insert and every
      // surface re-renders with the same gentle note. actorUserId is null — a
      // guest is not an authenticated user. Best-effort: the listener chain
      // swallows its own failures into failed_engine_effects, and the chip data
      // is already persisted, so an emit failure never fails the chip.
      try {
        const note = buildDetailNote(input.kind, appliedSummary);
        await emitStandardEngineEvent(admin, {
          type: ENGINE_EVENT_TYPES.INQUIRY_DETAILS_UPDATED,
          inquiryId: inquiry.id,
          actorUserId: null,
          data: { chip_kind: input.kind },
          systemMessage: {
            threadType: "private",
            eventType: "inquiry_details_updated",
            body: note,
          },
        });
      } catch (emitErr) {
        // Non-fatal — the structured spine is already written.
        logServerError("guest-detail-chips-actions.captureGuestChip/emit", emitErr);
      }
    }

    return { ok: true, appliedSummary };
  } catch (err) {
    logServerError("guest-detail-chips-actions.captureGuestChip", err);
    return fail("engine_error", "Couldn't save that detail. Please try again.");
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Inverse mapper: interpreted_query sub-objects → per-kind GuestChipValue. This
// is the read-side mirror of mergeChipIntoQuery — it lets getGuestInquiryDetails
// (P1-T3) reconcile a remote edit back into the live guest chips. Only kinds that
// actually carry a value are returned, so the panel's "captured" state is honest.
// ─────────────────────────────────────────────────────────────────────────────

function readChipValuesFromQuery(
  query: Record<string, unknown> | null,
): { capturedKinds: GuestChipKind[]; values: GuestInquiryDetailValues } {
  const values: GuestInquiryDetailValues = {};
  const capturedKinds: GuestChipKind[] = [];
  if (!query) return { capturedKinds, values };

  const asRecord = (v: unknown): Record<string, unknown> | null =>
    v && typeof v === "object" ? (v as Record<string, unknown>) : null;

  // date
  const date = asRecord(query.date);
  if (date) {
    const status = typeof date.status === "string" ? date.status : undefined;
    const eventDate = typeof date.event_date === "string" ? date.event_date : null;
    if (eventDate || (status && status !== "not_sure")) {
      values.date = {
        dateStatus: status as GuestChipValue["dateStatus"],
        eventDate,
      };
      capturedKinds.push("date");
    }
  }

  // location
  const loc = asRecord(query.location);
  if (loc) {
    const status = typeof loc.status === "string" ? loc.status : undefined;
    const city = typeof loc.city === "string" ? loc.city : null;
    if (city || (status && status !== "not_sure")) {
      values.location = {
        locationStatus: status as GuestChipValue["locationStatus"],
        city,
      };
      capturedKinds.push("location");
    }
  }

  // headcount + talent both live on interpreted_query.talent
  const talent = asRecord(query.talent);
  if (talent) {
    const count =
      typeof talent.count_needed === "number" ? talent.count_needed : null;
    if (count !== null) {
      values.headcount = { headcount: count };
      capturedKinds.push("headcount");
    }
    const selectedIds = Array.isArray(talent.selected_ids)
      ? talent.selected_ids.filter((id): id is string => typeof id === "string")
      : [];
    const selectionMode =
      talent.selection_mode === "i_know_who" ||
      talent.selection_mode === "agency_recommends"
        ? talent.selection_mode
        : null;
    if (selectedIds.length > 0 || selectionMode === "agency_recommends") {
      values.talent = { selectedIds, selectionMode };
      capturedKinds.push("talent");
    }
  }

  // event_type
  const ctx = asRecord(query.source_context);
  const eventType =
    ctx && typeof ctx.ai_event_type === "string" ? ctx.ai_event_type : null;
  if (eventType) {
    values.event_type = { eventType };
    capturedKinds.push("event_type");
  }

  // budget
  const budget = asRecord(query.budget);
  if (budget) {
    const preference =
      typeof budget.preference === "string" ? budget.preference : undefined;
    const amount = typeof budget.amount === "number" ? budget.amount : null;
    const currency = typeof budget.currency === "string" ? budget.currency : null;
    if (amount !== null || (preference && preference !== "not_sure")) {
      values.budget = {
        budgetPreference: preference as GuestChipValue["budgetPreference"],
        budgetAmount: amount,
        currency,
      };
      capturedKinds.push("budget");
    }
  }

  // brief
  const brief = asRecord(query.brief);
  const summary =
    brief && typeof brief.summary === "string" ? brief.summary : null;
  if (summary) {
    values.brief = { summary };
    capturedKinds.push("brief");
  }

  // contact — read the real requester values written by the contact chip. The
  // synthetic ensureGuestChatInquiry seed never writes interpreted_query.requester,
  // so a present requester.email/name means real contact details have landed.
  const requester = asRecord(query.requester);
  if (requester) {
    const contactName =
      typeof requester.name === "string" ? requester.name : null;
    const contactEmail =
      typeof requester.email === "string" ? requester.email : null;
    const contactPhone =
      typeof requester.phone === "string" ? requester.phone : null;
    if (contactName || contactEmail || contactPhone) {
      values.contact = { contactName, contactEmail, contactPhone };
      capturedKinds.push("contact");
    }
  }

  return { capturedKinds, values };
}

/**
 * getGuestInquiryDetails — read the current structured chip values for an
 * inquiry the guest cookie OWNS (P1-T3 inbound reconcile). Read-only mirror of
 * captureGuestChip's security model: guest session resolved server-side from the
 * x-impronta-guest cookie, ownership proven by guest_session_id match. Returns
 * the captured kinds + per-kind values so the panel can update the live chips
 * (with an accent flash + remote note) when a remote edit lands. Never throws.
 */
export async function getGuestInquiryDetails(input: {
  inquiryId: string;
}): Promise<GetGuestInquiryDetailsResult> {
  try {
    if (!input.inquiryId?.trim()) {
      return fail("validation_failed", "Missing conversation.", {
        missingFields: ["inquiryId"],
      });
    }

    const guestCtx = await resolveGuestSessionId();
    if (!guestCtx.ok) return guestCtx.failure;
    const { admin, guestSessionId } = guestCtx;

    const owned = await loadOwnedInquiry(admin, input.inquiryId, guestSessionId);
    if (!owned.ok) return owned.failure;

    const { capturedKinds, values } = readChipValuesFromQuery(
      owned.inquiry.interpretedQuery,
    );
    return { ok: true, capturedKinds, values };
  } catch (err) {
    logServerError("guest-detail-chips-actions.getGuestInquiryDetails", err);
    return fail("engine_error", "Couldn't load the latest details.");
  }
}
