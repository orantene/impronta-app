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
  /** TUL-379: dictionary of the other fixed engine lines (`dashboard.messagesV5.engineLines`). */
  readonly engineLines?: Readonly<Record<string, string>>;
};

/** The engine's stored English bodies, matched exactly, keyed by dictionary entry. */
const FIXED_LINES: ReadonlyArray<readonly [RegExp, string]> = [
  [/^all approvals are complete\.?$/i, "allApprovals"],
  [/^offer reopened for amendment\.?$/i, "offerReopened"],
  [/^client rejected the offer\.?$/i, "offerRejected"],
  [/^inquiry converted to booking\.?$/i, "converted"],
  [/^this inquiry was cancelled\. no further action is needed\.?$/i, "cancelled"],
  [/^this inquiry expired before it was booked\.?$/i, "expired"],
  [/^a coordinator paused this inquiry\. no action is needed right now\.?$/i, "paused"],
  [/^a talent declined their invitation\. you may want to line up an alternative\.?$/i, "talentDeclined"],
  [/^a talent on the lineup was swapped for another\.?$/i, "talentSwapped"],
  [/^coordinator accepted assignment\.?$/i, "coordAccepted"],
  [/^coordinator declined assignment\.?$/i, "coordDeclined"],
  [/^coordinator started a counter offer\.?$/i, "counterStarted"],
];

/** Lines that carry a person's name: `{name}` in the dictionary entry. */
const NAMED_LINES: ReadonlyArray<readonly [RegExp, string]> = [
  [/^(.+) is now coordinating this inquiry\.?$/i, "coordinating"],
  [/^(.+) is no longer coordinating this inquiry\.?$/i, "notCoordinating"],
  [/^(.+) approved the offer\.?$/i, "approved"],
];

export function isOfferSentLine(text: string): boolean {
  return OFFER_SENT_LINE.test(text.trim());
}

const TALENT_ACCEPTED_LINE = /^a talent accepted the invitation\.?$/i;

export function localiseEngineLine(text: string, kit: EngineLineCopy): string {
  if (kit.offer.talentAcceptedLine && TALENT_ACCEPTED_LINE.test(text.trim())) return kit.offer.talentAcceptedLine;
  if (isOfferSentLine(text)) return `${kit.card.cat.offer} · ${kit.offer.sentPlain}`;
  const dict = kit.engineLines;
  if (dict) {
    const trimmed = text.trim();
    for (const [pattern, key] of FIXED_LINES) {
      if (pattern.test(trimmed) && dict[key]) return dict[key];
    }
    for (const [pattern, key] of NAMED_LINES) {
      const hit = pattern.exec(trimmed);
      if (hit && dict[key]) return dict[key].replace("{name}", hit[1]);
    }
  }
  return text;
}

/**
 * TUL-715: a stored message with no body falls back to its kind word. An
 * order event (kind "order") then read the raw English "order". Draw the
 * record word of the dashboard language instead; unknown kinds stay as stored.
 */
export function localiseSystemKind(kind: string, kit: { readonly record: Record<string, string> }): string {
  return kit.record[kind] ?? kind;
}
