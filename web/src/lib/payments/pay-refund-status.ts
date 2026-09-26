/**
 * `/pay/{code}` reads `payment_links.status`, which has no `refunded` value in
 * schema. After a full Stripe refund the link stays `paid` while `orders.status`
 * / `agency_bookings.payment_status` flip to refunded. Consult those so the
 * public page does not keep showing Paid.
 */
export function resolvePaidLinkDisplayStatus(input: {
  orderStatus: string | null | undefined;
  bookingPaymentStatus: string | null | undefined;
}): "paid" | "refunded" {
  if (input.orderStatus === "refunded") return "refunded";
  if (input.bookingPaymentStatus === "refunded") return "refunded";
  return "paid";
}
