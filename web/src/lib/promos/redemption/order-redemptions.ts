import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { logServerError } from "@/lib/server/safe-error";
import {
  confirmRedemption,
  releaseRedemption,
  type RedemptionClientStatus,
  type RpcResult,
  type SourceChannel,
} from "./service";

/**
 * The order side of a promo redemption (Promos v1, money path).
 *
 * The purchase pipeline HOLDS a promo against the order before any payment is
 * opened, and writes the snapshots (list, discount, currency, channel) on the
 * held row right then, while it still knows them. Settling only has the order
 * id, so the snapshots ride the row and these two calls need nothing else:
 *
 *   paid (webhook) / free / pay-at-visit confirmed  -> confirmOrderPromos
 *   checkout expired / failed / unwound              -> releaseOrderPromoHolds
 *
 * Both are idempotent: they act on `held` rows only and the SQL answers
 * `already` for a row that has moved on. Neither throws.
 */

export type HeldRow = {
  id: string;
  list_cents: number | null;
  discount_cents: number | null;
  amount_cents: number | null;
  currency: string | null;
  source_channel: string | null;
  client_status: string | null;
};

export type OrderRedemptionDeps = {
  confirm: typeof confirmRedemption;
  release: typeof releaseRedemption;
};

const DEFAULT_DEPS: OrderRedemptionDeps = { confirm: confirmRedemption, release: releaseRedemption };

const CHANNELS: readonly SourceChannel[] = ["ig_story", "ig_post", "tiktok", "wa", "qr", "qr_print", "link", "email", "code", "site"];
const STATUSES: readonly RedemptionClientStatus[] = ["new", "returning", "lapsed"];

function asChannel(v: string | null): SourceChannel | null {
  return v && (CHANNELS as readonly string[]).includes(v) ? (v as SourceChannel) : null;
}
function asStatus(v: string | null): RedemptionClientStatus | null {
  return v && (STATUSES as readonly string[]).includes(v) ? (v as RedemptionClientStatus) : null;
}

/** Pure: the confirm call a held row turns into. */
export function confirmArgs(row: HeldRow): Parameters<typeof confirmRedemption>[1] {
  const discount = Number(row.discount_cents ?? row.amount_cents ?? 0);
  const list = Number(row.list_cents ?? discount);
  return {
    redemptionId: row.id,
    listCents: Math.max(0, Math.trunc(list)),
    discountCents: Math.max(0, Math.trunc(discount)),
    currency: (row.currency ?? "MXN").toUpperCase(),
    sourceChannel: asChannel(row.source_channel),
    clientStatus: asStatus(row.client_status),
  };
}

async function heldRows(db: SupabaseClient, orderId: string): Promise<HeldRow[] | null> {
  try {
    const { data, error } = await db
      .from("tenant_promo_redemptions")
      .select("id, list_cents, discount_cents, amount_cents, currency, source_channel, client_status")
      .eq("order_id", orderId)
      .eq("status", "held");
    if (error) {
      logServerError("promos.orderRedemptions/read", error);
      return null;
    }
    return (data ?? []) as HeldRow[];
  } catch (err) {
    logServerError("promos.orderRedemptions/read", err);
    return null;
  }
}

export type ConfirmOutcome = { ok: boolean; confirmed: number; lost: string[] };

/**
 * The booking is paid (or owes nothing, or the visit is confirmed): every held
 * promo on the order becomes a use. A hold that lapsed and lost its seat
 * (`hold_expired`) cannot be honoured; the charge already happened at the
 * discount, so it is LOGGED for a human rather than re-priced.
 */
export async function confirmOrderPromos(
  db: SupabaseClient,
  orderId: string,
  deps: OrderRedemptionDeps = DEFAULT_DEPS,
): Promise<ConfirmOutcome> {
  const rows = await heldRows(db, orderId);
  if (!rows) return { ok: false, confirmed: 0, lost: [] };
  let confirmed = 0;
  let ok = true;
  const lost: string[] = [];
  for (const row of rows) {
    let res: RpcResult;
    try {
      res = await deps.confirm(db, confirmArgs(row));
    } catch (err) {
      logServerError("promos.orderRedemptions/confirm", err);
      ok = false;
      continue;
    }
    if (res.ok) {
      if (!res.already) confirmed += 1;
      continue;
    }
    ok = false;
    if (res.reason === "hold_expired") {
      lost.push(row.id);
      logServerError(
        "promos.orderRedemptions/PROMO_SEAT_LOST_AFTER_PAYMENT",
        `order ${orderId}: redemption ${row.id} paid at the promo price after its hold lapsed and the promo sold out. Needs a human.`,
      );
    } else {
      logServerError("promos.orderRedemptions/confirm", `order ${orderId}: ${row.id} ${res.reason ?? "unknown"}`);
    }
  }
  return { ok, confirmed, lost };
}

/** Checkout abandoned / failed / unwound: the held uses go back to the pool. */
export async function releaseOrderPromoHolds(
  db: SupabaseClient,
  orderId: string,
  deps: Pick<OrderRedemptionDeps, "release"> = DEFAULT_DEPS,
): Promise<{ ok: boolean; released: number }> {
  const rows = await heldRows(db, orderId);
  if (!rows) return { ok: false, released: 0 };
  return releaseRedemptionIds(db, rows.map((r) => r.id), deps);
}

export async function releaseRedemptionIds(
  db: SupabaseClient,
  ids: readonly string[],
  deps: Pick<OrderRedemptionDeps, "release"> = DEFAULT_DEPS,
): Promise<{ ok: boolean; released: number }> {
  let released = 0;
  let ok = true;
  for (const id of ids) {
    try {
      const res = await deps.release(db, id, false);
      if (res.ok) released += res.already ? 0 : 1;
      else ok = false;
    } catch (err) {
      logServerError("promos.orderRedemptions/release", err);
      ok = false;
    }
  }
  return { ok, released };
}

const SETTLED_TXN = new Set(["paid", "payout_pending", "payout_sent", "refunded", "partially_refunded", "disputed"]);

/**
 * Stripe closed a Checkout session without payment (expired, or a delayed
 * method failed). The order's held promo uses go back now rather than at the
 * sweep. A transaction that settled anyway (a completed event raced ahead)
 * keeps its promo: the webhook confirms it.
 */
export async function releasePromoHoldsForClosedCheckout(
  db: SupabaseClient,
  transactionId: string,
  deps: Pick<OrderRedemptionDeps, "release"> = DEFAULT_DEPS,
): Promise<{ ok: boolean; released: number }> {
  try {
    const { data, error } = await db
      .from("booking_transactions")
      .select("order_id, status")
      .eq("id", transactionId)
      .maybeSingle();
    if (error) {
      logServerError("promos.orderRedemptions/closedCheckout", error);
      return { ok: false, released: 0 };
    }
    const txn = data as { order_id: string | null; status: string } | null;
    if (!txn?.order_id || SETTLED_TXN.has(txn.status)) return { ok: true, released: 0 };
    return releaseOrderPromoHolds(db, txn.order_id, deps);
  } catch (err) {
    logServerError("promos.orderRedemptions/closedCheckout", err);
    return { ok: false, released: 0 };
  }
}
