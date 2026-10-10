/**
 * Browser singleton for the open-intent queue (TUL-246). Client-only: nothing
 * here runs at import time, so server components may import the type surface.
 *
 * Producers: the talent-site contact bridge (`requestTalentOpen`).
 * Targets announce once their window listener is attached: the guest dock and
 * the inquiry form sheet announce "chat", the catalog booking sheet "sheet".
 */
import { rememberBookingSheetOpener } from "@/components/public-booking/booking-sheet-opener";
import {
  createOpenIntentQueue,
  type OpenChannel,
  type OpenIntent,
} from "@/lib/talent-site/open-intent-queue";

type Queue = ReturnType<typeof createOpenIntentQueue>;
let queue: Queue | null = null;

function dispatchIntent(intent: OpenIntent): void {
  if (typeof window === "undefined") return;
  if (intent.channel === "sheet") {
    // GRK-097: capture CTA before the sheet mounts (queue may fire after click).
    rememberBookingSheetOpener();
    window.dispatchEvent(new CustomEvent(intent.eventName, { detail: intent.detail }));
    return;
  }
  window.dispatchEvent(new Event("tulala:open-guest-chat"));
}

function getQueue(): Queue {
  queue ??= createOpenIntentQueue({ dispatch: dispatchIntent });
  return queue;
}

export function requestTalentOpen(intent: OpenIntent): void {
  getQueue().request(intent);
}

/** Call from an effect right after the listener is attached; return the result as cleanup. */
export function announceTalentOpenReady(channel: OpenChannel): () => void {
  return getQueue().announceReady(channel);
}
