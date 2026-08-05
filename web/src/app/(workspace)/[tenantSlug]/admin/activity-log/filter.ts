/**
 * Pure filter logic for the Workspace Activity Log table.
 *
 * Extracted from the client component so the matching rules (search across
 * actor / summary / action / target / IP / country, category, actor kind and
 * date window) are unit-testable without a DOM.
 */

export type DateRangeKey = "all" | "24h" | "7d" | "30d";

export interface AuditFilterRow {
  actorLabel: string | null;
  actorKind: string;
  action: string;
  category: string;
  targetLabel: string | null;
  targetId: string | null;
  summary: string | null;
  ipAddress: string | null;
  country: string | null;
  createdAtIso: string;
}

export interface AuditFilterState {
  search: string;
  category: string;
  actorKind: string;
  dateRange: DateRangeKey;
}

const DAY_MS = 86_400_000;

export function dayLimitFor(range: DateRangeKey): number | null {
  switch (range) {
    case "24h":
      return 1;
    case "7d":
      return 7;
    case "30d":
      return 30;
    default:
      return null;
  }
}

export function isWithinDays(iso: string, days: number | null, now = Date.now()): boolean {
  if (!days) return true;
  const at = new Date(iso).getTime();
  if (Number.isNaN(at)) return false;
  return now - at <= days * DAY_MS;
}

/** Fields the free-text search box matches against. */
export function searchableText<T extends AuditFilterRow>(row: T): string {
  return [
    row.actorLabel,
    row.summary,
    row.action,
    row.targetLabel,
    row.targetId,
    row.ipAddress,
    row.country,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

export function matchesAuditFilters<T extends AuditFilterRow>(
  row: T,
  filters: AuditFilterState,
  now = Date.now(),
): boolean {
  if (!isWithinDays(row.createdAtIso, dayLimitFor(filters.dateRange), now)) return false;
  if (filters.category !== "all" && row.category !== filters.category) return false;
  if (filters.actorKind !== "all" && row.actorKind !== filters.actorKind) return false;
  const q = filters.search.trim().toLowerCase();
  if (q && !searchableText(row).includes(q)) return false;
  return true;
}

export function filterAuditRows<T extends AuditFilterRow>(
  rows: T[],
  filters: AuditFilterState,
  now = Date.now(),
): T[] {
  return rows.filter((row) => matchesAuditFilters(row, filters, now));
}
