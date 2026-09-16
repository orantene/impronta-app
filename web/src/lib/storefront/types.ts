/**
 * The storefront widget contracts, in one place for the island code.
 *
 *   read<Widget>(tenantId, props) → { ok: true; data } | { ok: false; reason }
 *   act<Widget>(input, expectedVersion?) → { ok: true; … } | StorefrontRefusal
 *
 * The functions live in `<widget>.server.ts` ("use server"); an island
 * imports them dynamically on mount, never statically.
 */

export type { StorefrontRefusal, StorefrontRefusalReason } from "./refusals";
export type * from "./appointment-picker.types";
export type * from "./class-timetable.types";
export type * from "./catalog-grid.types";
export type * from "./cart-checkout.types";
export type * from "./seat-map.types";
export type * from "./chat-with-us.types";
export type * from "./event-list.types";
export type * from "./service-collection.types";
export type * from "./package-selector.types";
export type * from "./order-lookup.types";
export type * from "./reviews.types";
export type * from "./portal-entry.types";
