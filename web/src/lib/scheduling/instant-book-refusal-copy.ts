import { createTranslator } from "@/i18n/messages";

/**
 * TUL-451: the booking policy refusals a guest can read ("booked by request",
 * "not taking bookings", "too soon", "time taken") were English literals from
 * the scheduling core, so a Spanish page showed English. The core keeps its
 * stable reason codes; the page's locale picks the words here. A reason with no
 * entry (or a missing catalog string) keeps the engine's own sentence.
 */
const KEY_BY_REASON: Readonly<Record<string, string>> = {
  request_only: "public.instantBook.refusal.requestOnly",
  inquiry_only: "public.instantBook.refusal.requestOnly",
  not_accepting_bookings: "public.instantBook.refusal.notAccepting",
  too_soon: "public.instantBook.refusal.tooSoon",
  slot_taken: "public.instantBook.refusal.slotTaken",
};

export function localizedBookingRefusal(reason: string, locale: string, fallback: string | undefined): string | undefined {
  const key = KEY_BY_REASON[reason];
  if (!key) return fallback;
  const text = createTranslator(locale)(key);
  return text && text !== key ? text : fallback;
}
