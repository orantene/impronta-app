"use client";

import Link from "next/link";
import {
  type ReadonlyURLSearchParams,
  usePathname,
  useSearchParams,
} from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from "react";
import { signOut } from "@/app/auth/actions";
import {
  Bookmark,
  ChevronDown,
  Home,
  Inbox,
  LogOut,
  Menu,
  Moon,
  PanelLeftClose,
  PanelLeft,
  Pin,
  Sun,
  Users,
} from "lucide-react";
import {
  ADMIN_PROTOTYPE_NAV,
  flattenPrototypeNavWithOrder,
  prototypeNavItemMap,
} from "@/lib/prototype/admin-prototype-nav";
import { isPrototypeNavActive } from "@/lib/prototype/admin-prototype-nav-match";
import {
  loadPinnedIds,
  loadTopShortcutIds,
  savePinnedIds,
  saveTopShortcutIds,
  togglePinnedId,
  toggleTopShortcutId,
} from "@/lib/prototype/admin-prototype-prefs";
import { AdminContextualInspector } from "@/components/admin/inspector/admin-contextual-inspector";
import { PlanViewbar } from "@/components/prototype/plan-viewbar";
import { AgencySwitcher } from "@/components/admin/agency-switcher";
import { DashboardLocaleToggle } from "@/components/dashboard-locale-toggle";
import type { TenantMembership } from "@/lib/saas";
import { PLATFORM_BRAND } from "@/lib/platform/brand";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

const ADMIN_PROTOTYPE_THEME_KEY = "admin-prototype-theme";
const ADMIN_PROTOTYPE_NAV_EXPANDED_KEY = "admin-prototype-nav-expanded-ids";
const ADMIN_INSPECTOR_PANEL_OPEN_KEY = "admin-inspector-panel-open";

const PROTOTYPE_NAV_ITEM_MAP = prototypeNavItemMap(ADMIN_PROTOTYPE_NAV);
const PROTOTYPE_NAV_FLAT_ORDER = flattenPrototypeNavWithOrder(ADMIN_PROTOTYPE_NAV);
const KNOWN_PROTOTYPE_NAV_IDS = new Set(PROTOTYPE_NAV_FLAT_ORDER.map(({ item }) => item.id));
const ALL_PROTOTYPE_GROUP_IDS = ADMIN_PROTOTYPE_NAV.map((g) => g.id);

function findActivePrototypeGroupId(
  pathname: string,
  searchParams: ReadonlyURLSearchParams | URLSearchParams | null,
): string | null {
  for (const group of ADMIN_PROTOTYPE_NAV) {
    if (
      group.items.some((item) => isPrototypeNavActive(pathname, item.href, searchParams))
    ) {
      return group.id;
    }
  }
  return null;
}

