/**
 * F101: the engine writes a few English system lines into the thread ("Offer v3
 * sent", "Offer sent to client."). They reach the inbox preview and the thread
 * stream as stored text, so an ES talent read raw English and an internal
 * version number. The reader localises them here and never shows the version.
 * Pure: pass the kit copy, get the line back (unchanged when it is not one of ours).
 */
const OFFER_SENT_LINE = /^offer(?:\s+v\d+)?\s+sent(?:\s+to\s+client)?\.?$/i;

export type EngineLineCopy = {
  readonly card: { readonly cat: { readonly offer: string } };
  readonly offer: { readonly sentPlain: string; readonly talentAcceptedLine?: string };
};

export function isOfferSentLine(text: string): boolean {
  return OFFER_SENT_LINE.test(text.trim());
}

const TALENT_ACCEPTED_LINE = /^a talent accepted the invitation\.?$/i;

export function localiseEngineLine(text: string, kit: EngineLineCopy): string {
  if (kit.offer.talentAcceptedLine && TALENT_ACCEPTED_LINE.test(text.trim())) return kit.offer.talentAcceptedLine;
  return isOfferSentLine(text) ? `${kit.card.cat.offer} · ${kit.offer.sentPlain}` : text;
}

/**
 * TUL-715: a stored message with no body falls back to its kind word. An
 * order event (kind "order") then read the raw English "order". Draw the
 * record word of the dashboard language instead; unknown kinds stay as stored.
 */
export function localiseSystemKind(kind: string, kit: { readonly record: Record<string, string> }): string {
  return kit.record[kind] ?? kind;
}
