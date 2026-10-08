/**
 * Grokbot P-4/P-6 (2026-10-08): the "Reservar cita" bar must OPEN booking, not only scroll to the
 * menu. PURE decision plus the tap runner; the DOM, the open-intent queue (TUL-246) and the
 * next-free-slot opener are injected.
 *
 * - exactly one bookable service: open its booking sheet (queued until the sheet has hydrated);
 * - several: open the service picker (the guest dock, same as `#book` with several services);
 * - none: keep the old scroll to the menu.
 */
import { openIntentFor, type BookEntry } from "./book-entry";
import type { NextSlot } from "./next-free-slot";
import type { OpenIntent } from "./open-intent-queue";

export type StickyBarAction = "open-sheet" | "open-chooser" | "scroll";

export function stickyBarAction(bookableCount: number): StickyBarAction {
  if (bookableCount === 1) return "open-sheet";
  if (bookableCount > 1) return "open-chooser";
  return "scroll";
}

export function stickyBarIntent(action: StickyBarAction, entry: BookEntry): OpenIntent | null {
  if (action === "open-sheet") return entry.kind === "sheet" ? openIntentFor("book", entry) : null;
  if (action === "open-chooser") return { channel: "chat" };
  return null;
}

export function runStickyBarTap(input: {
  menuInView: boolean;
  bookableCount: number;
  entry: BookEntry;
  slot: NextSlot | null;
  openAtSlot: (slot: NextSlot | null) => boolean;
  request: (intent: OpenIntent) => void;
  scroll: () => void;
}): StickyBarAction | "open-at-slot" {
  if (input.menuInView) {
    input.scroll();
    return "scroll";
  }
  if (input.openAtSlot(input.slot)) return "open-at-slot";
  const action = stickyBarAction(input.bookableCount);
  const intent = stickyBarIntent(action, input.entry);
  if (!intent) {
    input.scroll();
    return "scroll";
  }
  input.request(intent);
  return action;
}
