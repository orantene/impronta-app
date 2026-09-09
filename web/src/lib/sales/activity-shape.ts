/**
 * Pure shaping for the Sales combined view. Revenue counts financial
 * order rows only; free bookings/registrations stay visible and not overdue.
 */

export type SalesKindFilter =
  | "all"
  | "order"
  | "booking"
  | "reservation"
  | "registration"
  | "admission"
  | "appointment"
  | "project";

export type SalesChipKind = Exclude<SalesKindFilter, "all">;

export function salesKindLabel(kind: SalesChipKind, locale: "en" | "es"): string {
  if (locale === "es") {
    if (kind === "order") return "Pedido";
    if (kind === "booking") return "Reserva";
    if (kind === "reservation") return "Mesa";
    if (kind === "registration") return "Inscripción";
    if (kind === "admission") return "Admisión";
    if (kind === "appointment") return "Cita";
    return "Proyecto";
  }
  if (kind === "order") return "Order";
  if (kind === "booking") return "Booking";
  if (kind === "reservation") return "Reservation";
  if (kind === "registration") return "Registration";
  if (kind === "admission") return "Admission";
  if (kind === "appointment") return "Appointment";
  return "Project booking";
}

export const SALES_TYPE_CHIPS: readonly SalesChipKind[] = [
  "order",
  "appointment",
  "registration",
  "admission",
  "reservation",
  "project",
];

export function filterSalesRows<T extends { kind: string }>(
  rows: readonly T[],
  kind: SalesKindFilter,
): T[] {
  if (kind === "all") return [...rows];
  return rows.filter((row) => row.kind === kind);
}

export type SalesMoneyPresentation = {
  /** What the summary shows for amount owed. */
  amountDueLabel: string | null;
  /** True when the row must never render as an unpaid invoice. */
  treatAsFree: boolean;
};

/**
 * N17 — a free registration never renders as an unpaid invoice.
 * Zero-total confirmed/paid rows show "Free", never "Unpaid" / overdue.
 */
export function salesMoneyPresentation(input: {
  kind: string;
  totalCents: number;
  status: string;
  locale?: "en" | "es";
}): SalesMoneyPresentation {
  const free =
    input.totalCents === 0 &&
    (input.kind === "registration" ||
      input.kind === "admission" ||
      input.status === "paid" ||
      input.status === "confirmed" ||
      input.status === "fulfilled");
  if (free) {
    return {
      treatAsFree: true,
      amountDueLabel: input.locale === "es" ? "Gratis" : "Free",
    };
  }
  if (input.totalCents <= 0) {
    return { treatAsFree: true, amountDueLabel: input.locale === "es" ? "Gratis" : "Free" };
  }
  return { treatAsFree: false, amountDueLabel: null };
}

export function salesSourceHref(input: {
  tenantSlug: string;
  kind: string;
  sourcePath: string | null;
}): string | null {
  if (!input.sourcePath) return null;
  if (input.sourcePath.startsWith("/")) return input.sourcePath;
  return `/${input.tenantSlug}/admin/${input.sourcePath}`;
}
