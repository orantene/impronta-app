/**
 * Draft / no-time bookings for the agenda "Sin hora" strip.
 *
 * Offer accept without a window creates `agency_bookings` (status draft,
 * starts_at null) + a booking_talent leg, but never a talent_bookings mirror.
 * `loadTalentAgenda` only reads talent_bookings by date range, so those rows
 * were invisible. This loader finds them via the talent leg.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { totalClientRevenueToCents } from "@/lib/money/total-client-revenue";
import { PAID_AFTER_CANCEL_ATTENTION } from "@/lib/payments/paid-after-cancel";
import { logServerError } from "@/lib/server/safe-error";

import { deriveBookingState, derivePaymentState } from "./derive";
import type { TalentAgendaItem } from "./types";

export type UnscheduledAgencyRow = {
  id: string;
  status: string | null;
  payment_status?: string | null;
  payment_method?: string | null;
  total_client_revenue?: number | null;
  deposit_amount_cents?: number | null;
  currency_code?: string | null;
  contact_name?: string | null;
  contact_email?: string | null;
  contact_phone?: string | null;
  title?: string | null;
  order_id?: string | null;
  source_type_snapshot?: string | null;
  created_at?: string | null;
  starts_at?: string | null;
};

function initials(name: string | null | undefined): string {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  return parts
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

/** True when the booking has no calendar window yet. */
export function isUnscheduledAgencyBooking(
  row: Pick<UnscheduledAgencyRow, "starts_at" | "status">,
): boolean {
  if (row.starts_at) return false;
  const s = (row.status ?? "").toLowerCase();
  if (s === "cancelled" || s === "canceled" || s === "completed" || s === "no_show") {
    return false;
  }
  return true;
}

/**
 * Pure: map an unscheduled agency booking into a TalentAgendaItem.
 * `startsAt` is a stable sort key (created_at), never a calendar slot.
 */
export function mapUnscheduledDraftBooking(
  row: UnscheduledAgencyRow,
  input: { paidCents?: number; now?: Date; refundPending?: boolean } = {},
): TalentAgendaItem | null {
  if (!isUnscheduledAgencyBooking(row)) return null;
  const now = input.now ?? new Date();
  const sortAt =
    row.created_at && !Number.isNaN(Date.parse(row.created_at))
      ? row.created_at
      : now.toISOString();
  const totalCents = totalClientRevenueToCents(row.total_client_revenue);
  const paidCents = Math.max(0, input.paidCents ?? 0);
  const booking = deriveBookingState({
    kind: "booking",
    status: row.status ?? "draft",
    now,
  });
  const payment = derivePaymentState({
    booking,
    paymentStatus: row.payment_status,
    paymentMethod: row.payment_method ?? null,
    paidCents,
    totalCents,
    depositCents: row.deposit_amount_cents ?? 0,
    refundPending: input.refundPending === true,
    managedByAgency: (row.source_type_snapshot ?? "").toLowerCase() === "agency",
    now,
  });
  const name = (row.contact_name ?? "").trim() || "Client";
  const title = (row.title ?? "").trim() || name;
  return {
    id: row.id,
    kind: "booking",
    ref: { table: "agency_bookings", id: row.id },
    client: {
      name,
      initials: initials(row.contact_name),
      email: row.contact_email ?? undefined,
      phone: row.contact_phone ?? undefined,
    },
    title,
    lines: [{ label: title, cents: totalCents }],
    startsAt: sortAt,
    endsAt: sortAt,
    allDay: true,
    tz: "UTC",
    where: { mode: "online", label: "No time" },
    bufferAfterMin: 0,
    booking,
    payment,
    money: {
      totalCents,
      paidCents,
      depositCents: row.deposit_amount_cents ?? undefined,
      dueCents: Math.max(0, totalCents - paidCents),
      currency: (row.currency_code ?? "MXN").toUpperCase(),
    },
    source: (row.source_type_snapshot ?? "").toLowerCase() === "agency" ? "agency" : "website",
    orderId: row.order_id ?? undefined,
    paymentMethod: row.payment_method ?? undefined,
    unscheduled: true,
    blocksTime: false,
    history: [],
  };
}

