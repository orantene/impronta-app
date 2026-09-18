import type { RecordKind } from "./types";

/**
 * S2 / owner decision 1 + 14: a conversation follows its records. It stays
 * open while any linked record is open or money is owed; it auto-resolves a
 * grace period after the LAST record closes — 2 days for orders,
 * appointments, reservations and class seats; 7 days for tickets and
 * projects. Pure: a list of record states in, a verdict out. The cron that
 * calls this and flips `inquiries.conversation_state` is a seam (D-MSG-14),
 * not part of this module.
 *
 * The state vocabularies mirror `conversation_records.payment_state` /
 * `fulfilment_state` (migration 20261231255000_conversation_record_state.sql)
 * and are written only by `messaging_sync_record_state`, never by Messages.
 */
export const PAYMENT_STATES = [
  "none",
  "requested",
  "opened",
  "paid",
  "failed",
  "expired",
  "refunded",
  "partially_refunded",
  "unknown",
] as const;
export type PaymentState = (typeof PAYMENT_STATES)[number];

export const FULFILMENT_STATES = [
  "none",
  "hold",
  "confirmed",
  "preparing",
  "ready",
  "fulfilled",
  "seated",
  "checked_in",
  "cancelled",
] as const;
export type FulfilmentState = (typeof FULFILMENT_STATES)[number];

export type LifecycleRecord = {
  kind: RecordKind;
  paymentState: PaymentState | string | null;
  fulfilmentState: FulfilmentState | string | null;
  /** The date the record is FOR (pickup, appointment start, event start). ISO or null. */
  recordDate: string | null;
  /** When the record's state last changed. ISO or null. */
  updatedAt: string | null;
};

export type AutoResolveVerdict =
  | { resolve: true; reason: "all_records_closed"; readyAt: string }
  | { resolve: false; reason: "no_records" | "record_open" | "money_owed" }
  | { resolve: false; reason: "in_grace"; readyAt: string };

const DAY_MS = 24 * 60 * 60 * 1000;

/** Owner decision 14: 2 / 7 days, per-business adjustable later. */
export const AUTO_RESOLVE_GRACE_DAYS: Record<RecordKind, number> = {
  order: 2,
  appointment: 2,
  reservation: 2,
  class_enrolment: 2,
  tickets: 7,
  project: 7,
  offer: 2,
};

/** Kinds whose record_date is the moment the thing happens; once that moment
 * is past the record is over even if nobody pressed "fulfil". */
const TIME_ANCHORED: ReadonlySet<RecordKind> = new Set(["appointment", "reservation", "class_enrolment", "tickets"]);

const OWED: ReadonlySet<string> = new Set(["requested", "opened", "failed", "expired"]);

function parse(iso: string | null): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : null;
}

/**
 * When did this record close? `null` means it is still open (or its state is
 * unknown, which the rule treats as open — a chip nobody has synced must not
 * silently resolve a live conversation).
 */
function closedAt(record: LifecycleRecord, nowMs: number): number | null {
  const fulfilment = record.fulfilmentState;
  if (fulfilment === "fulfilled" || fulfilment === "cancelled") {
    return parse(record.updatedAt) ?? parse(record.recordDate) ?? nowMs;
  }
  if (TIME_ANCHORED.has(record.kind)) {
    const date = parse(record.recordDate);
    if (date != null && date <= nowMs && fulfilment != null && fulfilment !== "none") return date;
  }
  return null;
}

export function deriveAutoResolve(records: readonly LifecycleRecord[], now: string | Date): AutoResolveVerdict {
  const nowMs = now instanceof Date ? now.getTime() : Date.parse(now);
  if (records.length === 0) return { resolve: false, reason: "no_records" };

  let readyAtMs = Number.NEGATIVE_INFINITY;
  for (const record of records) {
    const closed = closedAt(record, nowMs);
    if (closed == null) return { resolve: false, reason: "record_open" };
    if (record.fulfilmentState !== "cancelled" && record.paymentState != null && OWED.has(record.paymentState)) {
      return { resolve: false, reason: "money_owed" };
    }
    const grace = AUTO_RESOLVE_GRACE_DAYS[record.kind] ?? 2;
    readyAtMs = Math.max(readyAtMs, closed + grace * DAY_MS);
  }

  const readyAt = new Date(readyAtMs).toISOString();
  if (nowMs >= readyAtMs) return { resolve: true, reason: "all_records_closed", readyAt };
  return { resolve: false, reason: "in_grace", readyAt };
}
