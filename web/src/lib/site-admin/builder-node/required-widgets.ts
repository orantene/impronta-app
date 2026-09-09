/**
 * Missing storefront widgets — registry of kinds the builder must offer.
 * Server actions only; no new public /api except justified iCal.
 */

export const REQUIRED_WIDGETS = [
  "appointment_picker",
  "seat_map",
  "service_collection",
  "class_timetable",
  "package_selector",
  "catalog_grid",
  "membership",
  "gift_card",
  "pickup_selector",
  "cart_checkout",
  "credit_wallet",
  "order_lookup",
  "portal_entry",
  "ticket_picker",
  "session_picker",
  "reserve_table",
  "menu_board",
] as const;

export type RequiredWidget = (typeof REQUIRED_WIDGETS)[number];

export function missingWidgets(present: ReadonlySet<string>): RequiredWidget[] {
  return REQUIRED_WIDGETS.filter((w) => !present.has(w));
}
