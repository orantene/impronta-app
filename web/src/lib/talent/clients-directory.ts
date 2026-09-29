import type { TalentClientRow } from "@/lib/talent/clients-merge";

/** Filter chips on mc_clients (prototype MCF keys). */
export type ClientsFilter = "all" | "upcoming" | "outstanding" | "follow" | "fresh";

export type ClientsRowAction =
  | { kind: "review_request"; href: string }
  | { kind: "view_hold"; href: string }
  | { kind: "view_appointment"; href: string }
  | { kind: "request_payment"; href: string | null }
  | { kind: "book_appointment"; href: string };

export function clientInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0] ?? ""}${parts[parts.length - 1]![0] ?? ""}`.toUpperCase();
}

export function matchesClientsSearch(row: TalentClientRow, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const hay = [row.name, row.phone ?? "", row.email ?? ""].join(" ").toLowerCase();
  return hay.includes(q);
}

export function isUpcomingClient(row: TalentClientRow, nowIso = new Date().toISOString()): boolean {
  if (!row.nextStartsAt) return false;
  if (row.nextStatus === "requested") return false;
  return row.nextStartsAt >= nowIso;
}

export function isOutstandingClient(row: TalentClientRow): boolean {
  return (row.amountOwedCents ?? 0) > 0;
}

export function isNewClient(row: TalentClientRow): boolean {
  // Prototype MCF.fresh: done === 0 (may still have a request/hold booked).
  return row.completedCount === 0;
}

/**
 * Follow-up needs a rebooking interval on the service (prototype mc_clients_follow).
 * Until offerings expose intervals we never invent nudges — filter stays empty.
 */
export function isFollowUpClient(_row: TalentClientRow): boolean {
  return false;
}

export function clientsFilterPredicate(
  filter: ClientsFilter,
  nowIso = new Date().toISOString(),
): (row: TalentClientRow) => boolean {
  switch (filter) {
    case "upcoming":
      return (row) => isUpcomingClient(row, nowIso);
    case "outstanding":
      return isOutstandingClient;
    case "follow":
      return isFollowUpClient;
    case "fresh":
      return isNewClient;
    case "all":
    default:
      return () => true;
  }
}

export function countClientsByFilter(
  items: TalentClientRow[],
  nowIso = new Date().toISOString(),
): Record<ClientsFilter, number> {
  return {
    all: items.length,
    upcoming: items.filter((r) => isUpcomingClient(r, nowIso)).length,
    outstanding: items.filter(isOutstandingClient).length,
    follow: items.filter(isFollowUpClient).length,
    fresh: items.filter(isNewClient).length,
  };
}

export function filterClientsDirectory(opts: {
  items: TalentClientRow[];
  filter: ClientsFilter;
  query: string;
  nowIso?: string;
}): TalentClientRow[] {
  const nowIso = opts.nowIso ?? new Date().toISOString();
  const pred = clientsFilterPredicate(opts.filter, nowIso);
  return opts.items.filter((row) => pred(row) && matchesClientsSearch(row, opts.query));
}

/** One relevant row CTA — never "Book again" for someone with no completed work. */
export function clientsRowAction(row: TalentClientRow): ClientsRowAction {
  const bookingHref = row.nextBookingHref;
  if (row.nextStatus === "requested" && bookingHref) {
    return { kind: "review_request", href: bookingHref };
  }
  if (row.nextStatus === "hold" && bookingHref) {
    return { kind: "view_hold", href: bookingHref };
  }
  if (row.nextStartsAt && bookingHref && row.nextStatus !== "requested") {
    return { kind: "view_appointment", href: bookingHref };
  }
  if (isOutstandingClient(row)) {
    return { kind: "request_payment", href: row.conversationHref };
  }
  return { kind: "book_appointment", href: "/talent/calendar" };
}

export type ClientVisitState = "completed" | "confirmed" | "hold" | "requested";

/**
 * What one appointment means for a client row. Being in the past is not the
 * same as being done: a past hold or request never counts as completed work,
 * and an appointment still running today is still "next", not history.
 */
export function clientVisit(opts: {
  status: string | null | undefined;
  startsAt: string | null;
  endsAt?: string | null;
  nowIso: string;
}): { state: ClientVisitState | null; done: boolean; upcoming: boolean } {
  const s = (opts.status ?? "").toLowerCase();
  const next = mapBookingStatusToNext(s);
  const state: ClientVisitState | null =
    s === "completed" || s === "done" ? "completed" : next;
  if (!state || !opts.startsAt) return { state, done: false, upcoming: false };
  const end = opts.endsAt || opts.startsAt;
  const finished = end < opts.nowIso;
  const done = state === "completed" || (state === "confirmed" && finished);
  const upcoming = !done && !finished;
  return { state: done ? "completed" : state, done, upcoming };
}

export function mapBookingStatusToNext(
  status: string | null | undefined,
): TalentClientRow["nextStatus"] {
  const s = (status ?? "").toLowerCase();
  if (s === "requested" || s === "request") return "requested";
  if (s === "hold" || s === "held" || s === "on_hold") return "hold";
  if (!s || s === "cancelled" || s === "canceled" || s === "hold_expired") return null;
  return "confirmed";
}
