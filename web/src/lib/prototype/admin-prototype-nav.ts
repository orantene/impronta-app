import type { LucideIcon } from "lucide-react";
import {
  CalendarCheck,
  HelpCircle,
  Inbox,
  LayoutDashboard,
  Settings,
  Sparkles,
  UserCog,
  UserRound,
  Users,
} from "lucide-react";

/** Real admin IA — sidebar links under `/admin`. */
export const ADMIN_PROTOTYPE_BASE = "/admin";

export type PrototypeNavItem = {
  /** Stable id for prefs (localStorage); derived from href under {@link ADMIN_PROTOTYPE_BASE}, or explicit override. */
  id: string;
  label: string;
  href: string;
  icon: LucideIcon;
  /**
   * One-line plain-English explanation of what this destination is for. Surfaced
   * as the sidebar tooltip on hover (and as the only visible label when the
   * sidebar is collapsed). Aim for "verb-first, what the operator does here".
   */
  description?: string;
};

/** Stable key for a nav item: path under the admin base, plus query when present; or `index` for overview. */
export function prototypeNavItemStableId(href: string): string {
  const [pathPart, queryPart] = href.split("?");
  const base = ADMIN_PROTOTYPE_BASE.replace(/\/+$/, "");
  const path = (pathPart ?? "").split("#")[0] ?? "";
  const trimmed = path.replace(/\/+$/, "") || "/";
  let segmentId: string;
  if (trimmed === base || trimmed === "/") {
    segmentId = "index";
  } else {
    const prefix = `${base}/`;
    if (trimmed.startsWith(prefix)) {
      const rel = trimmed.slice(prefix.length);
      segmentId = rel || "index";
    } else {
      segmentId = trimmed.replace(/^\//, "") || "index";
    }
  }
  if (!queryPart) return segmentId;
  const sp = new URLSearchParams(queryPart);
  const parts = [...sp.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  const q = parts.map(([k, v]) => `${k}_${v}`).join("__");
  return q ? `${segmentId}__${q}` : segmentId;
}

function navItem(
  label: string,
  href: string,
  icon: LucideIcon,
  idOverride?: string,
  description?: string,
): PrototypeNavItem {
  return {
    id: idOverride ?? prototypeNavItemStableId(href),
    label,
    href,
    icon,
    ...(description ? { description } : {}),
  };
}

export type PrototypeNavGroup = {
  id: string;
  label: string;
  items: PrototypeNavItem[];
};

/** Global sidebar order for sorting pinned items. */
export function flattenPrototypeNavWithOrder(
  nav: PrototypeNavGroup[],
): Array<{ item: PrototypeNavItem; order: number }> {
  let order = 0;
  const out: Array<{ item: PrototypeNavItem; order: number }> = [];
  for (const group of nav) {
    for (const item of group.items) {
      out.push({ item, order: order++ });
    }
  }
  return out;
}

export function prototypeNavItemMap(nav: PrototypeNavGroup[]): Map<string, PrototypeNavItem> {
  const m = new Map<string, PrototypeNavItem>();
  for (const group of nav) {
    for (const item of group.items) {
      m.set(item.id, item);
    }
  }
  return m;
}

/**
 * Phase 16 — Admin sidebar consolidation.
 *
 * The previous IA carried 11 groups with ~60 sidebar items, each pointing
 * at one configuration surface. The Site control center (`/admin/site`)
 * and Profile settings (`/admin/profile`) now act as **capability
 * indexes** — every storefront/site config surface is reachable via tile
 * cards from `/admin/site`, and every field/list surface from
 * `/admin/profile`. The sidebar collapses to three groups that mirror the
 * mockup mental model:
 *
 *   Workspace → Home, Inquiries, Bookings, Talents, Clients
 *   Site & AI → Site, Profile settings, AI workspace
 *   System    → Account, Settings, Admins
 *
 * Removed-from-sidebar (still reachable via Site / Profile / Cmd+K):
 *   Composer, Design, Sections, Pages, Posts, Navigation, SEO, Brand,
 *   Redirects, Fields, Filters, Taxonomy, Locations, Media library,
 *   Analytics (6 sub-routes), Translations, Docs (15 sub-routes),
 *   AI sub-routes, Roster filter shortcuts (Applications/Featured/Hidden).
 *
 * Routes themselves are untouched — only the sidebar surface area is
 * consolidated. Cmd+K palette can still jump anywhere.
 */
export const ADMIN_PROTOTYPE_NAV: PrototypeNavGroup[] = [
  {
    id: "workspace",
    label: "Workspace",
    items: [
      navItem(
        "Home",
        `${ADMIN_PROTOTYPE_BASE}`,
        LayoutDashboard,
        undefined,
        "Daily overview \u2014 alerts, queue, recent activity",
      ),
      navItem(
        "Inquiries",
        `${ADMIN_PROTOTYPE_BASE}/inquiries`,
        Inbox,
        undefined,
        "Incoming requests, triage and convert to bookings",
      ),
      navItem(
        "Bookings",
        `${ADMIN_PROTOTYPE_BASE}/bookings`,
        CalendarCheck,
        undefined,
        "Confirmed jobs \u2014 schedule, contracts, talent on call",
      ),
      navItem(
        "Talents",
        `${ADMIN_PROTOTYPE_BASE}/talent`,
        Users,
        undefined,
        "Roster \u2014 model profiles, applications, availability",
      ),
      navItem(
        "Clients",
        `${ADMIN_PROTOTYPE_BASE}/clients`,
        UserRound,
        undefined,
        "Client accounts \u2014 contacts, locations, history",
      ),
    ],
  },
  {
    id: "site-and-ai",
    label: "Site & AI",
    items: [
      navItem(
        "Site",
        `${ADMIN_PROTOTYPE_BASE}/site`,
        LayoutDashboard,
        "site-control-center",
        "Public storefront \u2014 pages, design, navigation, SEO",
      ),
      navItem(
        "Profile settings",
        `${ADMIN_PROTOTYPE_BASE}/profile`,
        UserCog,
        undefined,
        "Roster fields, filters, taxonomy \u2014 what shows on profiles",
      ),
      navItem(
        "AI workspace",
        `${ADMIN_PROTOTYPE_BASE}/ai-workspace`,
        Sparkles,
        undefined,
        "Generators, copy assists, model briefs",
      ),
    ],
  },
  {
    id: "system",
    label: "System",
    items: [
      navItem(
        "Account & billing",
        `${ADMIN_PROTOTYPE_BASE}/account`,
        UserRound,
        "system-account",
        "Plan, invoices, agency owner profile",
      ),
      navItem(
        "Settings",
        `${ADMIN_PROTOTYPE_BASE}/settings`,
        Settings,
        "system-settings",
        "Tenant configuration, locale, integrations",
      ),
      navItem(
        "Users",
        `${ADMIN_PROTOTYPE_BASE}/users`,
        Users,
        undefined,
        "Staff and admin seats \u2014 invite, permissions",
      ),
      navItem(
        "Help",
        `${ADMIN_PROTOTYPE_BASE}/docs`,
        HelpCircle,
        "system-help",
        "Operator docs and how-it-works guides",
      ),
    ],
  },
];

/** IDs of the primary (operator-daily) nav groups — used for sidebar visual priority. */
export const ADMIN_PROTOTYPE_PRIMARY_GROUP_IDS = new Set([
  "workspace",
  "site-and-ai",
]);
