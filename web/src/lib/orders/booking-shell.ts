import "server-only";

/**
 * The order's ONE booking shell: found if it exists, created if it does not.
 *
 * WHY A SHELL EXISTS AT ALL. `booking_transactions` carries the money spine,
 * and `trg_booking_transactions_scope` refuses any row whose `booking_id` does
 * not resolve to an `agency_bookings` row with a tenant. So a payment cannot be
 * recorded without a booking behind it. The web purchase pipeline in
 * `lib/orders/purchase.ts` makes the same accommodation and explains it in
 * full: the order is the commercial record, the booking is the operations
 * anchor the money spine still requires.
 *
 * WHY THIS LIVES HERE RATHER THAN IN THE POS FILE THAT USED TO OWN IT. It was
 * private to `lib/pos/collection.ts`, and the card path called it while the
 * CASH path returned earlier and never did. `settleAtDoor` then inserted a
 * `booking_transactions` row with a null `booking_id`, the trigger refused it,
 * and collection came back "Could not record the cash." — so a cashier could
 * take an $18 note and the order stayed unpaid with the full amount still
 * outstanding. Every door settlement was affected, not only POS cash:
 * `_door-actions.ts` settles event tickets through the same function.
 *
 * The card path remembering and the cash path forgetting is the whole defect,
 * so the fix is not to add a second call — it is to put the shell where the
 * `booking_transactions` insert is, and let no caller be responsible for
 * remembering.
 *
 * WHY FIND-OR-CREATE AND NOT CREATE. Collection is called once PER ALLOCATION,
 * not once per sale — a split tab is two calls, a card that gets declined and
 * re-run is two calls, an operator who taps Card twice is two calls. A bare
 * insert therefore minted a fresh `agency_bookings` row each time, and every
 * surface that lists or sums bookings counted one sale two or three times.
 * Nothing errored; the numbers were just wrong.
 *
 * THE UNIQUE-VIOLATION BRANCH IS NOT DEFENSIVE PADDING. Two cashiers collecting
 * the same tab on two devices can both read "no booking" and both insert.
 * `agency_bookings_order_uniq` makes the loser fail loudly instead of quietly
 * duplicating, and the only correct response to that failure is to re-read: the
 * winner's row is the shell we wanted. Treating it as an error would refuse a
 * payment that has nothing wrong with it.
 */

import { logServerError } from "@/lib/server/safe-error";

type Admin = {
  // Tests inject a fake PostgREST builder. Same seam as expire-orders.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from: (table: string) => any;
};

/** Whatever the till knows about the buyer. All optional: a walk-in is anonymous. */
export type BookingShellContact = {
  readonly email?: string | null;
  readonly phone?: string | null;
  readonly displayName?: string | null;
};

export type BookingShellResult = { ok: true; bookingId: string } | { ok: false };

export async function bookingShellForOrder(
  admin: Admin,
  input: {
    tenantId: string;
    orderId: string;
    currency: string;
    revenue: number;
    contact?: BookingShellContact;
  },
): Promise<BookingShellResult> {
  const { data: linked, error: linkedErr } = await admin
    .from("order_lines")
    .select("booking_id, booking_kind")
    .eq("order_id", input.orderId)
    .eq("tenant_id", input.tenantId)
    .eq("booking_kind", "agency_booking")
    .not("booking_id", "is", null)
    .limit(1)
    .maybeSingle();
  if (linkedErr) {
    logServerError("orders.bookingShellForOrder/linked", linkedErr);
    return { ok: false };
  }
  const linkedId = (linked as { booking_id?: string } | null)?.booking_id;
  if (linkedId) return { ok: true, bookingId: linkedId };

  const find = async (): Promise<string | null | false> => {
    const { data, error } = await admin
      .from("agency_bookings")
      .select("id")
      .eq("order_id", input.orderId)
      .eq("tenant_id", input.tenantId)
      .maybeSingle();
    if (error) {
      logServerError("orders.bookingShellForOrder/lookup", error);
      return false;
    }
    return (data as { id: string } | null)?.id ?? null;
  };

  const existing = await find();
  if (existing === false) return { ok: false };
  if (existing) return { ok: true, bookingId: existing };

  const { data: created, error: insErr } = await admin
    .from("agency_bookings")
    .insert({
      tenant_id: input.tenantId,
      tenant_id_snapshot: input.tenantId,
      // Stamped BEFORE the insert on purpose, exactly as the web pipeline does:
      // `bookings_write_order` fires AFTER INSERT and returns early when
      // `order_id` is already present, so setting it here is what stops the
      // trigger writing a SECOND order for the order we are collecting.
      order_id: input.orderId,
      source_inquiry_id: null,
      title: "POS sale",
      status: "confirmed",
      contact_email: input.contact?.email ?? null,
      contact_phone: input.contact?.phone ?? null,
      contact_name: input.contact?.displayName ?? null,
      total_client_revenue: input.revenue,
      currency_code: input.currency,
    })
    .select("id")
    .single();
  if (!insErr && created) return { ok: true, bookingId: (created as { id: string }).id };

  // 23505 is the race, not a bug. Anything else is.
  const raced = (insErr as { code?: string } | null)?.code === "23505";
  if (!raced) {
    logServerError("orders.bookingShellForOrder/insert", insErr);
    return { ok: false };
  }
  const winner = await find();
  if (!winner) {
    logServerError(
      "orders.bookingShellForOrder/insert",
      `order ${input.orderId}: agency_bookings insert hit the order uniqueness index, `
        + `but no booking for that order could then be read back.`,
    );
    return { ok: false };
  }
  return { ok: true, bookingId: winner };
}
