import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { emitNotificationToUsers, type EmitNotificationInput } from "@/lib/notifications/emit";
import { logServerError } from "@/lib/server/safe-error";

import { REISSUE_DAYS } from "./policy";
import { handleCancellation } from "./service";

/**
 * B3 "Talent cancels": every promo on the booking goes back to the pool and
 * the client keeps the right to it for 14 days as a personal single-use code,
 * sent to them automatically. Run by the talent-cancel path AFTER the booking
 * is cancelled. Idempotent: it acts on held / confirmed rows only, and a
 * released row is never picked up again, so a retried cancel neither mints a
 * second code nor notifies twice. Never throws.
 */

export type MakeGoodDeps = {
  handleCancellation: typeof handleCancellation;
  notify: (userIds: string[], input: Omit<EmitNotificationInput, "userId">) => Promise<void>;
  now: () => Date;
};

const DEPS: MakeGoodDeps = { handleCancellation, notify: emitNotificationToUsers, now: () => new Date() };

type RedemptionRow = { id: string; customer_id: string | null };
type CustomerRow = { display_name: string | null; user_id: string | null };

export type MakeGoodOutcome = { ok: boolean; released: number; codes: string[] };

/** First word of the display name, for `ANA-7K2Q`. Pure. */
export function firstNameOf(displayName: string | null | undefined): string | null {
  const first = (displayName ?? "").trim().split(/\s+/)[0];
  return first ? first : null;
}

/** The client's message. Pure; no em dashes in client copy. */
export function makeGoodMessage(code: string): { title: string; body: string } {
  return {
    title: "Tu cita se canceló. Tu promo sigue siendo tuya.",
    body: `Usa el código ${code} en los próximos ${REISSUE_DAYS} días para reservar con el mismo descuento.`,
  };
}

async function liveRedemptions(
  db: SupabaseClient,
  anchor: { orderId: string | null; bookingId: string },
): Promise<RedemptionRow[] | null> {
  const cols = "id, customer_id";
  const live = ["held", "confirmed"];
  // Two exact reads (no `or()` string building): by order, and by booking.
  const [byOrder, byBooking] = await Promise.all([
    anchor.orderId
      ? db.from("tenant_promo_redemptions").select(cols).eq("order_id", anchor.orderId).in("status", live)
      : Promise.resolve({ data: [] as RedemptionRow[], error: null }),
    db.from("tenant_promo_redemptions").select(cols).eq("booking_id", anchor.bookingId).in("status", live),
  ]);
  if (byOrder.error || byBooking.error) {
    logServerError("promos.talentCancel/read", byOrder.error ?? byBooking.error);
    return null;
  }
  const seen = new Map<string, RedemptionRow>();
  for (const r of [...((byOrder.data ?? []) as RedemptionRow[]), ...((byBooking.data ?? []) as RedemptionRow[])]) {
    seen.set(r.id, r);
  }
  return [...seen.values()];
}

async function loadCustomer(db: SupabaseClient, tenantId: string, customerId: string): Promise<CustomerRow | null> {
  const { data, error } = await db
    .from("customers")
    .select("display_name, user_id")
    .eq("id", customerId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (error) {
    logServerError("promos.talentCancel/customer", error);
    return null;
  }
  return (data as CustomerRow | null) ?? null;
}

export async function makeGoodOnTalentCancel(
  db: SupabaseClient,
  input: { tenantId: string; bookingId: string; orderId: string | null },
  deps: MakeGoodDeps = DEPS,
): Promise<MakeGoodOutcome> {
  try {
    const rows = await liveRedemptions(db, { orderId: input.orderId, bookingId: input.bookingId });
    if (!rows) return { ok: false, released: 0, codes: [] };
    let ok = true;
    let released = 0;
    const codes: string[] = [];
    for (const row of rows) {
      const customer = row.customer_id ? await loadCustomer(db, input.tenantId, row.customer_id) : null;
      const res = await deps.handleCancellation(db, {
        redemptionId: row.id,
        event: { kind: "talent_cancel" },
        clientFirstName: firstNameOf(customer?.display_name),
        now: deps.now(),
      });
      if (!res.ok) {
        ok = false;
        logServerError("promos.talentCancel/release", `redemption ${row.id}: ${res.reason ?? "unknown"}`);
        continue;
      }
      if (!res.already) released += 1;
      if (!res.reissueCode) {
        // Released, but no code: the client is owed one. Logged for a human.
        ok = false;
        logServerError("promos.talentCancel/reissue", `redemption ${row.id}: released without a make-good code`);
        continue;
      }
      codes.push(res.reissueCode);
      if (customer?.user_id) {
        const msg = makeGoodMessage(res.reissueCode);
        await deps.notify([customer.user_id], {
          tenantId: input.tenantId,
          kind: "booking",
          surface: "client",
          title: msg.title,
          body: msg.body,
          targetPayload: { bookingId: input.bookingId, promoCode: res.reissueCode, reason: "talent_cancel_make_good" },
          originEventId: null,
          originKind: "promo_make_good",
        });
      }
    }
    return { ok, released, codes };
  } catch (err) {
    logServerError("promos.talentCancel", err);
    return { ok: false, released: 0, codes: [] };
  }
}
