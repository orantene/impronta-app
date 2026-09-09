/**
 * Stable destination registry — Master N destinations on existing routes.
 * No URL migration: IDs map onto today's admin paths.
 */

export const DESTINATION_IDS = [
  "home",
  "calendar",
  "sales",
  "orders",
  "pos",
  "events",
  "classes",
  "reservations",
  "spaces",
  "catalog",
  "inquiries",
  "offers",
  "projects",
  "customers",
  "inbox",
  "roster",
  "team",
  "payments",
  "website",
  "analytics",
  "settings",
] as const;

export type DestinationId = (typeof DESTINATION_IDS)[number];

export type DestinationGroup =
  | "operate"
  | "manage"
  | "relationships"
  | "grow"
  | "administration";

export type Destination = {
  id: DestinationId;
  group: DestinationGroup;
  /** Path under /{tenantSlug}/admin/ — null when not yet routed. */
  path: string | null;
  /** Activity keys that keep this destination visible when enabled. */
  activities: readonly string[];
  built: boolean;
};

export const DESTINATION_REGISTRY: Readonly<Record<DestinationId, Destination>> = {
  home: { id: "home", group: "operate", path: "", activities: [], built: true },
  calendar: { id: "calendar", group: "operate", path: "calendar", activities: ["appointments", "classes"], built: true },
  sales: { id: "sales", group: "operate", path: "sales", activities: ["pos", "events", "appointments"], built: true },
  orders: { id: "orders", group: "operate", path: "orders", activities: ["pos", "catalog"], built: true },
  pos: { id: "pos", group: "operate", path: "pos", activities: ["pos"], built: true },
  events: { id: "events", group: "operate", path: "events", activities: ["events"], built: true },
  classes: { id: "classes", group: "operate", path: "calendar", activities: ["classes"], built: true },
  reservations: { id: "reservations", group: "operate", path: "tables", activities: ["reservations"], built: true },
  spaces: { id: "spaces", group: "manage", path: "tables", activities: ["reservations", "events"], built: true },
  catalog: { id: "catalog", group: "manage", path: "menu", activities: ["catalog", "pos"], built: true },
  inquiries: { id: "inquiries", group: "relationships", path: "messages", activities: ["messaging", "projects"], built: true },
  offers: { id: "offers", group: "relationships", path: "messages", activities: ["projects", "messaging"], built: true },
  projects: { id: "projects", group: "manage", path: null, activities: ["projects"], built: false },
  customers: { id: "customers", group: "relationships", path: "clients", activities: [], built: true },
  inbox: { id: "inbox", group: "relationships", path: "messages", activities: ["messaging"], built: true },
  roster: { id: "roster", group: "manage", path: "roster", activities: ["appointments"], built: true },
  team: { id: "team", group: "administration", path: "team", activities: [], built: true },
  payments: { id: "payments", group: "administration", path: "payments", activities: [], built: true },
  website: { id: "website", group: "grow", path: "website", activities: [], built: true },
  analytics: { id: "analytics", group: "grow", path: "analytics", activities: [], built: true },
  settings: { id: "settings", group: "administration", path: "settings", activities: [], built: true },
};

export const DESTINATION_GROUP_ORDER: readonly DestinationGroup[] = [
  "operate",
  "manage",
  "relationships",
  "grow",
  "administration",
];

export function destinationPath(id: DestinationId, tenantSlug: string): string | null {
  const dest = DESTINATION_REGISTRY[id];
  if (dest.path == null) return null;
  if (dest.path === "") return `/${tenantSlug}/admin`;
  return `/${tenantSlug}/admin/${dest.path}`;
}

/**
 * Collapse the rail by enabled activities. Destinations with an empty
 * activities list are always shown (home, customers, settings, …).
 */
export function destinationsForActivities(
  enabled: readonly string[],
): Destination[] {
  const set = new Set(enabled);
  return DESTINATION_IDS.map((id) => DESTINATION_REGISTRY[id]).filter((dest) => {
    if (dest.activities.length === 0) return true;
    return dest.activities.some((a) => set.has(a));
  });
}

export function destinationsByGroup(
  destinations: readonly Destination[],
): Record<DestinationGroup, Destination[]> {
  const out: Record<DestinationGroup, Destination[]> = {
    operate: [],
    manage: [],
    relationships: [],
    grow: [],
    administration: [],
  };
  for (const dest of destinations) out[dest.group].push(dest);
  return out;
}
