/**
 * TUL-1415 / TUL-1587 · the guest's front-door request, as the owner's Items / Servicios panel
 * lines. A request carries its lines on the guest message (`metadata.roster_request`); until the
 * owner builds an offer the engine has no lines, so the panel said "no items yet" while the
 * thread showed a request. Engine lines (the real offer) always win; request lines only fill an
 * empty panel. Request-only: no price. Pure.
 */
import type { ContextItemLine } from "@/components/messages-v5/screens/contracts";
import type { ThreadMessage } from "@/lib/messaging/types";

export function rosterRequestItems(messages: readonly Pick<ThreadMessage, "rosterRequest" | "deletedAt">[]): ContextItemLine[] {
  const byEntry = new Map<string, ContextItemLine>();
  for (const m of messages) {
    if (m.deletedAt || !m.rosterRequest) continue;
    for (const l of m.rosterRequest.lines) {
      // A later request for the same service replaces the earlier line.
      byEntry.set(l.entry_id, { id: `request-${l.entry_id}`, name: l.title, sub: l.talent_name, units: String(l.quantity), price: "", proposedBy: "client" });
    }
  }
  return [...byEntry.values()];
}

export function withRosterRequestItems(
  engineLines: readonly ContextItemLine[] | null,
  messages: readonly Pick<ThreadMessage, "rosterRequest" | "deletedAt">[],
): ContextItemLine[] | null {
  if (engineLines && engineLines.length > 0) return [...engineLines];
  const fromRequest = rosterRequestItems(messages);
  return fromRequest.length > 0 ? fromRequest : engineLines ? [...engineLines] : null;
}
