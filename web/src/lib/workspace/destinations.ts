/**
 * destinations.ts — ONE registry of workspace destinations.
 *
 * WHY THIS EXISTS
 * ───────────────
 * A destination used to be described in four hand-synchronised places: the
 * shell's sidebar template + icon table, `WORKSPACE_PAGES` / `PAGE_META` /
 * `resolveWorkspacePage`, the admin route resolver's own alias map and segment
 * allow-list, and `CANONICAL_ROUTE_MATCHERS`. Adding one meant six to eleven
 * registrations, and a missed one failed SILENTLY: an icon degraded to a
 * circle, a segment 404d to Overview, a canonical page rendered stacked under
 * the SPA. All four are projections of this module now — the rail through
 * `page-modules/workspace-nav-groups.ts`, the page list and metadata through
 * `lib/workspace/page-ids.ts`, the resolver and matchers through the same
 * helpers. A destination is described HERE and nowhere else, and
 * `rail-visible-pages.static.test.ts` fails if one of the five old structures
 * comes back.
 *
 * PURITY
 * ──────
 * ZERO runtime imports. This module is read from a server layout, from the
 * client shell, and from plain node tests, exactly like `lib/saas/workspace-
 * type.ts`. Every import below is `import type` and is erased at compile time;
 * `destinations.purity.test` fails the build if a value import appears.
 *
 * SEGMENT vs LIVE ROUTE
 * ─────────────────────
 * `segment` is the canonical URL segment a destination is MOVING to. Several
 * are not routes yet (`appts`, `catalog`, `spaces`, `issues`), and their legacy
 * segment is carried in `aliases` so every URL in the wild keeps resolving.
 * `fallbackSegment` names the route that actually renders today for a BUILT
 * destination whose canonical segment is not routed yet (`spaces` renders at
 * /admin/tables). A destination with NO `fallbackSegment` renders at its own
 * segment; `people`, `projects` and `payments` have completed that move, and
 * every link builder follows them. Ask `liveRouteSegment()` rather than reading
 * `segment` directly, and treat its `null` as "this destination has no route at
 * all yet" — that is `mywork`, a real state, not a missing value.
 */

import type { Plan } from "@/components/admin/shell/internal/state/types";
import type {
  Destination,
  DestinationRequires,
  DestinationSubView,
  WorkspaceNavContext,
  WorkspacePreset,
} from "./destination-types";

// The type vocabulary lives next door; every consumer keeps importing it from
// here, so nothing outside this folder knows the file was split.
export type {
  Destination,
  DestinationChrome,
  DestinationRender,
  DestinationRequires,
  DestinationSubView,
  TenantFlag,
  WorkRole,
  WorkspaceNavContext,
  WorkspacePreset,
} from "./destination-types";

// ── The vocabulary ───────────────────────────────────────────────────

export const DESTINATION_GROUPS = [
  "home",
  "operate",
  "sell",
  "relationships",
  "money",
  "grow",
  "settings",
  "pos",
] as const;

export type DestinationGroup = (typeof DESTINATION_GROUPS)[number];

/**
 * Rail order: the vocabulary above, minus the point of sale, which owns the
 * whole screen (see `chrome`) and must never be a rail row. DERIVED, because a
 * second hand-kept copy of one vocabulary is the failure this module exists to
 * end, and it had grown one here.
 */
export const SIDEBAR_GROUP_ORDER: readonly DestinationGroup[] = DESTINATION_GROUPS.filter(
  (group) => group !== "pos",
);

/** `null` = the group renders with no heading (the single Overview row). */
export const DESTINATION_GROUP_LABELS: Readonly<Record<DestinationGroup, string | null>> = {
  home: null,
  operate: "Operate",
  sell: "Sell & manage",
  relationships: "Relationships",
  money: "Money",
  grow: "Grow",
  settings: null,
  pos: null,
};

export const DESTINATION_IDS = [
  "overview",
  "messages",
  "calendar",
  "appts",
  "reservations",
  "orders",
  "projects",
  "mywork",
  "issues",
  "preparation",
  "catalog",
  "events",
  "spaces",
  "discounts",
  "clients",
  "people",
  "pitches",
  "reviews",
  "sales",
  "payments",
  "analytics",
  "website",
  "media",
  "settings",
  "pos",
] as const;

