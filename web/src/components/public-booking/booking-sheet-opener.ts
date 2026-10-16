/**
 * GRK-097: the catalog booking sheet opens via window CustomEvents, so by the
 * time `useFocusTrap` runs its effect, `document.activeElement` is usually
 * `<body>`. Capture the real opener (CTA / sticky bar) synchronously at
 * dispatch / click time and hand it to the trap for restore-on-close.
 */

let pending: HTMLElement | null = null;

function isUsableOpener(el: HTMLElement): boolean {
  if (el === document.body || el === document.documentElement) return false;
  // Never restore into the sheet itself (re-open / resume).
  if (el.closest?.("[data-catalog-booking]")) return false;
  return true;
}

/** Call from a click/tap handler or immediately before dispatching `tulala:offering-*`. */
export function rememberBookingSheetOpener(el?: HTMLElement | null): void {
  if (typeof document === "undefined") return;
  const candidate =
    el ??
    (document.activeElement instanceof HTMLElement ? document.activeElement : null);
  if (!candidate || !isUsableOpener(candidate)) return;
  pending = candidate;
}

/** One-shot: returns and clears the remembered opener. */
export function consumeBookingSheetOpener(): HTMLElement | null {
  const el = pending;
  pending = null;
  return el;
}

/** Test helper. */
export function peekBookingSheetOpener(): HTMLElement | null {
  return pending;
}

/** Test helper. */
export function clearBookingSheetOpener(): void {
  pending = null;
}
