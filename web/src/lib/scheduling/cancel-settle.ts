import "server-only";

import { logServerError } from "@/lib/server/safe-error";
import { settleMoneyOnCancel } from "@/lib/talent-agenda/cancel-money";

type Admin = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from: (table: string) => any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  rpc?: (fn: string, args: Record<string, unknown>) => any;
};

/**
 * The money follow-up EVERY cancel entry point owes after `cancelBookingSet`
 * accepted: open pay links come down (their Checkout sessions expire first),
 * an unpaid order is voided, a paid one is left for the refund. The RPC cancels
 * the booking rows only, so without this a cancelled visit stays payable.
 * Idempotent; non-fatal for the caller (logs when cleanup is incomplete).
 */
export async function settleCancelledBookingMoney(
  admin: Admin,
  input: { tenantId: string; bookingId: string; orderId: string | null | undefined },
) {
  const { cancelPaymentLink } = await import("@/lib/payments/links");
  const money = await settleMoneyOnCancel(
    admin,
    { tenantId: input.tenantId, orderId: input.orderId ?? null },
    { cancelPaymentLink },
  );
  if (!money.ok) logServerError("scheduling.cancel.money", `booking ${input.bookingId}: payment cleanup incomplete`);
  return money;
}