export type DestinationId = (typeof DESTINATION_IDS)[number];


// ── The destinations ─────────────────────────────────────────────────
//
// ROLES, from the approved registry (W36, 2026-09-09; W38 for what staff see):
// the rows an assistant-rank person (the ladder's editor and viewer, which is
// where a cashier, a host and a front-desk assistant land — see
// `nav-context.ts`) can reach are Overview, Messages, Calendar, Appointments,
// Reservations, Orders, Clients and Sales. Everything else is owner · manager
// and is ABSENT for staff, not disabled; setup lives in Settings, which the
// rail replaces with "Setup is owner-only · ask the owner" for them. The
// ladder cannot tell a cashier from a host, so an assistant sees the union of
// the three staff rails the board draws (D-POS-13).

export const DESTINATIONS: Readonly<Record<DestinationId, Destination>> = {
  overview: {
    id: "overview",
    group: "home",
    segment: "",
    // "overview" is a segment today's router accepts (WORKSPACE_PAGE_SEGMENTS),
    // even though nothing links to it and there is no /admin/overview directory.
    // It stays an alias so a bookmark of it does not fall off the map.
    aliases: ["overview"],
    render: "spa",
    icon: "home",
    label: "Overview",
    shortLabel: "Home",
    built: true,
    mobilePriority: 1,
  },
  messages: {
    id: "messages",
    group: "operate",
    segment: "messages",
    aliases: ["inbox"],
    render: "spa",
    icon: "mail",
    label: "Messages",
    shortLabel: "Messages",
    built: true,
    mobilePriority: 2,
  },
  calendar: {
    id: "calendar",
    group: "operate",
    segment: "calendar",
    aliases: [],
    render: "spa",
    icon: "calendar",
    label: "Calendar",
    shortLabel: "Calendar",
    built: true,
    mobilePriority: 3,
  },
  appts: {
    id: "appts",
    group: "operate",
    // Renders at /admin/sessions until the routing task moves it. The old
    // segment stays an alias forever: it is in the wild in bookmarks.
    segment: "appts",
    aliases: ["sessions", "appointments"], // the sidebar word, typed by hand
    fallbackSegment: "sessions",
    render: "spa",
    icon: "layers",
    label: "Appointments & Classes",
    presetLabels: { solo: "Appointments" },
    shortLabel: "Bookings",
    built: true,
    mobilePriority: 4,
    // TABS, not routes: /admin/sessions still holds one page.tsx, so the three
    // views hang off the live route under a `view` query, the shape Events'
    // Tickets child already has. See AppointmentsPage.
    // The board's four rows (W39): Appointments · Sessions · Series · Waitlist.
    subViews: [
      { id: "list", label: "Appointments", segment: "" },
      { id: "sessions", label: "Sessions", segment: "", query: "view=sessions" },
      { id: "series", label: "Series", segment: "", query: "view=series" },
      { id: "waitlist", label: "Waitlist", segment: "", query: "view=waitlist" },
    ],
  },
  reservations: {
    id: "reservations",
    group: "operate",
    segment: "reservations",
    aliases: [],
    render: "canonical",
    icon: "calendar",
    label: "Reservations",
    shortLabel: "Book",
    built: true,
    requires: { tenantFlags: ["takesReservations"] },
    mobilePriority: 6,
  },
  orders: {
    id: "orders",
    group: "operate",
    segment: "orders",
    aliases: [],
    render: "canonical",
    icon: "credit",
    label: "Orders",
    shortLabel: "Orders",
    built: true,
    mobilePriority: 5,
    // Preparation is the kitchen's view of the same orders (W36: "Acceptance,
    // preparation, pickup/delivery, handoff, returns"), so it hangs here.
    subViews: [
      { id: "all", label: "All orders", segment: "" },
      { id: "preparation", label: "Preparation", segment: "", under: "preparation" },
    ],
  },
  projects: {
    id: "projects",
    group: "operate",
    segment: "projects",
    aliases: ["work"],
    // BUILT (P4, 2026-09-10): a real route, so the Messages fallback is gone
    // and /admin/work redirects here rather than standing in for it.
    render: "canonical",
    icon: "briefcase",
    label: "Projects",
    shortLabel: "Projects",
    built: true,
    requires: { roles: ["owner", "manager"] },
  },
  mywork: {
    id: "mywork",
    group: "operate",
    segment: "mywork",
    aliases: [],
    // No fallback ON PURPOSE. There is no page today that shows one person
    // their own shifts and bookings, and pointing this at Calendar would claim
    // a thing that is not there. `liveRouteSegment` returns null for it.
    render: "spa",
    icon: "user",
    label: "My work",
    built: false,
    requires: { professional: true },
  },
  issues: {
    id: "issues",
    group: "operate",
    segment: "issues",
    aliases: ["exceptions"],
    fallbackSegment: "exceptions",
    render: "canonical",
    icon: "alert",
    label: "Issues",
    built: true,
    requires: { roles: ["owner", "manager"] },
  },
  preparation: {
    id: "preparation",
    group: "operate",
    segment: "preparation",
    aliases: [],
    render: "canonical",
    icon: "layers",
    label: "Preparation",
    built: true,
    parent: "orders",
  },
  catalog: {
    id: "catalog",
    group: "sell",
    segment: "catalog",
    aliases: ["menu"],
    fallbackSegment: "menu",
    render: "spa",
    icon: "layers",
    label: "Catalog",
    presetLabels: { cafe: "Menu & catalog", solo: "Services" },
    shortLabel: "Catalog",
    built: true,
    mobilePriority: 7,
    requires: { roles: ["owner", "manager"] },
    // Discounts are the catalog's promotions (W36: "price lists, promotions,
    // passes & plans"), a child of this row rather than a row of their own.
    // W01's segments: the items, the structure the Counter and the menu
    // page draw them in (W07), the promotions (W08, its own route) and the
    // passes (W09, drawn disabled until the product decision).
    subViews: [
      { id: "items", label: "Items", segment: "" },
      { id: "structure", label: "Menu structure", segment: "", query: "view=structure" },
      { id: "discounts", label: "Discounts", segment: "", under: "discounts" },
      { id: "passes", label: "Passes & cards", segment: "", query: "view=passes" },
    ],
  },
  events: {
    id: "events",
    group: "sell",
    segment: "events",
    aliases: [],
    render: "spa",
    icon: "map-pin",
    label: "Events & Tickets",
    built: true,
    requires: { tenantFlags: ["runsEvents"], roles: ["owner", "manager"] },
    // The five children the rail has drawn under Events since the Events nav
    // shipped. Three of them are the events list under a query — composing a
    // new event and the ticket-tier tab are states of that page, not routes —
    // and Orders is a cross-link to its own destination, because the door and
    // the ticket orders it checks in are one job.
    subViews: [
      { id: "all", label: "All events", segment: "" },
      { id: "new", label: "Add new event", segment: "", query: "compose=new" },
      { id: "tickets", label: "Tickets", segment: "", query: "tab=tickets" },
      { id: "orders", label: "Orders", segment: "", under: "orders" },
      { id: "door", label: "Live check-in", segment: "door" },
    ],
  },
  spaces: {
    id: "spaces",
    group: "sell",
    segment: "spaces",
    aliases: ["tables"],
    fallbackSegment: "tables",
    render: "canonical",
    icon: "layers",
    label: "Spaces & Resources",
    built: true,
    requires: { roles: ["owner", "manager"] },
  },
  discounts: {
    id: "discounts",
    group: "sell",
    segment: "discounts",
    aliases: [],
    render: "canonical",
    icon: "bolt",
    label: "Discounts",
    built: true,
    requires: { roles: ["owner", "manager"] },
    parent: "catalog",
  },
  clients: {
    id: "clients",
    group: "relationships",
    segment: "clients",
    aliases: [],
    render: "spa",
    icon: "briefcase",
    label: "Clients",
    shortLabel: "Clients",
    built: true,
    mobilePriority: 8,
  },
  people: {
    id: "people",
    group: "relationships",
    segment: "people",
    aliases: ["roster", "talent"],
    // THE DOOR. NO `fallbackSegment`, so every link builder (rail, mobile tab
    // bar, `setPage`, page router) sends an operator to /admin/people. It fell
    // back to `roster`, which is how the surface ended up reachable only by
    // typed URL. `roster` stays an alias: it still lights this row, and still
    // renders the roster SPA — see LEGACY_PAGES_WITH_THEIR_OWN_BODY.
    render: "canonical",
    icon: "team",
    label: "People",
    presetLabels: { cafe: "Team" },
    shortLabel: "People",
    built: true,
    mobilePriority: 9,
    requires: { roles: ["owner", "manager"] },
    // The four children the rail has drawn under the roster since WS-3. The
    // last three are TALENT-ONLY because the routes are: each of
    // /admin/roster/{applications,registration,rates} calls
    // `assertRosterWorkspace`, which 404s a business workspace. The landing
    // view is not gated: People is every workspace's row, and a restaurant has
    // staff. Those three carry `adminPath` because they did NOT move with the
    // surface. `talent`, `bookable` and `access` are NOT here: /admin/roster/
    // talent is the roster's [id] route, so those three were links into a
    // lookup for a profile with the id "talent" — they arrive with People.
    // The board's five rows (W27): Everyone · Talent · Bookable · Access ·
    // Applications. The middle three are TABS of the one People page under a
    // `view` query, the shape Appointments' children have; they are not
    // routes, so the same person is never listed twice.
    subViews: [
      { id: "everyone", label: "Everyone", segment: "" },
      { id: "talent", label: "Talent", segment: "", query: "view=talent" },
      { id: "bookable", label: "Bookable", segment: "", query: "view=bookable" },
      { id: "access", label: "Access", segment: "", query: "view=access" },
      {
        id: "applications",
        label: "Applications",
        segment: "applications",
        adminPath: "roster",
        requires: { workspaceType: "talent" },
      },
      {
        id: "registration",
        label: "Registration",
        segment: "registration",
        adminPath: "roster",
        requires: { workspaceType: "talent" },
      },
      {
        // Per-talent day rates — roster DATA, so it belongs beside the roster.
        // The tenant-wide fallback stays in Settings, where it is a policy.
        id: "rates",
        label: "Rates",
        segment: "rates",
        adminPath: "roster",
        requires: { workspaceType: "talent" },
      },
    ],
  },
  pitches: {
    id: "pitches",
    group: "relationships",
    segment: "pitches",
    aliases: [],
    render: "spa",
    icon: "send",
    label: "Pitches",
    built: true,
    requires: { workspaceType: "talent", roles: ["owner", "manager"] },
  },
  reviews: {
    id: "reviews",
    group: "relationships",
    segment: "reviews",
    aliases: [],
    render: "spa",
    icon: "star",
    label: "Reviews",
    built: true,
    requires: { roles: ["owner", "manager"] },
  },
  sales: {
    id: "sales",
    group: "money",
    segment: "sales",
    aliases: [],
    render: "canonical",
    icon: "chart",
    label: "Sales",
    built: true,
  },
  payments: {
    id: "payments",
    group: "money",
    segment: "payments",
    aliases: ["financials", "payouts"],
    // BUILT: `/admin/payments` is a real server page now (takings by method,
    // what is owed, refunds, drawer sessions). `fallbackSegment: "financials"`
    // is REMOVED, not left in place — a fallback beats `built` in
    // `liveRouteSegment`, so keeping it would send every rail click to
    // Financials while the page it names rendered only for a typed URL. Both
    // aliases still resolve here and /admin/financials is untouched.
    render: "canonical",
    icon: "credit",
    label: "Payments",
    built: true,
    requires: { billing: true },
  },
  analytics: {
    id: "analytics",
    group: "grow",
    segment: "analytics",
    aliases: [],
    render: "spa",
    icon: "chart",
    label: "Analytics",
    built: true,
    requires: { roles: ["owner", "manager"] },
  },
  website: {
    id: "website",
    group: "grow",
    segment: "website",
    aliases: ["site"],
    render: "spa",
    icon: "globe",
    label: "Website",
    built: true,
    requires: { roles: ["owner", "manager"] },
  },
  media: {
    id: "media",
    group: "grow",
    segment: "media",
    aliases: [],
    render: "spa",
    icon: "image",
    label: "Media",
    built: true,
    requires: { minPlan: "agency", roles: ["owner", "manager"] },
  },
  settings: {
    id: "settings",
    group: "settings",
    segment: "settings",
    aliases: ["workspace", "billing"],
    render: "spa",
    icon: "settings",
    label: "Settings",
    built: true,
    requires: { roles: ["owner", "manager"] },
    pinned: true,
  },
  pos: {
    id: "pos",
    group: "pos",
    segment: "pos",
    aliases: [],
    render: "canonical",
    // The point of sale replaces the admin chrome. It is reached from a button
    // and from its own URL, and it is never a rail row: `sidebarGroups()`
    // drops the whole `pos` group.
    chrome: "pos",
    icon: "credit",
    label: "New sale",
    built: true,
    requires: { posEnabled: true },
  },
};

