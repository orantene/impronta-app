import "server-only";

import { deliverTicketsForOrder } from "@/lib/events/ticket-delivery";
import { mintAdmissionsForPaidOrder, type MintOnPaidCtx } from "@/lib/events/mint-on-paid";
import { logServerError } from "@/lib/server/safe-error";

/**
 * Mint, then mail. The `onOrderPaid` composition every ticket-selling path
 * uses (Stripe webhook, POS counter, door settle), so a paid order that
 * produced admissions also produced the e-mail that carries them.
 *
 * Mint failures still surface (they are what `admissions_mint_shortfall`
 * exists for); a delivery failure never does — `deliverTicketsForOrder`
 * returns a typed result and logs, and the claim it takes makes the
 * webhook's retry a no-op for what already went out.
 */
export async function mintAndDeliverForPaidOrder(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: any,
  ctx: MintOnPaidCtx,
  opts: { locale?: string | null } = {},
): Promise<void> {
  const minted = await mintAdmissionsForPaidOrder(admin, ctx);
  if (minted.rowsInserted === 0 && minted.linesMinted === 0) return;
  const delivered = await deliverTicketsForOrder(admin, {
    tenantId: ctx.tenantId,
    orderId: ctx.orderId,
    locale: opts.locale ?? null,
  });
  if (!delivered.ok && delivered.reason !== "channel_unavailable") {
    logServerError("events.mintAndDeliver", `order ${ctx.orderId}: ${delivered.reason}`);
  }
}
