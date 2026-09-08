/**
 * Pure shaping for the Sales combined view. Revenue counts financial
 * order rows only; free bookings/registrations stay visible and not overdue.
 */

export type SalesKindFilter = "all" | "order" | "booking" | "reservation" | "registration";

export function salesKindLabel(kind: Exclude<SalesKindFilter, "all">, locale: "en" | "es"): string {
  if (locale === "es") {
    if (kind === "order") return "Pedido";
    if (kind === "booking") return "Reserva";
    if (kind === "reservation") return "Mesa";
    return "Inscripción";
  }
  if (kind === "order") return "Order";
  if (kind === "booking") return "Booking";
  if (kind === "reservation") return "Reservation";
  return "Registration";
}

export function filterSalesRows<T extends { kind: string }>(
  rows: readonly T[],
  kind: SalesKindFilter,
): T[] {
  if (kind === "all") return [...rows];
  return rows.filter((row) => row.kind === kind);
}
