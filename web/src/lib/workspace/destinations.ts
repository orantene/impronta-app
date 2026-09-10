/**
 * destinations.ts — ONE registry of workspace destinations.
 *
 * WHY THIS EXISTS
 * ───────────────
 * A workspace destination is currently described in four places that must be
 * hand-kept in agreement, and are not:
 *
 *   1. `SIDEBAR_GROUP_TEMPLATE` / `subItemsFor` / `SIDEBAR_ICON`
 *      (components/admin/shell/internal/page-modules/WorkspaceShell.tsx)
 *   2. `WORKSPACE_PAGES` / `PAGE_META` / `resolveWorkspacePage`
 *      (components/admin/shell/internal/state/fixtures.ts)
 *   3. `WORKSPACE_PAGE_ALIASES` + `WORKSPACE_PAGE_SEGMENTS`
 *      (app/(workspace)/[tenantSlug]/admin/workspace-page-routing.ts)
 *   4. `CANONICAL_ROUTE_MATCHERS`
 *      (components/admin/shell/canonical-routes.ts)
 *
 * Adding one destination means six to eleven separate registrations, and a
 * missed one fails silently: an icon degrades to a circle, a segment 404s to
 * Overview, a canonical page renders stacked under the SPA. This module is the
 * single description those four are meant to become projections of.
 *
 * All four are now projections of this module: the rail through
 * `page-modules/workspace-nav-groups.ts`, the page list and metadata through
 * `lib/workspace/page-ids.ts`, and the route resolver and canonical matchers
 * through the same helpers. A destination is described HERE and nowhere else.
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
 * canonical segments are not routes yet (`appts`, `catalog`, `spaces`,
 * `people`, `issues`), and their legacy segment is carried in `aliases` so
 * every URL in the wild keeps resolving. `fallbackSegment` names the route that
 * actually renders today, for two cases that are the same case:
 *
 *   - a BUILT destination whose canonical segment is not routed yet
 *     (`spaces` renders at /admin/tables until the routing task moves it), and
 *   - an UNBUILT destination that has somewhere sensible to stand in
 *     (`payments` lands on /admin/financials; `projects` lands on /admin/messages).
 *
 * Ask `liveRouteSegment()` rather than reading `segment` directly, and treat
 * its `null` as "this destination has no route at all yet" — that is `mywork`,
 * and it is a real state, not a missing value.
 */

import type { AdminShellIconName } from "@/components/admin/shell/internal/primitives/icons";
import type { Plan } from "@/components/admin/shell/internal/state/types";
import type { WorkspaceType } from "@/lib/saas/workspace-type";

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
 * Rail order. `pos` is deliberately absent: the point of sale owns the whole
 * screen (see `chrome`) and must never appear as a rail row — `posGroup` is a
 * grouping for the registry, not a section of the sidebar.
 */
export const SIDEBAR_GROUP_ORDER: readonly DestinationGroup[] = [
  "home",
  "operate",
  "sell",
  "relationships",
  "money",
  "grow",
  "settings",
];

/** `null` = the group renders with no heading (the single Overview row). */
export const DESTINATION_GROUP_LABELS: Readonly<Record<DestinationGroup, string | null>> = {
  home: null,
  operate: "Operate",
  sell: "Sell",
  relationships: "People",
  money: "Money",
  grow: "Grow",
  settings: null,
  pos: null,
};

/** How the destination renders: a PageRouter case, or a real Next.js route. */
export type DestinationRender = "spa" | "canonical";

/** A destination that replaces the admin chrome entirely rather than sitting in it. */
export type DestinationChrome = "pos";

/**
 * The shape of a workspace, derived in `nav-context.ts` from the tenant's
 * industry preset and team size. Not a stored column.
 */
export type WorkspacePreset = "cafe" | "solo" | "hybrid";

/**
 * The hat the signed-in person wears. Three rungs off the membership role
 * ladder; `professional` is a fourth, orthogonal hat carried separately on the
 * context because a person can be an owner AND bookable.
 */
export type WorkRole = "owner" | "manager" | "assistant";

/** Booleans that already ride the tenant identity bridge. Never a fresh fetch. */
export type TenantFlag = "takesReservations" | "runsEvents";

/**
 * Everything that can hide a destination. Every clause is AND-ed; an absent
 * clause is not a constraint. Visibility is a NAV decision only — hiding a link
 * and refusing a route are different things, and this registry does the first.
 */
export type DestinationRequires = {
  /** Only this workspace type sees it (`talent` gates the roster-shaped surfaces). */
  readonly workspaceType?: WorkspaceType;
  /** Every flag listed must be true on the context. */
  readonly tenantFlags?: readonly TenantFlag[];
  /** Minimum plan on the `free < website < studio < agency < network` ladder. */
  readonly minPlan?: Plan;
  /** Any-of against the work role. */
  readonly roles?: readonly WorkRole[];
  /** The person must be bookable on this roster (the professional hat). */
  readonly professional?: boolean;
  /** The person must be able to manage billing. */
  readonly billing?: boolean;
  /** The workspace must have the point of sale switched on. */
  readonly posEnabled?: boolean;
};

/**
 * A child link under a destination's rail row.
 *
 * EVERY SUB-VIEW NAMES A ROUTE THAT EXISTS TODAY, under the owner's LIVE route
 * rather than its canonical segment: People's children sit at /admin/roster/*
 * while People still renders there. `rail-visible-pages.static.test.ts` walks
 * the app directory and fails on one that points at nothing, because a child
 * drawn under the row an operator just opened must not be a 404.
 */
