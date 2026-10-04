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

const DAY_MS = 86_400_000;

function serviceKey(title: string | null | undefined): string | null {
  const key = (title ?? "").trim().toLowerCase();
  return key || null;
}

/**
 * A repeat service, read from her own history: a titled service the same client
 * completed at least twice. Its cycle is the median gap between those visits.
 * Nothing is invented: a client with one visit, or untitled visits, has no cycle.
 */
export function repeatServiceCycles(row: TalentClientRow): { title: string; cycleDays: number; lastAt: string }[] {
  const byService = new Map<string, { title: string; times: number[] }>();
  for (const h of row.history ?? []) {
    if ((h.state ?? (h.past ? "completed" : null)) !== "completed") continue;
    const key = serviceKey(h.title);
    const at = Date.parse(h.startsAt);
    if (!key || Number.isNaN(at)) continue;
    const entry = byService.get(key) ?? { title: (h.title ?? "").trim(), times: [] };
    entry.times.push(at);
    byService.set(key, entry);
  }
  const out: { title: string; cycleDays: number; lastAt: string }[] = [];
  for (const { title, times } of byService.values()) {
    if (times.length < 2) continue;
    times.sort((a, b) => a - b);
    const gaps = times.slice(1).map((t, i) => (t - times[i]!) / DAY_MS).sort((a, b) => a - b);
    const mid = Math.floor(gaps.length / 2);
    const cycleDays = gaps.length % 2 ? gaps[mid]! : (gaps[mid - 1]! + gaps[mid]!) / 2;
    if (cycleDays < 1) continue;
    out.push({ title, cycleDays, lastAt: new Date(times[times.length - 1]!).toISOString() });
  }
  return out;
}

/**
 * Due for a refill (prototype mc_clients_follow): the last completed visit of a
 * repeat service is older than that service's cycle, and nothing is booked next.
 */
export function isDueForRefill(row: TalentClientRow, nowIso = new Date().toISOString()): boolean {
  if (row.nextStartsAt && row.nextStartsAt >= nowIso) return false;
  const now = Date.parse(nowIso);
  return repeatServiceCycles(row).some((c) => now - Date.parse(c.lastAt) > c.cycleDays * DAY_MS);
}

/** The tab exists only when she sells something clients come back for. */
export function hasRepeatServices(items: TalentClientRow[]): boolean {
  return items.some((row) => repeatServiceCycles(row).length > 0);
}

export const isFollowUpClient = isDueForRefill;

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
      return (row) => isDueForRefill(row, nowIso);
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
    follow: items.filter((r) => isDueForRefill(r, nowIso)).length,
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
