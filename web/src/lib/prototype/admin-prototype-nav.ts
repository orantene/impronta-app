import type { LucideIcon } from "lucide-react";
import {
  BarChart3,
  BookOpen,
  Building2,
  CalendarCheck,
  EyeOff,
  FileText,
  FolderKanban,
  HelpCircle,
  Images,
  Inbox,
  Languages,
  LayoutDashboard,
  LayoutGrid,
  ListFilter,
  MapPinned,
  Menu,
  Newspaper,
  Plug,
  Rocket,
  ScanSearch,
  Search,
  Shield,
  SlidersHorizontal,
  Sparkles,
  Star,
  Tags,
  Terminal,
  Undo2,
  UserRound,
  UserSearch,
  Users,
} from "lucide-react";

import { ADMIN_DOCS_NAV_LINKS } from "@/lib/admin-nav";

/** Real admin IA — sidebar links under `/admin`. */
export const ADMIN_PROTOTYPE_BASE = "/admin";

export type PrototypeNavItem = {
  /** Stable id for prefs (localStorage); derived from href under {@link ADMIN_PROTOTYPE_BASE}, or explicit override. */
  id: string;
  label: string;
  href: string;
  icon: LucideIcon;
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
): PrototypeNavItem {
  return { id: idOverride ?? prototypeNavItemStableId(href), label, href, icon };
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
 * Phase 15 / Admin shell v2 — IA promoted to operator-first order.
 *
 * Primary groups (Home, Pipeline, Talent, Site, Clients) surface the
 * five jobs an agency admin does daily. Secondary groups (Media,
 * Directory, AI, Analytics, Docs, System) hold configuration and
 * diagnostic surfaces — still reachable, visually de-emphasised by
 * rendering order.
 *
 * The Site group leads with the Composer — the builder is no longer
 * buried under /site-settings. Reach from anywhere is ≤ 2 clicks
 * (sidebar group → Composer) or 1 keystroke (Cmd+K → "Open composer").
 *
 * Route hrefs are not yet renamed — that migration lives in a follow-up
 * stage. Labels and grouping are the product call; hrefs still resolve
 * under the existing `/admin/site-settings/*` tree.
 */
export const ADMIN_PROTOTYPE_NAV: PrototypeNavGroup[] = [
  // ── Primary ───────────────────────────────────────────────────────
  {
    id: "dashboard",
    label: "Home",
    items: [navItem("Overview", `${ADMIN_PROTOTYPE_BASE}`, LayoutDashboard)],
  },
  {
    id: "operations",
    label: "Pipeline",
    items: [
      navItem("Inquiries", `${ADMIN_PROTOTYPE_BASE}/inquiries`, Inbox),
      navItem("Bookings", `${ADMIN_PROTOTYPE_BASE}/bookings`, CalendarCheck),
      navItem("Work locations", `${ADMIN_PROTOTYPE_BASE}/accounts`, Building2),
    ],
  },
  {
    id: "talent",
    label: "Roster",
    items: [
      navItem("All talent", `${ADMIN_PROTOTYPE_BASE}/talent`, Users),
      navItem("Applications", `${ADMIN_PROTOTYPE_BASE}/talent`, UserSearch, "talent-applications"),
      navItem("Featured", `${ADMIN_PROTOTYPE_BASE}/talent`, Star, "talent-featured"),
      navItem("Hidden", `${ADMIN_PROTOTYPE_BASE}/talent`, EyeOff, "talent-hidden"),
    ],
  },
  {
    id: "site",
    label: "Site",
    items: [
      // Composer first — the builder is the headline of the Site area.
      navItem("Composer", `${ADMIN_PROTOTYPE_BASE}/site-settings/structure`, LayoutDashboard, "site-composer"),
      navItem("Design", `${ADMIN_PROTOTYPE_BASE}/site-settings/design`, Sparkles, "site-design"),
      navItem("Sections", `${ADMIN_PROTOTYPE_BASE}/site-settings/sections`, LayoutGrid, "site-sections"),
      navItem("Pages", `${ADMIN_PROTOTYPE_BASE}/site-settings/content/pages`, FileText, "site-pages"),
      navItem("Navigation", `${ADMIN_PROTOTYPE_BASE}/site-settings/content/navigation`, Menu, "site-nav"),
      navItem("Posts", `${ADMIN_PROTOTYPE_BASE}/site-settings/content/posts`, Newspaper, "site-posts"),
      navItem("SEO", `${ADMIN_PROTOTYPE_BASE}/site-settings/seo`, Search, "site-seo"),
      navItem("Brand", `${ADMIN_PROTOTYPE_BASE}/site-settings/identity`, Building2, "site-brand"),
      navItem("Redirects", `${ADMIN_PROTOTYPE_BASE}/site-settings/content/redirects`, Undo2, "site-redirects"),
    ],
  },
  {
    id: "clients",
    label: "Clients",
    items: [navItem("Clients", `${ADMIN_PROTOTYPE_BASE}/clients`, UserRound)],
  },
  // ── Secondary ─────────────────────────────────────────────────────
  {
    id: "media",
    label: "Media",
    items: [
      navItem("Pending approvals", `${ADMIN_PROTOTYPE_BASE}/media`, Images),
      navItem("Library", `${ADMIN_PROTOTYPE_BASE}/media?tab=library`, LayoutGrid),
    ],
  },
  {
    id: "directory",
    label: "Directory",
    items: [
      navItem("Fields", `${ADMIN_PROTOTYPE_BASE}/fields`, FolderKanban),
      navItem("Filters", `${ADMIN_PROTOTYPE_BASE}/directory/filters`, ListFilter),
      navItem("Taxonomy", `${ADMIN_PROTOTYPE_BASE}/taxonomy`, Tags),
      navItem("Locations", `${ADMIN_PROTOTYPE_BASE}/locations`, MapPinned),
    ],
  },
  {
    id: "analytics",
    label: "Analytics",
    items: [
      navItem("Executive", `${ADMIN_PROTOTYPE_BASE}/analytics/overview`, BarChart3, "analytics-overview"),
      navItem("Traffic", `${ADMIN_PROTOTYPE_BASE}/analytics/acquisition`, BarChart3, "analytics-traffic"),
      navItem("Funnels", `${ADMIN_PROTOTYPE_BASE}/analytics/funnels`, BarChart3, "analytics-funnels"),
      navItem("Marketplace", `${ADMIN_PROTOTYPE_BASE}/analytics/talent`, BarChart3, "analytics-marketplace"),
      navItem("AI / Search", `${ADMIN_PROTOTYPE_BASE}/analytics/search`, BarChart3, "analytics-ai-search"),
      navItem("SEO", `${ADMIN_PROTOTYPE_BASE}/analytics/seo`, BarChart3, "analytics-seo"),
    ],
  },
  {
    id: "ai",
    label: "AI",
    items: [
      navItem("AI workspace", `${ADMIN_PROTOTYPE_BASE}/ai-workspace`, Sparkles),
      navItem("AI Settings", `${ADMIN_PROTOTYPE_BASE}/ai-workspace/settings`, SlidersHorizontal),
      navItem("Search logs", `${ADMIN_PROTOTYPE_BASE}/ai-workspace/logs`, Search),
      navItem("Match preview", `${ADMIN_PROTOTYPE_BASE}/ai-workspace/match-preview`, ScanSearch),
      navItem("Console", `${ADMIN_PROTOTYPE_BASE}/ai-workspace/console`, Terminal),
    ],
  },
  {
    id: "docs",
    label: "Docs",
    items: ADMIN_DOCS_NAV_LINKS.map((link, index) => {
      const icons: LucideIcon[] = [
        BookOpen,
        Sparkles,
        Search,
        Users,
        Inbox,
        ListFilter,
        Tags,
        Star,
        BarChart3,
        Languages,
        Shield,
        Plug,
        SlidersHorizontal,
        HelpCircle,
        Rocket,
      ];
      const icon = icons[index] ?? FileText;
      return navItem(link.label, link.href, icon);
    }),
  },
  {
    id: "system",
    label: "System",
    items: [
      navItem("Translations", `${ADMIN_PROTOTYPE_BASE}/translations`, Languages),
      navItem("Feature flags", `${ADMIN_PROTOTYPE_BASE}/settings`, SlidersHorizontal, "system-feature-flags"),
      navItem("Users — search", `${ADMIN_PROTOTYPE_BASE}/users/search`, UserSearch),
      navItem("Users — admins", `${ADMIN_PROTOTYPE_BASE}/users/admins`, Shield),
      navItem("Account", `${ADMIN_PROTOTYPE_BASE}/account`, UserRound),
    ],
  },
];

/** IDs of the primary (operator-daily) nav groups — used for sidebar visual priority. */
export const ADMIN_PROTOTYPE_PRIMARY_GROUP_IDS = new Set([
  "dashboard",
  "operations",
  "talent",
  "site",
  "clients",
]);