export const DESTINATION_LIST: readonly Destination[] = DESTINATION_IDS.map(
  (id) => DESTINATIONS[id],
);

// ── The context a destination is judged against ──────────────────────


/**
 * Plan ladder. MIRRORS `PLAN_META[].rank` in the shell fixtures, which cannot be
 * imported here (it is a `"use client"` module and this one must stay pure).
 * `destinations.test` reads that file and fails if the two ever disagree.
 */
const PLAN_RANK: Readonly<Record<Plan, number>> = {
  free: 0,
  website: 1,
  studio: 2,
  agency: 3,
  network: 4,
};

export function planMeets(current: Plan, required: Plan): boolean {
  return PLAN_RANK[current] >= PLAN_RANK[required];
}

// ── Resolution ───────────────────────────────────────────────────────

const BY_SEGMENT: ReadonlyMap<string, DestinationId> = new Map(
  DESTINATION_IDS.map((id) => [DESTINATIONS[id].segment, id] as const),
);

const BY_ALIAS: ReadonlyMap<string, DestinationId> = new Map(
  DESTINATION_IDS.flatMap((id) =>
    DESTINATIONS[id].aliases.map((alias) => [alias, id] as const),
  ),
);

function normalizeSegment(raw: string): string {
  return raw.trim().toLowerCase().replace(/^\/+|\/+$/g, "");
}

