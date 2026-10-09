/**
 * Canvas focus rules for the builder selection layer (TUL-78/396 #11).
 *
 * Typing in an inspector field commits the tree on every keystroke; the
 * selection layer's effect depends on the tree, so it re-ran ~500 ms after
 * typing, found the field momentarily re-mounted (active element = body) and
 * pulled focus to the canvas block. Focus is pulled to the canvas only when the
 * SELECTION changed, never because the tree did, and never while a text entry
 * has focus. Pure.
 */
export function isTextEntryElement(a: Element | null): boolean {
  if (!a) return false;
  const el = a as HTMLElement;
  return (
    el.tagName === "INPUT" ||
    el.tagName === "TEXTAREA" ||
    el.tagName === "SELECT" ||
    el.isContentEditable === true ||
    el.getAttribute("role") === "textbox"
  );
}

export function shouldPullCanvasFocus(input: { selectionChanged: boolean; activeIsTextEntry: boolean }): boolean {
  return input.selectionChanged && !input.activeIsTextEntry;
}
