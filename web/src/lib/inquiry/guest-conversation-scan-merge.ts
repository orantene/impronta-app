/**
 * guest-conversation-scan-merge.ts — PURE empty-only merge logic for the AI
 * conversation scan (W2-I).
 *
 * Given the inquiry's CURRENT interpreted_query and the structured fragments the
 * AI pulled from the recent chat (GuestMessageCapture), this decides which
 * detail chips to write. The invariant the whole feature rests on:
 *
 *   AI only fills a field that is currently EMPTY. It NEVER overwrites a value
 *   the guest set or confirmed.
 *
 * Emptiness is read the same way getGuestInquiryDetails reports "captured" kinds
 * (readChipValuesFromQuery in guest-detail-chips-actions.ts) — a field counts as
 * present when it carries a real value (a concrete date/city/count/amount, or a
 * decided status), and empty otherwise. This module imports nothing server-side
 * (GuestMessageCapture is a type-only import), so the scan action and its unit
 * tests share the exact same plan.
 */

import type { GuestChipKind, GuestChipValue } from "./guest-chat-contract";
import type { GuestMessageCapture } from "./guest-message-extract";

/** One chip the scan wants to write (the inquiryId is added by the action). */
export type ScanFill = { kind: GuestChipKind; value: GuestChipValue };

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" ? (v as Record<string, unknown>) : null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Emptiness predicates — the READ-side mirror of readChipValuesFromQuery. A
// field is "present" when it already carries a real value the guest owns; the
// scan skips present fields so it can never overwrite a user value.
// ─────────────────────────────────────────────────────────────────────────────

export function isDateEmpty(query: Record<string, unknown> | null): boolean {
  const date = asRecord(query?.date);
  if (!date) return true;
  const status = typeof date.status === "string" ? date.status : undefined;
  const eventDate = typeof date.event_date === "string" ? date.event_date : null;
  // Present when a concrete date exists OR a decided (non-"not_sure") status.
  return !(eventDate || (status && status !== "not_sure"));
}

export function isLocationEmpty(query: Record<string, unknown> | null): boolean {
  const loc = asRecord(query?.location);
  if (!loc) return true;
  const status = typeof loc.status === "string" ? loc.status : undefined;
  const city = typeof loc.city === "string" && loc.city.trim() ? loc.city : null;
  return !(city || (status && status !== "not_sure"));
}

export function isHeadcountEmpty(query: Record<string, unknown> | null): boolean {
  const talent = asRecord(query?.talent);
  return !(talent && typeof talent.count_needed === "number");
}

export function isEventTypeEmpty(query: Record<string, unknown> | null): boolean {
  const ctx = asRecord(query?.source_context);
  return !(ctx && typeof ctx.ai_event_type === "string" && ctx.ai_event_type.trim());
}

export function isBudgetEmpty(query: Record<string, unknown> | null): boolean {
  const budget = asRecord(query?.budget);
  if (!budget) return true;
  const amount = typeof budget.amount === "number" ? budget.amount : null;
  const preference =
    typeof budget.preference === "string" ? budget.preference : undefined;
  return !(amount !== null || (preference && preference !== "not_sure"));
}

// ─────────────────────────────────────────────────────────────────────────────
// Fill builders — turn a capture fragment into a GuestChipValue, or null when
// the fragment carries no usable signal for that kind.
// ─────────────────────────────────────────────────────────────────────────────

function dateFill(capture: GuestMessageCapture): GuestChipValue | null {
  const date = capture.date;
  if (!date) return null;
  if (date.status === "exact" && date.event_date) {
    return { dateStatus: "exact", eventDate: date.event_date };
  }
  if (date.status === "flexible") {
    return { dateStatus: "flexible", eventDate: null };
  }
  return null;
}

function locationFill(capture: GuestMessageCapture): GuestChipValue | null {
  const loc = capture.location;
  if (!loc) return null;
  // The chip carries a single city field; fall back through the coarser
  // location fragments the model may have returned.
  const city = (loc.city || loc.area || loc.country || "").trim() || null;
  const status = loc.status === "online" ? "online" : city ? "unconfirmed" : null;
  if (!city && status !== "online") return null;
  return { locationStatus: status ?? "unconfirmed", city };
}

function headcountFill(capture: GuestMessageCapture): GuestChipValue | null {
  const count = capture.talent?.count_needed;
  if (typeof count !== "number" || !Number.isFinite(count) || count <= 0) return null;
  return { headcount: Math.floor(count) };
}

function eventTypeFill(capture: GuestMessageCapture): GuestChipValue | null {
  const eventType = capture.eventType?.trim();
  if (!eventType) return null;
  return { eventType };
}

function budgetFill(capture: GuestMessageCapture): GuestChipValue | null {
  const budget = capture.budget;
  const amount = budget?.amount;
  if (typeof amount !== "number" || !Number.isFinite(amount) || amount <= 0) return null;
  const value: GuestChipValue = {
    budgetPreference: "total_budget",
    budgetAmount: amount,
  };
  if (budget?.currency) value.currency = budget.currency;
  return value;
}

// ─────────────────────────────────────────────────────────────────────────────
// The plan
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Compute the set of AI-suggested chip writes for an inquiry. Returns ONE fill
 * per kind, and ONLY for kinds whose field is currently empty AND for which the
 * capture supplies a usable value. User-set values are always preserved (their
 * kind is skipped because it isn't empty).
 */
export function planScanFills(
  existingQuery: Record<string, unknown> | null,
  capture: GuestMessageCapture,
): ScanFill[] {
  const fills: ScanFill[] = [];

  if (isDateEmpty(existingQuery)) {
    const v = dateFill(capture);
    if (v) fills.push({ kind: "date", value: v });
  }
  if (isLocationEmpty(existingQuery)) {
    const v = locationFill(capture);
    if (v) fills.push({ kind: "location", value: v });
  }
  if (isHeadcountEmpty(existingQuery)) {
    const v = headcountFill(capture);
    if (v) fills.push({ kind: "headcount", value: v });
  }
  if (isEventTypeEmpty(existingQuery)) {
    const v = eventTypeFill(capture);
    if (v) fills.push({ kind: "event_type", value: v });
  }
  if (isBudgetEmpty(existingQuery)) {
    const v = budgetFill(capture);
    if (v) fills.push({ kind: "budget", value: v });
  }

  return fills;
}
