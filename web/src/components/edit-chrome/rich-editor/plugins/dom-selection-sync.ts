/**
 * TUL-78 B-3 - pure decision helpers for `DomSelectionSyncPlugin`.
 *
 * Lexical keeps its OWN selection and only re-reads the browser's caret on an
 * async `selectionchange` event. A fast "End" followed by a character (a paste
 * robot, a held key, a slow main thread) delivers the `beforeinput` first, so
 * the character lands at Lexical's STALE caret: the double-click position
 * ("they boo k.Zeta" instead of "they book. Zeta"). The plugin adopts the DOM
 * caret right before each input; these helpers decide when that is needed.
 */

export interface CaretPointSnapshot {
  key: string;
  offset: number;
}

export interface CaretSnapshot {
  anchor: CaretPointSnapshot;
  focus: CaretPointSnapshot;
}

function samePoint(a: CaretPointSnapshot, b: CaretPointSnapshot): boolean {
  return a.key === b.key && a.offset === b.offset;
}

/** True when the DOM caret differs from Lexical's, so Lexical must adopt it. */
export function shouldAdoptDomSelection(
  lexical: CaretSnapshot | null,
  dom: CaretSnapshot | null,
): boolean {
  if (dom === null) return false;
  if (lexical === null) return true;
  return !samePoint(lexical.anchor, dom.anchor) || !samePoint(lexical.focus, dom.focus);
}

/** Input events that must not be intercepted: IME composition and history. */
export function inputEventNeedsSelectionSync(event: {
  isComposing?: boolean;
  inputType?: string;
}): boolean {
  if (event.isComposing) return false;
  const type = event.inputType ?? "";
  return !type.startsWith("history");
}
