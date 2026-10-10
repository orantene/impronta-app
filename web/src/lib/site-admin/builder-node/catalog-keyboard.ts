/**
 * TUL-534 / E6 — keyboard path through the services catalog.
 *
 * Roving tabindex keeps the row CTA list to one Tab stop (≤10 Tabs to Reservar
 * on large menus). After a plain Seleccionar, focus moves to Continuar so Enter
 * opens the booking sheet without walking every remaining row.
 */

/** tabIndex for a catalog / matrix CTA in a roving group. */
export function catalogCtaTabIndex(opts: {
  selected: boolean;
  /** True for the sole tab stop when nothing is selected (first visible CTA). */
  rovingAnchor: boolean;
}): number {
  return opts.selected || opts.rovingAnchor ? 0 : -1;
}

/** Focus the dock Continuar control once it is interactive (not inert). */
export function focusCatalogDockContinue(): void {
  const run = () => {
    const go = document.querySelector<HTMLElement>(".cb-dock[data-show='true'] .cb-dock-go");
    if (!go || go.closest("[inert]")) return false;
    go.focus();
    return document.activeElement === go;
  };
  if (run()) return;
  requestAnimationFrame(() => {
    if (run()) return;
    requestAnimationFrame(() => {
      run();
    });
  });
}

/** Move focus among catalog CTAs with arrow keys (roving tabindex). */
export function moveCatalogCtaFocus(from: HTMLElement, key: "ArrowDown" | "ArrowUp" | "ArrowRight" | "ArrowLeft"): void {
  const root = from.closest(".cb-island") ?? document;
  const items = Array.from(
    root.querySelectorAll<HTMLElement>(
      "button.site-builder-node--services-catalog-cta:not([disabled]), button.sb-mx-cta:not([disabled])",
    ),
  );
  const i = items.indexOf(from);
  if (i < 0 || items.length === 0) return;
  const next =
    key === "ArrowDown" || key === "ArrowRight"
      ? items[(i + 1) % items.length]!
      : items[(i - 1 + items.length) % items.length]!;
  for (const el of items) el.tabIndex = -1;
  next.tabIndex = 0;
  next.focus();
}
