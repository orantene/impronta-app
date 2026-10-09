/**
 * Grokbot P-4/P-6 (2026-10-08): the "Reservar cita" bar must OPEN booking, not only scroll to the
 * menu. PURE decision plus the tap runner; the DOM and the open-intent queue (TUL-246) are injected.
 *
 * TUL-516 W3-4: the sticky bar never jumps to a next-free slot (that skipped choose and opened
 * step 2 with a service already picked). It also never opens chat — when nothing is bookable it
 * scrolls to the menu so the visitor picks a service.
 *
 * - one bookable service: open that offering's sheet at choose (same as `#book`);
 * - several bookable services: scroll to the menu ("Elige tu servicio");
 * - none: scroll to the menu.
 */
import { openIntentFor, type BookEntry } from "./book-entry";
import type { OpenIntent } from "./open-intent-queue";

export type StickyBarAction = "open-sheet" | "scroll";

export function stickyBarAction(bookableCount: number): StickyBarAction {
  if (bookableCount === 1) return "open-sheet";
  return "scroll";
}

export function stickyBarIntent(action: StickyBarAction, entry: BookEntry): OpenIntent | null {
  if (action === "open-sheet") return entry.kind === "sheet" ? openIntentFor("book", entry) : null;
  return null;
}

export function runStickyBarTap(input: {
  menuInView: boolean;
  bookableCount: number;
  entry: BookEntry;
  request: (intent: OpenIntent) => void;
  scroll: () => void;
}): StickyBarAction {
  if (input.menuInView) {
    input.scroll();
    return "scroll";
  }
  const action = stickyBarAction(input.bookableCount);
  const intent = stickyBarIntent(action, input.entry);
  if (!intent) {
    input.scroll();
    return "scroll";
  }
  input.request(intent);
  return action;
}