/**
 * A raw URL segment to its destination: canonical segments first, then legacy
 * aliases, then `null`.
 *
 * `null` is the answer, not a failure to answer. An unknown segment is a deep
 * page this registry does not describe (/admin/activity-log, /admin/triage,
 * /admin/bookings and friends), and a caller that silently turned that into
 * Overview would stack the SPA under a real page — the exact bug the canonical
 * matchers exist to prevent. Use `resolveDestinationOrHome` where a total
 * function is genuinely wanted.
 */
export function resolveDestination(raw: string): Destination | null {
  const segment = normalizeSegment(raw);
  const exact = BY_SEGMENT.get(segment);
  if (exact) return DESTINATIONS[exact];
  // "" is a legitimate segment (Overview) and Map.get returns its id above, so
  // reaching here means the segment is genuinely not one of ours.
  const alias = BY_ALIAS.get(segment);
  if (alias) return DESTINATIONS[alias];
  return null;
}

/** `resolveDestination` with Overview as the last resort, for URL clamps. */
export function resolveDestinationOrHome(raw: string): Destination {
  return resolveDestination(raw) ?? DESTINATIONS.overview;
}

/** The reverse: a destination to the canonical segment it will own. */
export function segmentForDestination(id: DestinationId): string {
  return DESTINATIONS[id].segment;
}

