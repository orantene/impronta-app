/**
 * Stable navigation destinations. Nine were missing from the workspace rail.
 * Existing routes are reused; unbuilt destinations stay listed and unrouted.
 */

export const NAV_DESTINATIONS = [
  "sales",
  "discounts",
  "pos",
  "today",
  "tables",
  "preparation",
  "admissions",
  "catalog",
  "receipts",
] as const;

export type NavDestinationId = (typeof NAV_DESTINATIONS)[number];

export type NavDestination = {
  id: NavDestinationId;
  path: string | null;
  existingPage: string | null;
  built: boolean;
};

export const NAV_REGISTRY: Readonly<Record<NavDestinationId, NavDestination>> = {
  sales: { id: "sales", path: "sales", existingPage: "orders", built: true },
  discounts: { id: "discounts", path: "discounts", existingPage: null, built: true },
  pos: { id: "pos", path: "pos", existingPage: null, built: true },
  today: { id: "today", path: "calendar", existingPage: "calendar", built: true },
  tables: { id: "tables", path: null, existingPage: null, built: false },
  preparation: { id: "preparation", path: null, existingPage: null, built: false },
  admissions: { id: "admissions", path: "events/door", existingPage: "events", built: true },
  catalog: { id: "catalog", path: "menu", existingPage: "menu", built: true },
  receipts: { id: "receipts", path: "orders", existingPage: "orders", built: true },
};

export function navPath(id: NavDestinationId, tenantSlug: string): string | null {
  const dest = NAV_REGISTRY[id];
  if (!dest.path) return null;
  return `/${tenantSlug}/admin/${dest.path}`;
}

export function operatorNav(kind: "salon" | "restaurant" | "event" | "independent"): NavDestinationId[] {
  if (kind === "salon") return ["today", "pos", "sales", "receipts"];
  if (kind === "restaurant") return ["tables", "sales", "catalog", "preparation"];
  if (kind === "event") return ["admissions", "pos", "receipts"];
  return ["today", "pos", "receipts"];
}
