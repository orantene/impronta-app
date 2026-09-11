// ════════════════════════════════════════════════════════════════════
// The workspace rail, as a pure function.
//
// Split out of workspace-nav.ts (which is "use client" and pulls in
// useAdminShell / next-navigation) so this piece stays importable from a
// plain node:test run — the same split website-nav.ts / website-nav-types.ts
// already uses, and the reason the rail could never be unit-tested before.
//
// WHAT IT REPLACES. Four hand-synchronised structures inside WorkspaceShell:
// SIDEBAR_GROUP_TEMPLATE (which pages, in which group, in which order),
// buildSidebarGroups (the plan gate), SIDEBAR_ICON (a second icon table), and
// subItemsFor (five hardcoded sub-nav lists). All four are now a projection of
// `lib/workspace/destinations.ts`.
//
// I18N. Every `label` here is an ENGLISH literal, rendered through the shell's
// `copy.t()` (dashboard-i18n.ts' ES_TEXT, keyed by the English string). A new
// registry label needs a Spanish entry there or it renders in English.
// ════════════════════════════════════════════════════════════════════

import {
  destinationHref,
  destinationLabel,
  resolveDestination,
  sidebarGroups,
  subViewHref,
  visibleSubViews,
  type Destination,
  type DestinationGroup,
  type DestinationId,
  type WorkspaceNavContext,
} from "@/lib/workspace/destinations";
import { liveWorkspacePage } from "@/lib/workspace/page-ids";
import type { AdminShellIconName } from "../primitives";
import type { WorkspacePage } from "../state/types";

export type WorkspaceNavBadge = {
  readonly count: number;
  readonly tone: "amber" | "brand";
};

export type WorkspaceNavSubItem = {
  readonly id: string;
  /** English literal — rendered through `copy.t()`. */
  readonly label: string;
  readonly href: string;
  /** Match the path exactly rather than by prefix. */
  readonly exact?: boolean;
  readonly count?: number;
  /** Opens in a new tab instead of routing (the visual editor is the storefront). */
  readonly external?: boolean;
  readonly active: boolean;
};

export type WorkspaceNavItem = {
  readonly id: DestinationId;
  /** What `setPage` is called with — the page this destination renders as today. */
  readonly page: WorkspacePage;
  readonly label: string;
  readonly icon: AdminShellIconName;
  readonly href: string;
  readonly active: boolean;
  readonly badge: WorkspaceNavBadge | null;
  readonly subItems: readonly WorkspaceNavSubItem[];
};

export type WorkspaceNavGroup = {
  readonly id: DestinationGroup;
  /** `null` = no heading (the single Overview row). English literal. */
  readonly label: string | null;
  readonly items: readonly WorkspaceNavItem[];
};

export type WorkspaceNavResult = {
  readonly groups: readonly WorkspaceNavGroup[];
  /** Pinned to the foot of the rail — Settings — rather than flowing with a group. */
  readonly pinned: readonly WorkspaceNavItem[];
};

export type WorkspaceNavInput = {
  readonly context: WorkspaceNavContext;
  /** `/admin` on a branded host, `/{slug}/admin` on the shared one. */
  readonly adminBase: string;
  /**
   * Pages this workspace can actually open. A destination whose page is absent
   * is DROPPED even when the registry would show it, because `clampWorkspacePage`
   * refuses that page on this workspace type and the click would bounce to
   * Overview — the exact bug WP1 fixed by making the rail a projection of
   * `state.visiblePages`. Hiding a link and refusing a route must agree.
   */
  readonly visiblePages: readonly WorkspacePage[];
  /**
   * The shell's active page. Derived server-side from the request path and
   * passed through the bridge, so it is the same on both render passes — the
   * reason active state is keyed on it and not on `usePathname()`.
   */
  readonly activePage: WorkspacePage;
  /** For sub-item active state only, which is genuinely a URL question. */
  readonly pathname: string | null;
  /** Raw query string — sub-items that differ only by `?tab=` / `?compose=`. */
  readonly search: string;
  readonly badges: Readonly<Partial<Record<DestinationId, WorkspaceNavBadge>>>;
  /**
   * Counts for individual CHILDREN, keyed by the sub-item id the builder makes
   * (`<destination>-<subView>`, e.g. `people-applications`). Separate from
   * `badges` because a child's number is a different question from its
   * parent's: People counts everything awaiting a human, Applications counts
   * only the queue its link opens.
   */
  readonly subBadges?: Readonly<Partial<Record<string, number>>>;
  /** Website's sub-nav, which is its own single source of truth (website-nav.ts). */
  readonly websiteSubItems: readonly Omit<WorkspaceNavSubItem, "active">[];
};