/**
 * The segment that renders TODAY, or `null` when the destination has no route
 * at all yet. See the SEGMENT vs LIVE ROUTE note in the module header.
 */
export function liveRouteSegment(destination: Destination): string | null {
  if (destination.fallbackSegment !== undefined) return destination.fallbackSegment;
  return destination.built ? destination.segment : null;
}

/**
 * A href for a destination under an admin base (`/admin` on a branded host,
 * `/{slug}/admin` on the shared one). `null` when there is nowhere to go.
 */
export function destinationHref(
  destination: Destination,
  adminBase: string,
): string | null {
  const segment = liveRouteSegment(destination);
  if (segment === null) return null;
  return segment === "" ? adminBase : `${adminBase}/${segment}`;
}

/**
 * A href for one of a destination's children, under the route that destination
 * RENDERS AT today (`liveRouteSegment`), never its canonical segment. `null`
 * when the owner has no route, which is the same `null` `destinationHref`
 * returns and means the same thing: there is nowhere to send this click.
 */
export function subViewHref(
  destination: Destination,
  view: DestinationSubView,
  adminBase: string,
): string | null {
  // `adminPath` wins, then `under`, then the owner's own live route.
  const owner = view.under !== undefined ? DESTINATIONS[view.under] : destination;
  const base = view.adminPath !== undefined
    ? `${adminBase}/${view.adminPath}`
    : destinationHref(owner, adminBase);
  if (base === null) return null;
  const path = view.segment === "" ? base : `${base}/${view.segment}`;
  return view.query !== undefined ? `${path}?${view.query}` : path;
}

