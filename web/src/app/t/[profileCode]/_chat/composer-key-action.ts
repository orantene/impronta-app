/**
 * Composer keyboard rules for the guest dock (TUL-458 / same surface as TUL-401).
 * Plain Enter sends; Shift+Enter is a newline; Cmd/Ctrl+Enter still sends.
 * IME composition must not submit (Enter confirms the candidate).
 */

/** Keyboard fields the composer needs; matches a React KeyboardEvent. */
export type ComposerKey = {
  key: string;
  shiftKey: boolean;
  metaKey: boolean;
  ctrlKey: boolean;
  /** True while an IME is composing (Enter confirms the candidate, not the send). */
  isComposing: boolean;
};

/** Enter sends, Shift+Enter is a newline, Cmd/Ctrl+Enter still sends. */
export function composerKeyAction(e: ComposerKey): "submit" | "none" {
  if (e.key !== "Enter" || e.isComposing) return "none";
  if (e.metaKey || e.ctrlKey) return "submit";
  return e.shiftKey ? "none" : "submit";
}