/** Agenda items that belong on the Sin hora strip (not the day grid). */
export function unscheduledAgendaItems(
  items: readonly TalentAgendaItem[],
): TalentAgendaItem[] {
  return items.filter((item) => item.unscheduled === true);
}

export function txRefundPending(rows: readonly { metadata?: unknown }[]): boolean {
  for (const row of rows) {
    const meta =
      row.metadata && typeof row.metadata === "object"
        ? (row.metadata as Record<string, unknown>)
        : {};
    if (meta.needs_attention === PAID_AFTER_CANCEL_ATTENTION) return true;
  }
  return false;
}

/**
 * Load draft / no-time bookings for this talent that are missing from the
 * dated talent_bookings window (accept-without-time path).
 */
export async function loadUnscheduledDraftsForTalent(
  moneyDb: Pick<SupabaseClient, "from">,
  input: {
    talentProfileId: string;
    /** Booking ids already present from the dated talent_bookings query. */
    scheduledBookingIds: readonly string[];
    now: Date;
  },
): Promise<TalentAgendaItem[]> {
  const scheduled = new Set(input.scheduledBookingIds);
  const { data: legs, error: legsErr } = await moneyDb
    .from("booking_talent")
    .select("booking_id")
    .eq("talent_profile_id", input.talentProfileId);
  if (legsErr) {
    logServerError("talent-agenda.unscheduled.legs", legsErr);
    return [];
  }
  const candidateIds = [
    ...new Set(
      ((legs ?? []) as Array<{ booking_id: string | null }>)
        .map((r) => r.booking_id)
        .filter((id): id is string => typeof id === "string" && id.length > 0 && !scheduled.has(id)),
    ),
  ];
  if (candidateIds.length === 0) return [];

  const { data: rows, error } = await moneyDb
    .from("agency_bookings")
    .select(
      "id, status, payment_status, payment_method, total_client_revenue, deposit_amount_cents, currency_code, contact_name, contact_email, contact_phone, title, order_id, source_type_snapshot, created_at, starts_at",
    )
    .in("id", candidateIds)
    .is("starts_at", null)
    .neq("status", "cancelled");
  if (error) {
    logServerError("talent-agenda.unscheduled.agency", error);
    return [];
  }
  const agencyRows = (rows ?? []) as UnscheduledAgencyRow[];
  if (agencyRows.length === 0) return [];

  const ids = agencyRows.map((r) => r.id);
  const { data: txRows, error: txErr } = await moneyDb
    .from("booking_transactions")
    .select("booking_id, status, gross_amount_cents, metadata")
    .in("booking_id", ids);
  if (txErr) logServerError("talent-agenda.unscheduled.tx", txErr);

  const paidByBooking = new Map<string, number>();
  const refundByBooking = new Map<string, boolean>();
  for (const tx of (txRows ?? []) as Array<{
    booking_id: string;
    status: string;
    gross_amount_cents: number | null;
    metadata?: unknown;
  }>) {
    if (tx.status === "paid" || tx.status === "payout_pending" || tx.status === "payout_sent") {
      paidByBooking.set(
        tx.booking_id,
        (paidByBooking.get(tx.booking_id) ?? 0) +
          Math.max(0, Math.round(Number(tx.gross_amount_cents) || 0)),
      );
    }
    const meta =
      tx.metadata && typeof tx.metadata === "object"
        ? (tx.metadata as Record<string, unknown>)
        : {};
    if (meta.needs_attention === PAID_AFTER_CANCEL_ATTENTION) {
      refundByBooking.set(tx.booking_id, true);
    }
  }

  const out: TalentAgendaItem[] = [];
  for (const row of agencyRows) {
    const item = mapUnscheduledDraftBooking(row, {
      paidCents: paidByBooking.get(row.id) ?? 0,
      refundPending: refundByBooking.get(row.id) === true,
      now: input.now,
    });
    if (item) out.push(item);
  }
  return out;
}