export type DestinationSubView = {
  readonly id: string;
  readonly label: string;
  /** Segment under the owner's live route. `""` is the owner's landing view. */
  readonly segment: string;
  /**
   * The child hangs off ANOTHER destination's live route. Events → Orders is
   * the case: the door and the ticket orders it checks in are one job.
   */
  readonly under?: DestinationId;
  /** Query appended to the href, without the "?" (e.g. `compose=new`). */
  readonly query?: string;
  readonly requires?: DestinationRequires;
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

export type Destination = {
  readonly id: DestinationId;
  readonly group: DestinationGroup;
  /** Canonical URL segment. `""` is the admin root (Overview). */
  readonly segment: string;
  /** Legacy segments that still resolve here. Every live URL keeps working. */
  readonly aliases: readonly string[];
  readonly render: DestinationRender;
  /** Set when the destination takes over the screen instead of sitting in the shell. */
  readonly chrome?: DestinationChrome;
  readonly icon: AdminShellIconName;
  /** English label. The preset overrides below win when one applies. */
  readonly label: string;
  readonly presetLabels?: Partial<Record<WorkspacePreset, string>>;
  /** Shorter label for a mobile tab, where the rail label does not fit. */
  readonly shortLabel?: string;
  /** Does the surface exist at all today. */
  readonly built: boolean;
  /** The route that actually renders. See the SEGMENT vs LIVE ROUTE note above. */
  readonly fallbackSegment?: string;
  readonly requires?: DestinationRequires;
  /** Lower sorts earlier in the mobile tab bar. Absent = never a mobile tab. */
  readonly mobilePriority?: number;
  readonly subViews?: readonly DestinationSubView[];
  /** Pinned to the foot of the rail rather than flowing with its group. */
  readonly pinned?: boolean;
};

// ── The destinations ─────────────────────────────────────────────────

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
    aliases: ["sessions"],
    fallbackSegment: "sessions",
    render: "spa",
    icon: "layers",
    label: "Appointments",
    shortLabel: "Bookings",
    built: true,
    mobilePriority: 4,
    // NO SUB-VIEWS. Appointments renders at /admin/sessions, and that directory
    // holds exactly one page.tsx: Series and Waitlist are the surface this
    // destination is heading for, not routes. They belong here the day they are.
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
    presetLabels: { cafe: "Menu and catalog", solo: "Services" },
    shortLabel: "Catalog",
    built: true,
    mobilePriority: 7,
  },
  events: {
    id: "events",
    group: "sell",
    segment: "events",
    aliases: [],
    render: "spa",
    icon: "map-pin",
    label: "Events",
    built: true,
    requires: { tenantFlags: ["runsEvents"] },
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
    label: "Spaces",
    built: true,
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
    fallbackSegment: "roster",
    render: "spa",
    icon: "team",
    label: "People",
    presetLabels: { cafe: "Team" },
    shortLabel: "People",
    built: true,
    mobilePriority: 9,
    // The four children the rail has drawn under the roster since WS-3, at the
    // live route they still render on. The last three are TALENT-ONLY because
    // the routes themselves are: /admin/roster/{applications,registration,rates}
    // each call `assertRosterWorkspace`, which 404s a business workspace. The
    // landing view is not gated, because People is every workspace's row — a
    // restaurant has staff, and it is the same page under its cafe name, Team.
    //
    // `talent`, `bookable` and `access` are NOT here: /admin/roster/talent is
    // the roster's [id] route, so those three were links into a lookup for a
    // profile with the id "talent". They arrive with the People surface.
    subViews: [
      { id: "everyone", label: "Everyone", segment: "" },
      {
        id: "applications",
        label: "Applications",
        segment: "applications",
        requires: { workspaceType: "talent" },
      },
      {
        id: "registration",
        label: "Registration",
        segment: "registration",
        requires: { workspaceType: "talent" },
      },
      {
        // Per-talent day rates — roster DATA, so it belongs beside the roster.
        // The tenant-wide fallback stays in Settings, where it is a policy.
        id: "rates",
        label: "Rates",
        segment: "rates",
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
    requires: { workspaceType: "talent" },
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
    // Not built: Payments is the consolidation of Financials and Payouts, and
    // neither has been folded in yet. Financials is the richer of the two and
    // is a real canonical route, so that is where a /payments URL lands.
    fallbackSegment: "financials",
    render: "canonical",
    icon: "credit",
    label: "Payments",
    built: false,
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
    requires: { minPlan: "agency" },
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
 * Everything visibility needs, all of it already on the client: the tenant
 * identity bridge carries the workspace type and the two flags, the shell state
 * carries the plan, and `nav-context.ts` derives the preset and the hats.
 */
export type WorkspaceNavContext = {
  readonly workspaceType: WorkspaceType;
  readonly plan: Plan;
  readonly preset: WorkspacePreset;
  readonly role: WorkRole;
  /** The person is bookable on this roster (has a talent profile here). */
  readonly professional: boolean;
  readonly takesReservations: boolean;
  readonly runsEvents: boolean;
  readonly posEnabled: boolean;
  readonly canManageBilling: boolean;
};

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
  const owner = view.under !== undefined ? DESTINATIONS[view.under] : destination;
  const base = destinationHref(owner, adminBase);
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
