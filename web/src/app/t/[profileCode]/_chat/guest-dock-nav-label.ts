/**
 * Compact dock-tab display labels (TUL-531). Full strings stay in aria-label /
 * title; the visible cell is ~1/3 of a 380px panel and was ellipsizing to
 * "Talento y se…".
 */
export function dockTabDisplayLabel(full: string): string {
  if (full === "Talent & services") return "Talent";
  if (full === "Talento y servicios") return "Talento";
  if (full === "Tickets & tables") return "Tickets";
  if (full === "Entradas y mesas") return "Entradas";
  return full;
}