function loadStoredExpandedGroupIds(): Set<string> | null {
  try {
    const raw = localStorage.getItem(ADMIN_PROTOTYPE_NAV_EXPANDED_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return null;
    const ids = parsed.filter((x): x is string => typeof x === "string");
    return new Set(ids.filter((id) => ALL_PROTOTYPE_GROUP_IDS.includes(id)));
  } catch {
    return null;
  }
}

function persistExpandedGroupIds(ids: Set<string>) {
  try {
    localStorage.setItem(
      ADMIN_PROTOTYPE_NAV_EXPANDED_KEY,
      JSON.stringify([...ids].filter((id) => ALL_PROTOTYPE_GROUP_IDS.includes(id))),
    );
  } catch {
    /* ignore */
  }
}

function PrototypeTopShortcutsBar({ shortcutIds }: { shortcutIds: string[] }) {
  const pathname = usePathname() ?? "/";
  const searchParams = useSearchParams();
  if (shortcutIds.length === 0) return null;

  return (
    <div
      className="sticky top-[9rem] z-30 flex gap-1.5 overflow-x-auto overscroll-x-contain border-b border-[var(--admin-gold-border)]/70 bg-[var(--admin-workspace-bg)]/95 px-4 py-2 backdrop-blur-md supports-[backdrop-filter]:bg-[var(--admin-workspace-bg)]/88 sm:top-[6rem] lg:px-6"
      role="navigation"
      aria-label="Shortcuts"
    >
      {shortcutIds.map((id) => {
        const item = PROTOTYPE_NAV_ITEM_MAP.get(id);
        if (!item) return null;
        const active = isPrototypeNavActive(pathname, item.href, searchParams);
        const ShortcutIcon = item.icon;
        return (
          <Link
            key={id}
            href={item.href}
            scroll={false}
            className={cn(
              "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-[background-color,color,box-shadow] duration-150",
              active
                ? "border-[var(--admin-gold-border)] bg-[var(--admin-gold-soft)] text-[var(--admin-nav-active-label)] shadow-[inset_0_0_0_1px_var(--admin-gold-border)]/60"
                : "border-[var(--admin-gold-border)]/50 bg-[var(--admin-workspace-surface)] text-[var(--admin-workspace-fg)] hover:border-[var(--admin-gold-border)] hover:bg-[var(--admin-sidebar-hover)]",
            )}
            aria-current={active ? "page" : undefined}
          >
            <ShortcutIcon className="size-3.5 text-[var(--admin-gold)]" aria-hidden />
            <span className="max-w-[10rem] truncate">{item.label}</span>
          </Link>
        );
      })}
    </div>
  );
}

function PrototypeNavSections({
  collapsed,
  onNavigate,
  pinnedIds,
  shortcutIds,
  onTogglePin,
  onToggleShortcut,
  expandAllGroups,
  navBadges,
}: {
  collapsed: boolean;
  onNavigate?: () => void;
  pinnedIds: string[];
  shortcutIds: string[];
  onTogglePin: (id: string) => void;
  onToggleShortcut: (id: string) => void;
  /** Mobile sheet: show every section open without accordion chrome. */
  expandAllGroups?: boolean;
  navBadges?: Record<string, number>;
}) {
  const pathname = usePathname() ?? "/";
  const searchParams = useSearchParams();
  const pinnedSet = useMemo(() => new Set(pinnedIds), [pinnedIds]);
  const shortcutSet = useMemo(() => new Set(shortcutIds), [shortcutIds]);
  const useAccordion = !collapsed && !expandAllGroups;

  const [expandedGroupIds, setExpandedGroupIds] = useState<Set<string>>(() => {
    const active = findActivePrototypeGroupId(pathname, searchParams);
    return new Set([active ?? "dashboard"]);
  });

  useEffect(() => {
    if (!useAccordion) return;
    const stored = loadStoredExpandedGroupIds();
    if (stored && stored.size > 0) {
      setExpandedGroupIds(stored);
    }
  }, [useAccordion]);

  useEffect(() => {
    if (!useAccordion) return;
    const active = findActivePrototypeGroupId(pathname, searchParams);
    if (!active) return;
    setExpandedGroupIds((prev) => {
      if (prev.has(active)) return prev;
      const next = new Set(prev);
      next.add(active);
      persistExpandedGroupIds(next);
      return next;
    });
  }, [pathname, searchParams, useAccordion]);

  const toggleGroup = useCallback((groupId: string) => {
    setExpandedGroupIds((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      persistExpandedGroupIds(next);
      return next;
    });
  }, []);

  const pinnedSortedItems = useMemo(
    () => PROTOTYPE_NAV_FLAT_ORDER.filter(({ item }) => pinnedSet.has(item.id)).map(({ item }) => item),
    [pinnedSet],
  );

  const renderNavLink = (item: (typeof ADMIN_PROTOTYPE_NAV)[number]["items"][number], opts?: { compact?: boolean }) => {
    const active = isPrototypeNavActive(pathname, item.href, searchParams);
    const Icon = item.icon;
    const isPinned = pinnedSet.has(item.id);
    const isShortcut = shortcutSet.has(item.id);
    const compact = opts?.compact ?? false;
    // M6.2 — if this nav item has a pending Tier-1 count, point the link at
    // the filtered queue view so a click on the sidebar goes straight to the
    // inquiries that need attention. No count → link stays at its base href.
    const badgeCount = navBadges?.[item.id] ?? 0;
    const hrefWithBadge =
      badgeCount > 0 && item.id === "inquiries"
        ? `${item.href}?tier1_only=1`
        : item.href;
    const badgeLabel = badgeCount > 99 ? "99+" : String(badgeCount);

    const link = (
      <Link
        href={hrefWithBadge}
        scroll={false}
        onClick={onNavigate}
        aria-current={active ? "page" : undefined}
        aria-label={badgeCount > 0 ? `${item.label} — ${badgeCount} needs attention` : undefined}
        className={cn(
          "group/nav relative flex min-w-0 items-center gap-3 py-2.5 text-sm transition-[background-color,color,box-shadow] duration-150 ease-out",
          compact || collapsed ? "justify-center rounded-xl px-2" : "flex-1 overflow-hidden rounded-full pl-4 pr-2",
          active
            ? "bg-[var(--admin-gold-soft)] text-[var(--admin-nav-active-label)] shadow-[inset_0_0_0_1px_var(--admin-gold-border)]"
            : "text-[var(--admin-nav-idle)] hover:bg-[var(--admin-sidebar-hover)] hover:text-[var(--admin-nav-hover-fg)]",
        )}
      >
        {!collapsed && !compact && active ? (
          <span
            className="pointer-events-none absolute left-2 top-1/2 h-6 w-[3px] -translate-y-1/2 rounded-full bg-[var(--admin-gold)] shadow-[0_0_12px_color-mix(in_oklab,var(--admin-gold)_40%,transparent)]"
            aria-hidden
          />
        ) : null}
        <span className="relative shrink-0">
          <Icon
            className={cn(
              "size-4 transition-colors duration-150",
              active
                ? "text-[var(--admin-gold)]"
                : "text-[var(--admin-nav-idle)] group-hover/nav:text-[var(--admin-gold-bright)]",
            )}
            aria-hidden
          />
          {badgeCount > 0 && (collapsed || compact) ? (
            <span
              className="pointer-events-none absolute -right-1.5 -top-1.5 inline-flex min-w-[1.1rem] items-center justify-center rounded-full bg-[var(--admin-gold)] px-1 text-[9px] font-semibold leading-[1.1rem] text-[#1a1305] shadow-sm"
              aria-hidden
            >
              {badgeLabel}
            </span>
          ) : null}
        </span>
        {!collapsed && !compact ? (
          <span className="min-w-0 flex-1 truncate">{item.label}</span>
        ) : null}
        {!collapsed && !compact && badgeCount > 0 ? (
          <span
            className="ml-auto inline-flex min-w-[1.25rem] items-center justify-center rounded-full bg-[var(--admin-gold)] px-1.5 py-0.5 text-[10px] font-semibold leading-none text-[#1a1305] shadow-sm"
            aria-hidden
          >
            {badgeLabel}
          </span>
        ) : null}
      </Link>
    );

    const controls =
      !collapsed && !compact ? (
        <div
          className={cn(
            "flex shrink-0 items-center gap-0.5 pr-1 transition-opacity duration-150",
            isPinned || isShortcut ? "opacity-100" : "opacity-0 group-hover/row:opacity-100",
          )}
        >
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                aria-label={isPinned ? "Unpin from sidebar top" : "Pin to sidebar top"}
                aria-pressed={isPinned}
                className={cn(
                  "flex size-8 items-center justify-center rounded-lg text-[var(--admin-nav-idle)] transition-colors hover:bg-[var(--admin-sidebar-hover)] hover:text-[var(--admin-gold-bright)]",
                  isPinned && "text-[var(--admin-gold)]",
                )}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onTogglePin(item.id);
                }}
              >
                <Pin className="size-3.5" aria-hidden />
              </button>
            </TooltipTrigger>
            <TooltipContent side="right">{isPinned ? "Unpin" : "Pin to top"}</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                aria-label={isShortcut ? "Remove from top shortcuts" : "Show in top shortcuts bar"}
                aria-pressed={isShortcut}
                className={cn(
                  "flex size-8 items-center justify-center rounded-lg text-[var(--admin-nav-idle)] transition-colors hover:bg-[var(--admin-sidebar-hover)] hover:text-[var(--admin-gold-bright)]",
                  isShortcut && "text-[var(--admin-gold)]",
                )}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onToggleShortcut(item.id);
                }}
              >
                <Bookmark className="size-3.5" aria-hidden />
              </button>
            </TooltipTrigger>
            <TooltipContent side="right">{isShortcut ? "Remove shortcut" : "Top shortcut"}</TooltipContent>
          </Tooltip>
        </div>
      ) : null;

    const row = (
      <div
        className={cn(
          "group/row flex items-center",
          !collapsed && !compact ? "rounded-full ring-1 ring-transparent transition-[box-shadow,background-color] hover:ring-[var(--admin-gold-border)]/35" : "",
        )}
      >
        {link}
        {controls}
      </div>
    );

    if (collapsed || compact) {
      return (
        <Tooltip key={item.id}>
          <TooltipTrigger asChild>{row}</TooltipTrigger>
          <TooltipContent side="right">{item.label}</TooltipContent>
        </Tooltip>
      );
    }

    return (
      <div key={item.id} className="min-w-0">
        {row}
      </div>
    );
  };

  const pinnedBlock =
    pinnedSortedItems.length > 0 ? (
      <div
        className={cn(
          "space-y-1.5",
          !collapsed && "mb-4 border-b border-[var(--admin-gold-border)]/40 pb-4",
          collapsed && "mb-2 border-b border-[var(--admin-gold-border)]/40 pb-2",
        )}
      >
        {!collapsed ? (
          <p className="px-3 text-[10px] font-medium uppercase tracking-[0.28em] text-[var(--admin-gold-muted)]">
            Pinned
          </p>
        ) : null}
        <div className="space-y-0.5">{pinnedSortedItems.map((item) => renderNavLink(item, { compact: collapsed }))}</div>
      </div>
    ) : null;

  const renderGroupBody = (visibleItems: (typeof ADMIN_PROTOTYPE_NAV)[number]["items"]) => (
    <div className="space-y-0.5 pb-1 pl-1">
      {visibleItems.map((item) => renderNavLink(item, { compact: collapsed }))}
    </div>
  );

  return (
    <div className="px-2 py-1">
      {pinnedBlock}
      {ADMIN_PROTOTYPE_NAV.map((group, groupIndex) => {
        const visibleItems = group.items.filter((item) => !pinnedSet.has(item.id));
        if (visibleItems.length === 0) return null;

        const isOpen = expandAllGroups || expandedGroupIds.has(group.id);
        const sectionTop =
          groupIndex === 0
            ? pinnedSortedItems.length > 0
              ? "mt-3"
              : ""
            : expandAllGroups
              ? "mt-5 border-t border-[var(--admin-gold-border)]/35 pt-4"
              : "mt-1.5";

        if (collapsed) {
          return (
            <div key={group.id} className={cn(sectionTop, "space-y-0.5")}>
              {renderGroupBody(visibleItems)}
            </div>
          );
        }

        if (!useAccordion) {
          return (
            <div key={group.id} className={cn("space-y-1.5", sectionTop)}>
              <p className="px-3 text-[10px] font-medium uppercase tracking-[0.28em] text-[var(--admin-gold-muted)]">
                {group.label}
              </p>
              {renderGroupBody(visibleItems)}
            </div>
          );
        }

        const groupActive = visibleItems.some((item) =>
          isPrototypeNavActive(pathname, item.href, searchParams),
        );

        return (
          <div key={group.id} className={cn(sectionTop)}>
            <button
              type="button"
              id={`admin-nav-group-${group.id}-trigger`}
              aria-controls={`admin-nav-group-${group.id}-panel`}
              aria-expanded={isOpen}
              className={cn(
                "flex w-full items-center gap-2 rounded-xl px-2 py-2 text-left transition-[background-color,color] duration-150",
                "text-[10px] font-medium uppercase tracking-[0.28em] text-[var(--admin-gold-muted)]",
                "hover:bg-[var(--admin-sidebar-hover)]/80 hover:text-[var(--admin-gold-bright)]",
                groupActive && "text-[var(--admin-gold)]",
              )}
              onClick={() => toggleGroup(group.id)}
            >
              <ChevronDown
                className={cn(
                  "size-3.5 shrink-0 text-[var(--admin-gold)]/70 transition-transform duration-200",
                  !isOpen && "-rotate-90",
                )}
                aria-hidden
              />
              <span className="min-w-0 flex-1 truncate">{group.label}</span>
            </button>
            <div
              id={`admin-nav-group-${group.id}-panel`}
              role="region"
              aria-labelledby={`admin-nav-group-${group.id}-trigger`}
              className={cn(
                "grid transition-[grid-template-rows] duration-200 ease-out",
                isOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
              )}
            >
              <div
                className={cn("min-h-0 overflow-hidden", !isOpen && "pointer-events-none")}
                aria-hidden={!isOpen}
              >
                {renderGroupBody(visibleItems)}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export type AdminPrototypeChromeTheme = "dark" | "light";

export type AdminDashboardShellProps = {
  children: React.ReactNode;
  /** DB-backed dashboard theme — keeps `--impronta-*` tokens aligned with existing admin pages. */
  dashboardTheme: "dark" | "light";
  /**
   * Per-nav-item badge counts, keyed by the stable id from
   * `prototypeNavItemStableId(href)` (e.g. `inquiries`). Values > 0 render a
   * gold chip on the link. Any missing keys render no badge. Added in M6.2 so
   * the sidebar surfaces the Tier-1 count without inventing a new inbox.
   */
  navBadges?: Record<string, number>;
  /**
   * Tenants the current actor is a staff member of (or all tenants for
   * platform super_admins). Rendered as an AgencySwitcher in the sidebar
   * header when length > 1. Empty array means "no workspace" (layout should
   * have redirected before we got here).
   */
  tenants?: TenantMembership[];
  /** Tenant id currently in scope per {@link getTenantScope}, or null. */
  activeTenantId?: string | null;
};

export function AdminDashboardShell({
  children,
  dashboardTheme,
  navBadges,
  tenants = [],
  activeTenantId = null,
}: AdminDashboardShellProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [chromeTheme, setChromeTheme] = useState<AdminPrototypeChromeTheme>("light");
  const [pinnedIds, setPinnedIds] = useState<string[]>([]);
  const [shortcutIds, setShortcutIds] = useState<string[]>([]);
  const pathname = usePathname() ?? "/";

  useLayoutEffect(() => {
    try {
      const raw = localStorage.getItem(ADMIN_PROTOTYPE_THEME_KEY);
      if (raw === "light" || raw === "dark") {
        setChromeTheme(raw);
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(ADMIN_INSPECTOR_PANEL_OPEN_KEY);
      if (raw === "1") setPanelOpen(true);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    const pins = loadPinnedIds().filter((id) => KNOWN_PROTOTYPE_NAV_IDS.has(id));
    const shorts = loadTopShortcutIds().filter((id) => KNOWN_PROTOTYPE_NAV_IDS.has(id));
    setPinnedIds(pins);
    setShortcutIds(shorts);
  }, []);

  const onTogglePin = useCallback((id: string) => {
    setPinnedIds((prev) => {
      const next = togglePinnedId(prev, id);
      savePinnedIds(next);
      return next;
    });
  }, []);

  const onToggleShortcut = useCallback((id: string) => {
    setShortcutIds((prev) => {
      const next = toggleTopShortcutId(prev, id);
      saveTopShortcutIds(next);
      return next;
    });
  }, []);

  const setTheme = (next: AdminPrototypeChromeTheme) => {
    setChromeTheme(next);
    try {
      localStorage.setItem(ADMIN_PROTOTYPE_THEME_KEY, next);
    } catch {
      /* ignore */
    }
  };

  const opsActive =
    pathname.startsWith("/admin/inquiries") ||
    pathname.startsWith("/admin/bookings") ||
    pathname.startsWith("/admin/accounts");
  const talentActive = pathname.startsWith("/admin/talent");
  const homeActive = isPrototypeNavActive(pathname, "/admin");

  return (
    <TooltipProvider delayDuration={0}>
      <div
        data-dashboard-theme={dashboardTheme}
        className={cn(
          `dashboard-theme-${dashboardTheme}`,
          "flex min-h-[100dvh] flex-col bg-[var(--admin-workspace-bg)] text-[var(--admin-workspace-fg)]",
        )}
        data-admin-prototype="1"
        data-admin-prototype-theme={chromeTheme}
      >
        {/* Plan + view simulator (mockup viewbar) — black sticky strip */}
        <PlanViewbar />

        <div className="flex min-h-0 flex-1">
        {/* Desktop sidebar */}
        <aside
          className={cn(
            "sticky top-[44px] z-30 hidden h-[calc(100dvh-44px)] shrink-0 flex-col border-r border-[var(--admin-gold-border)] bg-[var(--admin-sidebar-bg)] backdrop-blur-sm lg:flex",
            collapsed ? "w-[4.5rem]" : "w-60",
          )}
        >
          <div className="flex h-14 items-center gap-2 border-b border-[var(--admin-gold-border)] px-3">
            {!collapsed ? (
              <span className="font-display text-xs font-semibold uppercase tracking-[0.22em] text-[var(--admin-gold)]">
                {PLATFORM_BRAND.name}
              </span>
            ) : null}
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="ml-auto size-9 shrink-0 rounded-xl text-[var(--admin-nav-idle)] transition-colors duration-150 hover:bg-[var(--admin-sidebar-hover)] hover:text-[var(--admin-gold-bright)]"
              onClick={() => setCollapsed((c) => !c)}
              aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            >
              {collapsed ? <PanelLeft className="size-4" /> : <PanelLeftClose className="size-4" />}
            </Button>
          </div>
          {tenants.length > 0 ? (
            <div className="border-b border-[var(--admin-gold-border)] px-3 py-2">
              <AgencySwitcher
                tenants={tenants}
                activeTenantId={activeTenantId}
                collapsed={collapsed}
              />
            </div>
          ) : null}
          <nav className="min-h-0 flex-1 overflow-y-auto overscroll-contain py-3">
            <PrototypeNavSections
              collapsed={collapsed}
              pinnedIds={pinnedIds}
              shortcutIds={shortcutIds}
              onTogglePin={onTogglePin}
              onToggleShortcut={onToggleShortcut}
              navBadges={navBadges}
            />
          </nav>
          <div className="shrink-0 space-y-2 border-t border-[var(--admin-gold-border)] p-3">
            {collapsed ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <form action={signOut} className="flex justify-center">
                    <Button
                      type="submit"
                      variant="outline"
                      size="icon"
                      className="size-10 rounded-xl border-[var(--admin-gold-border)] bg-transparent text-[var(--admin-gold)] hover:bg-[var(--admin-sidebar-hover)]"
                      aria-label="Sign out"
                    >
                      <LogOut className="size-4" aria-hidden />
                    </Button>
                  </form>
                </TooltipTrigger>
                <TooltipContent side="right">Sign out</TooltipContent>
              </Tooltip>
            ) : (
              <form action={signOut}>
                <Button
                  type="submit"
                  variant="outline"
                  size="sm"
                  className="w-full gap-2 rounded-xl border-[var(--admin-gold-border)] bg-transparent text-[var(--admin-gold-bright)] hover:bg-[var(--admin-sidebar-hover)]"
                >
                  <LogOut className="size-4 shrink-0" aria-hidden />
                  Sign out
                </Button>
              </form>
            )}
            {collapsed ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Link
                    href="/"
                    aria-label="Exit to site"
                    className="mx-auto flex size-10 items-center justify-center rounded-xl text-[var(--admin-nav-idle)] transition-colors hover:bg-[var(--admin-sidebar-hover)] hover:text-[var(--admin-nav-hover-fg)]"
                  >
                    <Home className="size-4" aria-hidden />
                  </Link>
                </TooltipTrigger>
                <TooltipContent side="right">Exit to site</TooltipContent>
              </Tooltip>
            ) : (
              <Button
                variant="ghost"
                size="sm"
                className="w-full gap-2 rounded-xl text-[var(--admin-nav-idle)] hover:bg-[var(--admin-sidebar-hover)] hover:text-[var(--admin-nav-hover-fg)]"
                asChild
              >
                <Link href="/">
                  <Home className="size-4 shrink-0" aria-hidden />
                  Exit to site
                </Link>
              </Button>
            )}
          </div>
        </aside>

        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetContent
            side="left"
            data-admin-prototype="1"
            data-admin-prototype-theme={chromeTheme}
            className="w-[min(100vw-2rem,20rem)] border-[var(--admin-gold-border)] bg-[var(--admin-sidebar-bg)] p-0 text-[var(--admin-workspace-fg)]"
          >
            <SheetHeader className="border-b border-[var(--admin-gold-border)] px-4 py-4 text-left">
              <SheetTitle className="font-display text-sm uppercase tracking-[0.22em] text-[var(--admin-gold)]">
                Menu
              </SheetTitle>
            </SheetHeader>
            {tenants.length > 0 ? (
              <div className="border-b border-[var(--admin-gold-border)] px-4 py-3">
                <AgencySwitcher tenants={tenants} activeTenantId={activeTenantId} />
              </div>
            ) : null}
            <div className="max-h-[calc(100dvh-11rem)] overflow-y-auto">
              <PrototypeNavSections
                collapsed={false}
                expandAllGroups
                onNavigate={() => setMobileOpen(false)}
                pinnedIds={pinnedIds}
                shortcutIds={shortcutIds}
                onTogglePin={onTogglePin}
                onToggleShortcut={onToggleShortcut}
                navBadges={navBadges}
              />
            </div>
            <div className="border-t border-[var(--admin-gold-border)] px-4 py-3 sm:hidden">
              <p className="mb-2 text-[10px] font-medium uppercase tracking-[0.22em] text-[var(--admin-gold-muted)]">
                Language
              </p>
              <DashboardLocaleToggle variant="prototype" />
            </div>
          </SheetContent>
        </Sheet>

        <div className="flex min-w-0 flex-1 flex-col bg-[var(--admin-workspace-bg)] text-[var(--admin-workspace-fg)]">
          {/* Top bar — slim mockup-style strip: mobile menu, theme toggle,
              and sign out. The contextual breadcrumb + tier-chip live in
              AdminTopBar below this header. */}
          <header className="sticky top-[44px] z-40 flex h-11 items-center gap-2 border-b border-[rgba(24,24,27,0.08)] bg-[var(--admin-workspace-bg)]/92 px-3 backdrop-blur-md supports-[backdrop-filter]:bg-[var(--admin-workspace-bg)]/85 sm:px-4 lg:px-6">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-8 shrink-0 rounded-lg text-foreground/70 transition-colors duration-150 hover:bg-foreground/[0.05] hover:text-foreground lg:hidden"
              aria-label="Open menu"
              onClick={() => setMobileOpen(true)}
            >
              <Menu className="size-4" />
            </Button>
            <div className="flex-1" />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-8 shrink-0 rounded-lg text-foreground/60 transition-colors duration-150 hover:bg-foreground/[0.05] hover:text-foreground"
              aria-label={chromeTheme === "dark" ? "Use light workspace" : "Use dark workspace"}
              onClick={() => setTheme(chromeTheme === "dark" ? "light" : "dark")}
            >
              {chromeTheme === "dark" ? <Sun className="size-4" aria-hidden /> : <Moon className="size-4" aria-hidden />}
            </Button>
            <form action={signOut}>
              <Button
                type="submit"
                variant="ghost"
                size="icon"
                className="size-8 shrink-0 rounded-lg text-foreground/60 transition-colors duration-150 hover:bg-foreground/[0.05] hover:text-foreground"
                aria-label="Sign out"
              >
                <LogOut className="size-4" aria-hidden />
              </Button>
            </form>
          </header>

          <PrototypeTopShortcutsBar shortcutIds={shortcutIds} />

          {/* Main + optional right panel */}
          <div className="flex min-w-0 flex-1">
            <main className="admin-prototype-main min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8">
              {children}
            </main>

            {panelOpen ? (
              <aside className="hidden w-[min(100vw,22rem)] shrink-0 border-l border-[var(--admin-gold-border)] bg-[var(--admin-panel-bg)] p-4 text-[var(--admin-workspace-fg)] shadow-sm lg:block">
                <AdminContextualInspector />
              </aside>
            ) : null}
          </div>
        </div>
        </div>

        {/* Mobile bottom nav — same gold active treatment */}
        <nav
          className="fixed bottom-0 left-0 right-0 z-50 flex border-t border-[var(--admin-gold-border)] bg-[var(--admin-workspace-elevated)] px-2 py-2 text-[var(--admin-workspace-fg)] backdrop-blur-md lg:hidden"
          aria-label="Primary"
        >
          <Link
            href="/admin"
            className={cn(
              "flex flex-1 flex-col items-center gap-0.5 rounded-xl py-2 text-[10px] font-medium transition-colors duration-150",
              homeActive
                ? "bg-[var(--admin-gold-soft)] text-[var(--admin-nav-active-label)] shadow-[inset_0_0_0_1px_var(--admin-gold-border)]"
                : "text-[var(--admin-nav-idle)] hover:bg-[var(--admin-sidebar-hover)] hover:text-[var(--admin-nav-hover-fg)]",
            )}
          >
            <Home
              className={cn("size-5", homeActive ? "text-[var(--admin-gold)]" : "")}
              aria-hidden
            />
            Home
          </Link>
          <Link
            href="/admin/inquiries"
            className={cn(
              "flex flex-1 flex-col items-center gap-0.5 rounded-xl py-2 text-[10px] font-medium transition-colors duration-150",
              opsActive
                ? "bg-[var(--admin-gold-soft)] text-[var(--admin-nav-active-label)] shadow-[inset_0_0_0_1px_var(--admin-gold-border)]"
                : "text-[var(--admin-nav-idle)] hover:bg-[var(--admin-sidebar-hover)] hover:text-[var(--admin-nav-hover-fg)]",
            )}
          >
            <Inbox
              className={cn("size-5", opsActive ? "text-[var(--admin-gold)]" : "")}
              aria-hidden
            />
            Ops
          </Link>
          <Link
            href="/admin/talent"
            className={cn(
              "flex flex-1 flex-col items-center gap-0.5 rounded-xl py-2 text-[10px] font-medium transition-colors duration-150",
              talentActive
                ? "bg-[var(--admin-gold-soft)] text-[var(--admin-nav-active-label)] shadow-[inset_0_0_0_1px_var(--admin-gold-border)]"
                : "text-[var(--admin-nav-idle)] hover:bg-[var(--admin-sidebar-hover)] hover:text-[var(--admin-nav-hover-fg)]",
            )}
          >
            <Users
              className={cn("size-5", talentActive ? "text-[var(--admin-gold)]" : "")}
              aria-hidden
            />
            Talent
          </Link>
          <button
            type="button"
            className="flex flex-1 flex-col items-center gap-0.5 rounded-xl py-2 text-[10px] font-medium text-[var(--admin-nav-idle)] transition-colors duration-150 hover:bg-[var(--admin-sidebar-hover)] hover:text-[var(--admin-nav-hover-fg)]"
            onClick={() => setMobileOpen(true)}
          >
            <Menu className="size-5" aria-hidden />
            More
          </button>
        </nav>
      </div>
    </TooltipProvider>
  );
}
