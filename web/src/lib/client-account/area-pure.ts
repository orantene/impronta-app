/**
 * Pure rules for the `/account` page on talent sites (TUL-62). No I/O, no clock
 * of its own, so the decisions are asserted without a database.
 */

import type { FeeLine } from "@/lib/billing/processing-fee-payer";
import { validClientFeeLines } from "@/lib/payments/fee-lines-payload";
import { shapeMeData, type MeRow } from "@/lib/me/shape-me";

import { isClientAccountEligible } from "./pure";

export type AccountView =
  | { kind: "home"; tab: AccountTab }
  | { kind: "visit"; id: string }
  | { kind: "thread"; id: string }
  | { kind: "receipt"; code: string };

export type AccountTab = "visits" | "messages" | "payments" | "settings";
export const ACCOUNT_TABS: readonly AccountTab[] = ["visits", "messages", "payments", "settings"];

export function parseAccountTab(raw: string | null | undefined): AccountTab {
  return ACCOUNT_TABS.find((t) => t === raw) ?? "visits";
}

/** Route gating: the area renders only on a talent site host with the flag on. */
export function accountAreaGate(input: { flagOn: boolean; hostContext: string | null | undefined }): "render" | "not_found" {
  return input.flagOn && input.hostContext === "talent_site" ? "render" : "not_found";
}

/** What the page shows for a given session: signed out, wrong kind of account, or the client. */
export function accountAudience(input: {
  userId: string | null | undefined;
  appRole: string | null | undefined;
}): "signed_out" | "not_client" | "client" {
  if (!input.userId) return "signed_out";
  return isClientAccountEligible(input.appRole) ? "client" : "not_client";
}

/** Visits split into the three groups the tab shows. Wraps the shared `/me` shaper. */
export function groupVisits(rows: readonly MeRow[], nowMs: number) {
  const m = shapeMeData(rows, nowMs);
  return { upcoming: m.upcoming, waiting: m.waitingOnYou, past: m.past };
}

const CLOSED = new Set(["cancelled", "completed", "archived", "declined", "expired", "closed"]);

export type ManageBookingFacts = {
  bookingTenantId: string | null;
  bookingClientUserId: string | null;
  bookingStatus: string | null;
  startsAt: string | null;
};

export type ManageDecision =
  | { ok: true }
  | { ok: false; reason: "not_signed_in" | "not_client" | "wrong_tenant" | "not_owner" | "closed" | "past" };

/**
 * Who may cancel or reschedule a booking from the account page. Owner of the
 * booking (the session user is the booking's client), same tenant as this site,
 * a client account (never talent or staff), and the booking still open and in
 * the future. Everything else is a refusal with ONE reason.
 */
export function canManageBooking(input: {
  sessionUserId: string | null | undefined;
  appRole: string | null | undefined;
  siteTenantId: string | null | undefined;
  booking: ManageBookingFacts;
  nowMs: number;
}): ManageDecision {
  if (!input.sessionUserId) return { ok: false, reason: "not_signed_in" };
  if (!isClientAccountEligible(input.appRole)) return { ok: false, reason: "not_client" };
  const b = input.booking;
  if (!input.siteTenantId || !b.bookingTenantId || b.bookingTenantId !== input.siteTenantId) {
    return { ok: false, reason: "wrong_tenant" };
  }
  if (!b.bookingClientUserId || b.bookingClientUserId !== input.sessionUserId) {
    return { ok: false, reason: "not_owner" };
  }
  if (CLOSED.has((b.bookingStatus ?? "").toLowerCase())) return { ok: false, reason: "closed" };
  const start = b.startsAt ? Date.parse(b.startsAt) : NaN;
  if (!Number.isFinite(start) || start <= input.nowMs) return { ok: false, reason: "past" };
  return { ok: true };
}

export type ZonedWhen = { date: string; time: string; tzLabel: string };

/** Date and time in the TALENT's zone, with the zone named (short offset plus the IANA id). */
export function formatZonedWhen(iso: string | null | undefined, timeZone: string, locale: string): ZonedWhen | null {
  const ms = iso ? Date.parse(iso) : NaN;
  if (!Number.isFinite(ms)) return null;
  const loc = locale === "es" ? "es-MX" : "en-US";
  const run = (zone: string) => {
    const date = new Intl.DateTimeFormat(loc, { timeZone: zone, weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(ms);
    const time = new Intl.DateTimeFormat(loc, { timeZone: zone, hour: "numeric", minute: "2-digit" }).format(ms);
    const short = new Intl.DateTimeFormat(loc, { timeZone: zone, timeZoneName: "short" })
      .formatToParts(ms)
      .find((p) => p.type === "timeZoneName")?.value;
    return { date, time, tzLabel: short ? `${short} (${zone})` : zone };
  };
  try {
    return run(timeZone);
  } catch {
    return run("UTC");
  }
}

export type ReceiptLineKind = "service" | "reservation" | "tulala_fee" | "processing" | "total";
export type ReceiptLine = { kind: ReceiptLineKind; cents: number };

const KIND: Record<string, ReceiptLineKind | undefined> = {
  service_subtotal: "service",
  base_reservation_fee: "reservation",
  platform_fee: "tulala_fee",
  processing_fee: "processing",
  total_charged: "total",
};

/**
 * Receipt lines from LEDGER rows (the frozen commission snapshot lines). Amounts
 * are copied, never recomputed. The Tulala service fee is its own line when the
 * ledger has it. When the lines do not add up to what was paid there is no
 * breakdown, only the total paid.
 */
export function shapeReceiptLines(feeLines: readonly FeeLine[] | null | undefined, paidCents: number): ReceiptLine[] {
  const valid = validClientFeeLines(feeLines, paidCents);
  const out: ReceiptLine[] = [];
  for (const l of valid) {
    const kind = KIND[l.code];
    if (kind && (kind === "total" || l.cents > 0)) out.push({ kind, cents: l.cents });
  }
  return out.length > 0 ? out : [{ kind: "total", cents: paidCents }];
}

export type AccountSettingsInput = { name: string; phone: string; locale: string; marketingOptIn: boolean };

/** Trims and bounds the settings form; null when a field is unusable. */
export function normalizeAccountSettings(raw: Partial<AccountSettingsInput>): AccountSettingsInput | null {
  const name = (raw.name ?? "").trim().slice(0, 120);
  const phone = (raw.phone ?? "").trim();
  if (phone && !/^[+()\d][\d\s().-]{5,24}$/.test(phone)) return null;
  const locale = raw.locale === "es" ? "es" : raw.locale === "en" ? "en" : null;
  if (!locale) return null;
  return { name, phone, locale, marketingOptIn: raw.marketingOptIn === true };
}