/** Does this raw segment open the point of sale (which owns the whole screen). */
export function isPosSegment(raw: string): boolean {
  return resolveDestination(raw)?.chrome === "pos";
}

// ── Visibility ───────────────────────────────────────────────────────

function requirementsMet(
  requires: DestinationRequires | undefined,
  context: WorkspaceNavContext,
): boolean {
  if (!requires) return true;
  if (requires.workspaceType && context.workspaceType !== requires.workspaceType) {
    return false;
  }
  if (requires.tenantFlags) {
    for (const flag of requires.tenantFlags) {
      if (flag === "takesReservations" && !context.takesReservations) return false;
      if (flag === "runsEvents" && !context.runsEvents) return false;
    }
  }
  if (requires.minPlan && !planMeets(context.plan, requires.minPlan)) return false;
  if (requires.roles && !requires.roles.includes(context.role)) return false;
  if (requires.professional && !context.professional) return false;
  if (requires.billing && !context.canManageBilling) return false;
  if (requires.posEnabled && !context.posEnabled) return false;
  return true;
}

/** Every destination this context can see, in registry order. */
export function visibleDestinations(
  context: WorkspaceNavContext,
): readonly Destination[] {
  return DESTINATION_LIST.filter((d) => requirementsMet(d.requires, context));
}

/** The sub-views of a destination this context can see. */
export function visibleSubViews(
  destination: Destination,
  context: WorkspaceNavContext,
): readonly DestinationSubView[] {
  if (!destination.subViews) return [];
  return destination.subViews.filter((s) => requirementsMet(s.requires, context));
}

export type SidebarGroup = {
  readonly group: DestinationGroup;
  readonly label: string | null;
  readonly destinations: readonly Destination[];
};

/**
 * The grouped rail. Empty groups are dropped, and the `pos` group never
 * appears: the point of sale is chrome, not a rail row.
 */
export function sidebarGroups(context: WorkspaceNavContext): readonly SidebarGroup[] {
  const visible = visibleDestinations(context);
  return SIDEBAR_GROUP_ORDER.map((group) => ({
    group,
    label: DESTINATION_GROUP_LABELS[group],
    destinations: visible.filter((d) => d.group === group),
  })).filter((g) => g.destinations.length > 0);
}

/** The mobile tab bar: the highest-priority visible destinations, in order. */
export function mobileTabs(
  context: WorkspaceNavContext,
  limit = 5,
): readonly Destination[] {
  return visibleDestinations(context)
    .filter((d) => d.mobilePriority !== undefined && d.chrome === undefined)
    .sort((a, b) => (a.mobilePriority ?? 0) - (b.mobilePriority ?? 0))
    .slice(0, limit);
}

/** The label to show, given how this workspace works. */
export function destinationLabel(
  destination: Destination,
  preset: WorkspacePreset,
): string {
  return destination.presetLabels?.[preset] ?? destination.label;
}

/** The label for a mobile tab, which is tighter than the rail. */
export function destinationShortLabel(
  destination: Destination,
  preset: WorkspacePreset,
): string {
  return destination.shortLabel ?? destinationLabel(destination, preset);
}
