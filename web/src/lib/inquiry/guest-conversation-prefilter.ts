/**
 * guest-conversation-prefilter.ts — cheap, PURE gate that decides whether a
 * guest chat message is worth an AI extraction call (W2-I).
 *
 * The auto-fill feature runs a small Haiku model over the recent chat to pull
 * out booking details (date / location / headcount / budget / event type). That
 * call costs money and adds noise, so we only make it when the message plausibly
 * CONTAINS a detail. Pure chit-chat ("thanks!", "ok", "sounds good") returns
 * false and skips the model entirely.
 *
 * This is a heuristic PRE-filter, not the extractor: it errs toward TRUE (a
 * false positive just wastes one cheap call; the extractor then returns nothing).
 * It must NEVER throw and imports nothing server-side, so the scan action and its
 * unit tests read the exact same predicate.
 */

/** Currency symbols that signal a budget mention. */
const CURRENCY_SYMBOL = /[$€£¥₹]/;

/** ISO-4217-ish currency codes we commonly see, as whole words. */
const CURRENCY_CODE =
  /\b(usd|eur|gbp|mxn|cad|aud|jpy|chf|brl|inr|aed|sgd|hkd|nzd|zar|dollars?|euros?|pounds?|pesos?)\b/i;

/** Month names (full + 3-letter abbreviations). */
const MONTH =
  /\b(jan(uary)?|feb(ruary)?|mar(ch)?|apr(il)?|may|jun(e)?|jul(y)?|aug(ust)?|sep(t|tember)?|oct(ober)?|nov(ember)?|dec(ember)?)\b/i;

/** Relative / weekday date words. */
const DATE_WORD =
  /\b(today|tonight|tomorrow|weekend|weekday|next\s+(week|month|year)|this\s+(week|weekend|month)|mon(day)?|tue(s|sday)?|wed(nesday)?|thu(r|rs|rsday)?|fri(day)?|sat(urday)?|sun(day)?)\b/i;

/** People / quantity words that imply a headcount. */
const QUANTITY_WORD =
  /\b(people|persons?|guests?|models?|talent|performers?|dancers?|djs?|singers?|hosts?|attendees?|headcount|pax|couples?|kids?|children|adults?)\b/i;

/** Any digit at all (dates, amounts, counts all carry one). */
const DIGIT = /\d/;

/**
 * True when `message` plausibly contains a booking detail worth an AI extraction
 * call. Never throws; a blank/nullish message returns false.
 */
export function messageWorthScanning(message: string | null | undefined): boolean {
  const text = (message ?? "").trim();
  if (text.length === 0) return false;

  return (
    DIGIT.test(text) ||
    CURRENCY_SYMBOL.test(text) ||
    CURRENCY_CODE.test(text) ||
    MONTH.test(text) ||
    DATE_WORD.test(text) ||
    QUANTITY_WORD.test(text)
  );
}

/**
 * True when ANY message in a recent batch is worth scanning. Used by the scan
 * action to decide whether to call the model over the combined recent chat.
 */
export function conversationWorthScanning(
  messages: ReadonlyArray<string | null | undefined>,
): boolean {
  for (const m of messages) {
    if (messageWorthScanning(m)) return true;
  }
  return false;
}
