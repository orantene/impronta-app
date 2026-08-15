/**
 * Slash-command insert — pure trigger detection.
 *
 * Notion/Framer-style "/" insert menu (2026 page-builder batch, Lane E). This
 * module holds the two decisions that must never depend on Lexical/React so
 * they can be unit-tested directly against plain strings:
 *
 *   1. `shouldTriggerSlashCommand` — does a "/" just typed at this point in
 *      the text open the menu, or is it a literal character (e.g. the
 *      "/" in "and/or")?
 *   2. `extractSlashQuery` — once the menu is open, what's the current filter
 *      query, and has typing invalidated the trigger (a space, or the caret
 *      moving before the "/")?
 *
 * `SlashCommandPlugin.tsx` is the only caller — it feeds these functions the
 * live Lexical text-node content and never re-derives the logic itself.
 */

/**
 * Whether a "/" typed immediately after `textBeforeSlash` should open the
 * insert menu. Fires at the start of an empty block ("") or right after
 * whitespace — never mid-word, so "and/or" does not trigger.
 */
export function shouldTriggerSlashCommand(textBeforeSlash: string): boolean {
  if (textBeforeSlash.length === 0) return true;
  return /\s$/.test(textBeforeSlash);
}

/**
 * The current filter query for an open slash menu, or `null` when the menu
 * should close because the trigger is no longer valid — the operator typed a
 * space (Notion/Framer convention: a space commits to plain text) or the
 * caret moved to before the "/" (e.g. Home, ArrowLeft past it).
 *
 * `fullText` is the plain text content of the node/run that contains the
 * trigger "/"; `triggerOffset` is the index of the "/" character within that
 * text; `caretOffset` is the current caret index within the same text.
 */
export function extractSlashQuery(
  fullText: string,
  triggerOffset: number,
  caretOffset: number,
): string | null {
  if (triggerOffset < 0 || triggerOffset >= fullText.length) return null;
  if (fullText[triggerOffset] !== "/") return null;
  if (caretOffset <= triggerOffset) return null;
  if (caretOffset > fullText.length) return null;
  const slice = fullText.slice(triggerOffset + 1, caretOffset);
  if (/\s/.test(slice)) return null;
  return slice;
}
