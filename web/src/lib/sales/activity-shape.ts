/**
 * Pure shaping for the Sales combined view. Revenue counts financial
 * order rows only; free bookings/registrations stay visible and not overdue.
 */

export type SalesLocale = "en" | "es" | "fr";

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

export function salesKindLabel(kind: SalesChipKind, locale: "en" | "es" | "fr"): string {
  if (locale === "es") {
    if (kind === "order") return "Pedido";
    if (kind === "booking") return "Reserva";
    if (kind === "reservation") return "Mesa";
    if (kind === "registration") return "Inscripción";
    if (kind === "admission") return "Admisión";
    if (kind === "appointment") return "Cita";
    return "Proyecto";
  }
  if (locale === "fr") {
    if (kind === "order") return "Commande";
    if (kind === "booking") return "Réservation";
    if (kind === "reservation") return "Table";
    if (kind === "registration") return "Inscription";
    if (kind === "admission") return "Admission";
    if (kind === "appointment") return "Rendez-vous";
    return "Projet";
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

/**
 * How a sale reached the ledger — `orders.source_channel`, the only kind in
 * this view that carries one. Bookings/reservations/registrations have no
 * channel column today (confirmed by grep across `database.types.ts`), so
 * their rows carry `sourceChannel: null` and show as "not tracked" rather
 * than a guessed value.
 *
 * The known values are every literal actually passed as `sourceChannel` into
 * `createPurchase` in this worktree (menu, pos, session_picker, ticket_picker,
 * reservation, instant_book) plus `offer`, exercised by
 * `purchase-refusal.test.ts`. An unrecognised channel still renders — as its
 * raw value — rather than disappearing; see `salesChannelLabel`.
 */
export const SALES_CHANNELS = [
  "menu",
  "pos",
  "session_picker",
  "ticket_picker",
  "reservation",
  "instant_book",
  "offer",
] as const;

export type SalesChannel = (typeof SALES_CHANNELS)[number];

const CHANNEL_LABELS: Record<SalesChannel, Record<SalesLocale, string>> = {
  menu: { en: "Menu", es: "Menú", fr: "Menu" },
  pos: { en: "Counter", es: "Mostrador", fr: "Comptoir" },
  session_picker: { en: "Session booking", es: "Reserva de sesión", fr: "Réservation de séance" },
  ticket_picker: { en: "Ticket page", es: "Página de entradas", fr: "Page de billetterie" },
  reservation: { en: "Table reservation", es: "Reserva de mesa", fr: "Réservation de table" },
  instant_book: { en: "Instant book", es: "Reserva instantánea", fr: "Réservation instantanée" },
  offer: { en: "Offer", es: "Oferta", fr: "Offre" },
};

/** Raw value shown verbatim when the channel is not one of the known ones — never hidden. */
export function salesChannelLabel(channel: string, locale: SalesLocale): string {
  const known = CHANNEL_LABELS[channel as SalesChannel];
  return known ? known[locale] : channel;
}

export function filterSalesRowsByChannel<T extends { sourceChannel: string | null }>(
  rows: readonly T[],
  channel: string,
): T[] {
  if (!channel || channel === "all") return [...rows];
  return rows.filter((row) => row.sourceChannel === channel);
}

/** The distinct channels actually present in a set of rows, for building filter chips from data rather than a guessed list. */
export function distinctChannels<T extends { sourceChannel: string | null }>(
  rows: readonly T[],
): string[] {
  const seen = new Set<string>();
  for (const row of rows) {
    if (row.sourceChannel) seen.add(row.sourceChannel);
  }
  return [...seen].sort();
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

// ── Filter addresses ────────────────────────────────────────────────────

/** The Sales list itself, with nothing selected. Every chip's address starts here. */
export function salesListPath(tenantSlug: string): string {
  return `/${tenantSlug}/admin/sales`;
}

/**
 * The address a filter chip navigates to. ALWAYS ABSOLUTE, and that is the
 * whole point of this function existing.
 *
 * THE DEFECT IT REPLACES. The page built chip addresses as a bare query
 * string and returned `""` when the resulting filter set was empty, which is
 * exactly the reset chips: "All kinds" and "All channels". An empty `href`
 * is not "no query", it is "this document":
 *
 *     new URL("", "https://host/acme/admin/sales?kind=order&channel=pos").href
 *       === "https://host/acme/admin/sales?kind=order&channel=pos"
 *
 * so both reset chips resolved back to the filtered page they were meant to
 * clear and nothing happened when a person clicked them. Next's own
 * `resolveHref` does not save it either: it answers `""` with the raw route
 * pattern, `/[tenantSlug]/admin/sales`, brackets and all.
 *
 * Returning the path even when there is no query is therefore not tidiness.
 * It is the difference between a reset that resets and a dead control.
 */
export function salesFilterHref(input: {
  tenantSlug: string;
  kind: SalesKindFilter;
  channel: string;
}): string {
  const params = new URLSearchParams();
  if (input.kind !== "all") params.set("kind", input.kind);
  if (input.channel && input.channel !== "all") params.set("channel", input.channel);
  const qs = params.toString();
  const path = salesListPath(input.tenantSlug);
  return qs ? `${path}?${qs}` : path;
}

/**
 * The channel chips to offer: the channels present in the rows, plus the one
 * currently selected even when it is present in none of them.
 *
 * WHY THE SELECTED ONE IS FORCED IN. Pick a channel, then pick a kind that
 * has no rows on that channel, and the row set is empty, so the channels
 * computed from it are empty, so the whole channel strip used to disappear
 * while `?channel=` was still applied. The list was empty, the reason was
 * off screen, and the control that would undo it was gone. A filter a person
 * cannot see is a filter a person cannot remove.
 */
export function salesChannelChips(available: readonly string[], selected: string): string[] {
  const chips = new Set(available);
  if (selected && selected !== "all") chips.add(selected);
  return [...chips].sort();
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