/**
 * The query keys this destination's OWN children distinguish themselves by.
 *
 * Read off the sibling hrefs rather than named. It used to be the literal pair
 * `compose` and `tab`, which were the only two keys any sub-view used the day
 * that line was written — so the rule "keep the landing view quiet while a
 * sibling query is on" silently stopped applying the moment a destination
 * introduced a third key, and Appointments' `?view=` did exactly that: the
 * landing child and the open tab both lit up. Deriving the set means a new key
 * is covered by the rule that already exists instead of needing to be added to
 * a list nobody will remember.
 */
function siblingQueryKeys(
  siblings: ReadonlyArray<Omit<WorkspaceNavSubItem, "active">>,
): Set<string> {
  const keys = new Set<string>();
  for (const sibling of siblings) {
    const query = sibling.href.split("?")[1];
    if (!query) continue;
    for (const key of new URLSearchParams(query).keys()) keys.add(key);
  }
  return keys;
}

function subItemActive(
  sub: Omit<WorkspaceNavSubItem, "active">,
  pathname: string | null,
  search: string,
  siblingKeys: ReadonlySet<string>,
): boolean {
  if (sub.external) return false;
  const [subPath, subQuery = ""] = sub.href.split("?");
  const pathOk = sub.exact
    ? pathname === subPath
    : (pathname ?? "").startsWith(subPath);
  if (!pathOk) return false;
  const current = new URLSearchParams(search);
  if (subQuery) {
    const wanted = new URLSearchParams(subQuery);
    return [...wanted.entries()].every(([k, v]) => current.get(k) === v);
  }
  if (sub.exact) {
    // The landing view goes quiet while any sibling's own query key is present,
    // so only one child ever looks current.
    return [...siblingKeys].every((key) => current.get(key) == null);
  }
  return true;
}

/**
 * A destination's sub-views, as links.
 *
 * SUB-VIEWS HANG OFF THE LIVE ROUTE, NOT THE CANONICAL SEGMENT. People renders
 * at /admin/roster, so its children are /admin/roster/applications and friends;
 * they move with it the day the People surface lands, because `subViewHref`
 * asks the registry where the destination renders TODAY. An earlier cut of this
 * gated children on "has the destination reached its canonical segment", which
 * is why every child of every row vanished: no destination has.
 */
function subItemsFor(
  destination: Destination,
  input: WorkspaceNavInput,
): WorkspaceNavSubItem[] {
  const raw: Array<Omit<WorkspaceNavSubItem, "active">> =
    destination.id === "website"
      ? [...input.websiteSubItems]
      : visibleSubViews(destination, input.context).flatMap((view) => {
          const href = subViewHref(destination, view, input.adminBase);
          // `null` = the owner has no route. Nothing to link to, so no link.
          if (href === null) return [];
          const id = `${destination.id}-${view.id}`;
          return [
            {
              id,
              label: view.label,
              href,
              exact: view.segment === "",
              count: input.subBadges?.[id],
            },
          ];
        });
  const siblingKeys = siblingQueryKeys(raw);
  return raw.map((sub) => ({
    ...sub,
    active: subItemActive(sub, input.pathname, input.search, siblingKeys),
  }));
}

function navItem(
  destination: Destination,
  input: WorkspaceNavInput,
  activeId: DestinationId | null,
): WorkspaceNavItem | null {
  // An unbuilt destination has no screen, and `mywork` is the only one left:
  // it has no fallback either, so there is no URL a row could even point at.
  // Projects, Payments, People and Issues were each in this state and each got
  // a row the day its slice built it.
  if (!destination.built) return null;
  const href = destinationHref(destination, input.adminBase);
  const page = liveWorkspacePage(destination);
  if (href === null || page === null) return null;
  if (!input.visiblePages.includes(page)) return null;
  return {
    id: destination.id,
    page,
    label: destinationLabel(destination, input.context.preset),
    icon: destination.icon,
    href,
    active: activeId === destination.id,
    badge: input.badges[destination.id] ?? null,
    subItems: subItemsFor(destination, input),
  };
}

/**
 * The rail: the registry's groups, in the registry's order, filtered to what
 * this context can open, with Settings lifted out to the pinned foot.
 *
 * The `pos` group never appears — `sidebarGroups` drops it, because the point
 * of sale replaces the whole admin chrome and is entered from the top bar.
 */
export function workspaceNavGroups(input: WorkspaceNavInput): WorkspaceNavResult {
  // Active state from the registry's own segment/alias resolution: `/admin/menu`
  // lights Catalog, `/admin/roster` lights People, `/admin/exceptions` lights
  // Issues. No hand-written list of "which page also means this row".
  const activeId = resolveDestination(input.activePage)?.id ?? null;
  const groups: WorkspaceNavGroup[] = [];
  const pinned: WorkspaceNavItem[] = [];
  for (const group of sidebarGroups(input.context)) {
    const items: WorkspaceNavItem[] = [];
    for (const destination of group.destinations) {
      const item = navItem(destination, input, activeId);
      if (item === null) continue;
      if (destination.pinned) pinned.push(item);
      else items.push(item);
    }
    if (items.length > 0) groups.push({ id: group.group, label: group.label, items });
  }
  return { groups, pinned };
}
