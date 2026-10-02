/**
 * Desk keyboard shortcut map (Phase 1c).
 * Shortcuts never fire inside text inputs / contenteditable.
 */

export type DeskShortcutAction =
  | "next"
  | "prev"
  | "reply"
  | "note"
  | "assign"
  | "resolve"
  | "snooze"
  | "command"
  | "escape";

export function isEditableTarget(target: EventTarget | null): boolean {
  // Duck-typed so unit tests (no DOM globals) and SSR stay safe.
  if (!target || typeof target !== "object") return false;
  const el = target as {
    tagName?: string;
    isContentEditable?: boolean;
    closest?: (sel: string) => unknown;
  };
  const tag = typeof el.tagName === "string" ? el.tagName.toUpperCase() : "";
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (el.isContentEditable) return true;
  if (typeof el.closest === "function") {
    return Boolean(el.closest("[contenteditable='true']"));
  }
  return false;
}

export function deskShortcutFromKeyboardEvent(
  e: Pick<KeyboardEvent, "key" | "metaKey" | "ctrlKey" | "altKey" | "shiftKey">,
  target: EventTarget | null,
): DeskShortcutAction | null {
  if (isEditableTarget(target)) {
    // Allow Escape + ⌘K even from inputs so agents can bail / search.
    if (e.key === "Escape") return "escape";
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") return "command";
    return null;
  }
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") return "command";
  if (e.key === "Escape") return "escape";
  if (e.metaKey || e.ctrlKey || e.altKey) return null;
  const k = e.key.toLowerCase();
  if (k === "j") return "next";
  if (k === "k") return "prev";
  if (k === "r") return "reply";
  if (k === "n") return "note";
  if (k === "a") return "assign";
  if (k === "e") return "resolve";
  if (k === "s") return "snooze";
  return null;
}
