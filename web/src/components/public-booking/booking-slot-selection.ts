/**
 * TUL-232: the booking sheet's decisions when it is opened AT a slot (`detail.slotStart`).
 * Pure, so they are testable without React. Live mode only; a slot is never persisted.
 */

import type { BookingDraft } from "./booking-draft-store";
import { formatClock, ymdInTimezone } from "./catalog-booking-logic";
import type { CatalogTakenSlotNotice } from "./catalog-taken-slot";

type SheetStep = "choose" | "when" | "who" | "done";
type LiveDay = { key: string; starts: string[] };

export type SlotSelection =
  | { kind: "selected"; dayIndex: number; start: string }
  | { kind: "day"; dayIndex: number; notice: true }
  | { kind: "first"; dayIndex: number; notice: true }
  | { kind: "none" };

const sameInstant = (a: string, b: string) => {
  const x = Date.parse(a);
  return Number.isFinite(x) && x === Date.parse(b);
};

/**
 * Where the requested slot lands once the live slots for the CURRENT total duration are in.
 * `liveDays` already holds only starts that fit that duration (the fetch projects it), so a slot
 * that stopped fitting after add-ons is simply absent and falls back like a taken one.
 */
export function resolveSlotSelection(input: {
  slotStart: string;
  liveDays: readonly LiveDay[];
  timezone: string;
}): SlotSelection {
  const withSlots = input.liveDays.findIndex((d) => d.starts.length > 0);
  if (withSlots < 0) return { kind: "none" };
  for (let i = 0; i < input.liveDays.length; i += 1) {
    const hit = input.liveDays[i]!.starts.find((s) => sameInstant(s, input.slotStart));
    if (hit) return { kind: "selected", dayIndex: i, start: hit };
  }
  const wantedKey = ymdInTimezone(input.slotStart, input.timezone);
  const sameDay = input.liveDays.findIndex((d) => d.key === wantedKey && d.starts.length > 0);
  if (sameDay >= 0) return { kind: "day", dayIndex: sameDay, notice: true };
  return { kind: "first", dayIndex: withSlots, notice: true };
}

/** The existing taken-slot wording (DS-4 style), en + es. */
export function slotGoneMessage(locale: string): string {
  return locale.toLowerCase().startsWith("es")
    ? "Ese horario ya no está disponible. Elige otro:"
    : "That time is no longer available, pick another:";
}

export type SlotArrivalPlan = {
  dayIndex: number;
  time: string | null;
  liveStarts: string | null;
  notice: CatalogTakenSlotNotice | null;
};

/** State to apply after the first live fetch of an opened-at-slot sheet; null = no change. */
export function slotArrivalPlan(
  slotStart: string | null,
  liveDays: readonly LiveDay[],
  timezone: string,
  locale: string,
): SlotArrivalPlan | null {
  if (!slotStart) return null;
  const sel = resolveSlotSelection({ slotStart, liveDays, timezone });
  if (sel.kind === "none") return null;
  if (sel.kind === "selected") {
    return {
      dayIndex: sel.dayIndex,
      time: formatClock(sel.start, timezone, locale),
      liveStarts: sel.start,
      notice: null,
    };
  }
  return {
    dayIndex: sel.dayIndex,
    time: null,
    liveStarts: null,
    notice: { message: slotGoneMessage(locale), lostStarts: slotStart },
  };
}

export type SheetOpening = {
  /** The slot to resolve once live slots load; null when none applies. */
  slot: string | null;
  time: string | null;
  liveStarts: string | null;
  step: SheetStep;
};

/**
 * What the sheet starts from on open. Without `slotStart` this is exactly the previous
 * behaviour. With one (live mode), the slot beats the draft's time; options come first.
 */
export function resolveSheetOpening(input: {
  mode: "demo" | "live";
  slotStart?: string | null;
  needsOptions: boolean;
  startAt?: "when";
  draft: Pick<BookingDraft, "step" | "time" | "liveStarts"> | null;
}): SheetOpening {
  const { draft } = input;
  // Live live-slot drafts that left from "who" resume on "when" (slots are re-fetched there).
  const draftStep = draft ? (input.mode === "live" && draft.step === "who" ? "when" : draft.step) : null;
  const slot = input.mode === "live" && input.slotStart ? input.slotStart : null;
  if (slot) {
    return { slot, time: null, liveStarts: null, step: input.needsOptions ? "choose" : "when" };
  }
  return {
    slot: null,
    time: draft?.time ?? null,
    liveStarts: draft?.liveStarts ?? null,
    step: draftStep ?? (input.startAt === "when" && !input.needsOptions ? "when" : "choose"),
  };
}
