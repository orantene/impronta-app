/**
 * Desk queue filters + search (pure). Shared by shell and journey tests.
 */

import type { HqQueueRow } from "@/lib/support/load-hq";
import { hqQueueSearchHaystack } from "@/lib/support/support-hq-presentation";

export type DeskViewId =
  | "needs_you"
  | "unassigned"
  | "mine"
  | "waiting_customer"
  | "escalated"
  | "resolved_today"
  | "all_open";

export const DESK_VIEWS: ReadonlyArray<{ id: DeskViewId; labelKey: string }> = [
  { id: "needs_you", labelKey: "deskViewNeedsYou" },
  { id: "unassigned", labelKey: "deskViewUnassigned" },
  { id: "mine", labelKey: "deskViewMine" },
  { id: "waiting_customer", labelKey: "deskViewWaitingCustomer" },
  { id: "escalated", labelKey: "deskViewEscalated" },
  { id: "resolved_today", labelKey: "deskViewResolvedToday" },
  { id: "all_open", labelKey: "deskViewAllOpen" },
];

export function matchesDeskView(
  row: HqQueueRow,
  view: DeskViewId,
  selfUserId: string | null,
): boolean {
  const t = row.ticket;
  switch (view) {
    case "needs_you":
      return t.status === "open" && t.waitingOn === "support";
    case "unassigned":
      return t.status === "open" && !t.assigneeUserId;
    case "mine":
      return t.status === "open" && Boolean(selfUserId) && t.assigneeUserId === selfUserId;
    case "waiting_customer":
      return t.status === "open" && t.waitingOn === "requester";
    case "escalated":
      return t.status === "open" && Boolean(t.escalatedAt);
    case "resolved_today": {
      if (t.status !== "resolved" || !t.resolvedAt) return false;
      return Date.now() - new Date(t.resolvedAt).getTime() < 864e5;
    }
    case "all_open":
      return t.status === "open";
    default:
      return true;
  }
}

export function filterDeskQueue(
  rows: HqQueueRow[],
  view: DeskViewId,
  query: string,
  selfUserId: string | null,
): HqQueueRow[] {
  const q = query.trim().toLowerCase();
  return rows.filter((row) => {
    if (!matchesDeskView(row, view, selfUserId)) return false;
    if (!q) return true;
    return hqQueueSearchHaystack(row).includes(q);
  });
}

export function countDeskView(
  rows: HqQueueRow[],
  view: DeskViewId,
  selfUserId: string | null,
): number {
  return rows.reduce((n, row) => n + (matchesDeskView(row, view, selfUserId) ? 1 : 0), 0);
}
