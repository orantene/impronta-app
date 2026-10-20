/**
 * TUL-1334: pure helpers for the reservation item (the offering a table
 * booking is sold as).
 */

export type ReserveRefusalFromPurchase = "sold_out" | "capacity_unavailable" | "offering_not_published" | "engine_error";

/**
 * Map the purchase pipeline's refusal onto the reservation refusal a guest or a
 * host sees. An unpublished reservation item is a setup problem with its own
 * message, not a generic engine error. Unknown reasons stay `engine_error`.
 */
export function refusalFromPurchaseReason(reason: string): ReserveRefusalFromPurchase {
  if (reason === "sold_out") return "sold_out";
  if (reason === "capacity_unavailable") return "capacity_unavailable";
  if (reason === "offering_not_published") return "offering_not_published";
  return "engine_error";
}

export type ReservationItemState = "unset" | "missing" | "unpublished" | "ready";

/** What the Reservations settings should tell staff about the chosen item. */
export function reservationItemState(
  offeringId: string | null,
  offerings: ReadonlyArray<{ id: string; status: string }>,
): ReservationItemState {
  if (!offeringId) return "unset";
  const o = offerings.find((x) => x.id === offeringId);
  if (!o) return "missing";
  return o.status === "published" ? "ready" : "unpublished";
}
