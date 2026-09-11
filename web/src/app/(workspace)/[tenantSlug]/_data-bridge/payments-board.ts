import "server-only";

import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";
import { loadExceptions } from "@/lib/exceptions/read";
import type { ExceptionRow } from "@/lib/exceptions/model";
import { venueDayWindow } from "@/lib/pos/classes/day";
import { tenantTimezone } from "@/lib/spaces/venues";
import { groupTakingsByMethod, sumOwedByCurrency, withVariance, type DrawerSessionView, type TakingsByMethod, type CurrencyTotal } from "@/lib/payments/activity-shape";
import {
  loadTenantDrawerSessions,
  loadTenantOwedOrders,
  loadTenantRefunds,
  loadTenantTakings,
  type RefundRow,
} from "./payments-activity";

/**
 * _data-bridge/payments-board.ts — everything the Payments board (W25) draws,
 * from the readers the rest of the workspace already trusts. Nothing here is
 * a second ledger:
 *
 *   Collected · today   `loadTenantTakings` since the venue's midnight, split
 *                       cash / card by the Payments page's own method rule.
 *   Refunds pending     `loadExceptions` rows whose source is `refund_intent`
 *                       (a paid line whose refund has not landed).
 *   Unknown attempts    `loadExceptions` rows whose source is
 *                       `unresolved_collection` (T1-06): a card collection
 *                       started and never resolved either way.
 *   Drawer variance     the most recently CLOSED `pos_shifts` row, counted
 *                       against expected (`withVariance`).
 *   Next payout         `agencies.stripe_account_id` / `stripe_payouts_enabled`
 *                       — whether a destination exists. The schedule and the
 *                       amount are Stripe's and are not read here, so the tile
 *                       says so instead of guessing.
 *
 * EVERY READER FAILS ON ITS OWN. A tile whose reader failed says so (`ok:
 * false`); the others still show. A board that read 0 collected because one
 * query errored would be the silent failure this surface exists to end.
 */

export type PaymentsBoard = {
  timeZone: string;
  nowIso: string;
  collectedToday: { ok: true; currency: string; totalCents: number; cashCents: number; cardCents: number; otherCents: number } | { ok: false };
  takings: { ok: true; groups: TakingsByMethod[] } | { ok: false };
  owed: { ok: true; totals: CurrencyTotal[] } | { ok: false };
  refunds: { ok: true; rows: RefundRow[] } | { ok: false };
  drawers: { ok: true; rows: DrawerSessionView[] } | { ok: false };
  /** `null` when the exceptions queue could not be read at all. */
  exceptions: { ok: true; refundsPending: ExceptionRow[]; unknownAttempts: ExceptionRow[]; unavailable: string[] } | { ok: false };
  payout: { ok: true; destination: boolean; enabled: boolean } | { ok: false };
};

function isCard(method: string): boolean {
  return method === "card_manual" || method.startsWith("stripe") || method.startsWith("mercado");
}

export async function loadPaymentsBoard(input: { tenantId: string; tenantSlug: string; now?: Date }): Promise<PaymentsBoard> {
  const now = input.now ?? new Date();
  const admin = createServiceRoleClient();
  const timeZone = await tenantTimezone(input.tenantId);
  const window = venueDayWindow(now, timeZone, 0) ?? venueDayWindow(now, "UTC", 0);

  const [todayLoad, allLoad, owedLoad, refundsLoad, drawersLoad, exceptionsLoad, agency] = await Promise.all([
    window ? loadTenantTakings(input.tenantId, { since: window.from.toISOString() }) : Promise.resolve({ ok: false as const }),
    loadTenantTakings(input.tenantId),
    loadTenantOwedOrders(input.tenantId),
    loadTenantRefunds(input.tenantId),
    loadTenantDrawerSessions(input.tenantId),
    admin
      ? loadExceptions(admin, { tenantId: input.tenantId, tenantSlug: input.tenantSlug, now: now.getTime() }).catch((e: unknown) => {
          logServerError("dataBridge.paymentsBoard/exceptions", e);
          return null;
        })
      : Promise.resolve(null),
    admin
      ? admin.from("agencies").select("stripe_account_id, stripe_payouts_enabled").eq("id", input.tenantId).maybeSingle()
      : Promise.resolve({ data: null, error: { message: "no admin client" } }),
  ]);

  const collectedToday: PaymentsBoard["collectedToday"] = (() => {
    if (!todayLoad.ok) return { ok: false };
    const byMethod = groupTakingsByMethod(todayLoad.rows);
    const currency = byMethod[0]?.currency ?? "USD";
    let cash = 0;
    let card = 0;
    let other = 0;
    for (const m of byMethod) {
      if (m.currency !== currency) continue;
      if (m.method === "cash") cash += m.totalCents;
      else if (isCard(m.method)) card += m.totalCents;
      else other += m.totalCents;
    }
    return { ok: true, currency, totalCents: cash + card + other, cashCents: cash, cardCents: card, otherCents: other };
  })();

  if (agency.error) logServerError("dataBridge.paymentsBoard/agency", agency.error);
  const agencyRow = (agency.data ?? null) as { stripe_account_id: string | null; stripe_payouts_enabled: boolean | null } | null;

  return {
    timeZone,
    nowIso: now.toISOString(),
    collectedToday,
    takings: allLoad.ok ? { ok: true, groups: groupTakingsByMethod(allLoad.rows) } : { ok: false },
    owed: owedLoad.ok ? { ok: true, totals: sumOwedByCurrency(owedLoad.rows) } : { ok: false },
    refunds: refundsLoad.ok ? { ok: true, rows: refundsLoad.rows } : { ok: false },
    drawers: drawersLoad.ok ? { ok: true, rows: drawersLoad.rows.map(withVariance) } : { ok: false },
    exceptions: exceptionsLoad
      ? {
          ok: true,
          refundsPending: exceptionsLoad.rows.filter((r) => r.source === "refund_intent"),
          unknownAttempts: exceptionsLoad.rows.filter((r) => r.source === "unresolved_collection"),
          unavailable: exceptionsLoad.unavailable,
        }
      : { ok: false },
    payout: agency.error
      ? { ok: false }
      : { ok: true, destination: Boolean(agencyRow?.stripe_account_id), enabled: agencyRow?.stripe_payouts_enabled === true },
  };
}
