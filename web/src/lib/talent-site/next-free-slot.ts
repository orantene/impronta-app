/**
 * TUL-232 follow-up: the pure half of "the phone sticky bar and the next-free chip open booking
 * at the next free slot". The slot itself comes from the existing public slots API
 * (`fetchLiveSlots`, the same availability code the sheet uses); this module only decides WHICH
 * offering to ask about, registers offering details so `openBookingAtSlot` can resolve them,
 * and runs the tap with a fallback. The slot is always optional: no slot, no registered detail
 * or no bookable offering means the tap does exactly what it did before.
 */
import { isSlotEligibleOffering } from "@/components/public-booking/pick-bookable-offering";
import { deriveOfferingCta } from "@/lib/talent/offering-cta-derivation";
import type { OfferingRequestDetail } from "@/lib/talent/offering-request-detail";
import type { TalentOffering } from "@/lib/talent/offerings-types";

import { openBookingAtSlot, registerBookableOffering } from "./open-booking-at-slot";

export type NextSlot = { offeringId: string; slotStart: string };

/** The first slot start that is a real, future instant; null when there is none. */
export function firstSlotStart(slots: readonly string[], now: Date = new Date()): string | null {
  for (const s of slots) {
    const t = typeof s === "string" ? Date.parse(s) : NaN;
    if (Number.isFinite(t) && t > now.getTime()) return s;
  }
  return null;
}

/**
 * Offerings the slot rail can carry whole. The slot rail drops variants and add-ons
 * (see `railFor` in MaisonMenu), so an offering with options is never opened at a slot: it
 * keeps today's flow, where the visitor confirms the configuration first.
 */
export function carriesAtSlot(o: TalentOffering): boolean {
  return isSlotEligibleOffering(o) && (o.variants ?? []).length === 0 && (o.addOns ?? []).length === 0;
}

/**
 * TUL-275: which offering the next-free chip asks the slots API about. It must be one the sheet
 * can open at a slot (`carriesAtSlot`, the same rule that registers offerings), otherwise the
 * chip shows a time it can never open and the tap falls back to the `#services` anchor.
 * `openable: false` means no such offering exists, so the chip keeps its old link behaviour.
 */
export function pickChipOffering(
  offerings: ReadonlyArray<TalentOffering>,
  offeringId?: string | null,
): { offering: TalentOffering; openable: boolean } | null {
  const id = offeringId?.trim();
  if (id) {
    const match = offerings.find((o) => o.id === id);
    if (!match || !isSlotEligibleOffering(match)) return null;
    return { offering: match, openable: carriesAtSlot(match) };
  }
  const carries = offerings.find(carriesAtSlot);
  if (carries) return { offering: carries, openable: true };
  const any = offerings.find(isSlotEligibleOffering);
  return any ? { offering: any, openable: false } : null;
}

/**
 * The one slot the chip both SHOWS and OPENS: the first real future instant (a same-day slot
 * counts like any other). Showing `slots[0]` while opening `firstSlotStart` let the two disagree.
 */
export function chipSlot(
  offeringId: string,
  slots: readonly string[],
  openable: boolean,
  now: Date = new Date(),
): { when: string | null; slot: NextSlot | null } {
  const start = firstSlotStart(slots, now);
  return { when: start, slot: start && openable ? { offeringId, slotStart: start } : null };
}

/** Idempotent: re-registering the same offering replaces the same registry entry. */
export function registerSlotOffering(offering: TalentOffering, detail: OfferingRequestDetail): boolean {
  if (!carriesAtSlot(offering)) return false;
  registerBookableOffering(detail);
  return true;
}

export function registerSlotOfferings(
  items: ReadonlyArray<TalentOffering>,
  buildDetail: (o: TalentOffering) => OfferingRequestDetail,
): void {
  for (const o of items) registerSlotOffering(o, buildDetail(o));
}

/** The first offering on the menu that books (or requests) and can be opened at a slot. */
export function pickSlotOffering(
  items: ReadonlyArray<TalentOffering>,
  opts: { confirmsByHand?: boolean; bookingPosture?: unknown },
): TalentOffering | null {
  for (const o of items) {
    if (!carriesAtSlot(o)) continue;
    const d = deriveOfferingCta({
      offering: o,
      defaults: opts.bookingPosture ? { bookingPosture: opts.bookingPosture } : {},
      confirmsByHand: opts.confirmsByHand,
    });
    if (!d.hidden && (d.cta === "book_now" || d.cta === "request_to_book")) return o;
  }
  return null;
}

/** True when booking was opened at the slot; false means the caller keeps its old behaviour. */
export function openAtNextSlot(
  slot: NextSlot | null,
  open: typeof openBookingAtSlot = openBookingAtSlot,
): boolean {
  if (!slot) return false;
  return open({ offeringId: slot.offeringId, slotStart: slot.slotStart });
}

/** The bar tap: booking at the slot when one is known and the menu is off screen, else `fallback`. */
export function runSlotTap(
  slot: NextSlot | null,
  menuInView: boolean,
  fallback: () => void,
  open: typeof openBookingAtSlot = openBookingAtSlot,
): "opened-at-slot" | "fallback" {
  if (!menuInView && openAtNextSlot(slot, open)) return "opened-at-slot";
  fallback();
  return "fallback";
}
