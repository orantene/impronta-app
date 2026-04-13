"use client";

import Link from "next/link";
import { useLayoutEffect, useMemo, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import {
  Bookmark,
  ChevronDown,
  ClipboardList,
  Eye,
  Building2,
  FolderKanban,
  Images,
  LayoutDashboard,
  Languages,
  LayoutGrid,
  ListFilter,
  MapPinned,
  Search,
  Settings,
  Shield,
  ShieldCheck,
  SlidersHorizontal,
  Tags,
  User,
  UserRound,
  Users,
} from "lucide-react";
import type {
  DashboardNavGroup,
  DashboardNavIconKey,
  DashboardNavItem,
} from "@/lib/dashboard/architecture";
import { cn } from "@/lib/utils";

function parsePathAndQuery(href: string): { path: string; query: URLSearchParams } {
  const [p, q] = href.split("?");
  return { path: (p ?? "").split("#")[0] ?? "", query: new URLSearchParams(q ?? "") };
}

function searchParamGetNormalized(searchParams: URLSearchParams, key: string): string | null {
  const v = searchParams.get(key);
  if (v === null || v === "") return null;
  return v;
}

function normalizePathSegment(pathname: string): string {
  if (!pathname || pathname === "/") return "/";
  return pathname.replace(/\/+$/, "") || "/";
}

function isNavActive(pathname: string, searchParams: URLSearchParams, item: DashboardNavItem): boolean {
  const { path: itemPath, query: hrefQuery } = parsePathAndQuery(item.href);
  const mode = item.match ?? "prefix";
  const pathNorm = normalizePathSegment(pathname);
  const itemNorm = normalizePathSegment(itemPath);
  const pathOk =
    mode === "exact"
      ? pathNorm === itemNorm
      : pathNorm === itemNorm || pathNorm.startsWith(`${itemNorm}/`);
  if (!pathOk) return false;

  const rules: Record<string, string | null | undefined> = {};
  for (const [k, v] of hrefQuery.entries()) {
    rules[k] = v;
  }
  if (item.activeQuery) {
    Object.assign(rules, item.activeQuery);
  }

  for (const [k, raw] of Object.entries(rules)) {
    if (raw === undefined) continue;
    const got = searchParamGetNormalized(searchParams, k);
    if (raw === null) {
      if (got !== null) return false;
    } else if (got !== raw) {
      return false;
    }
  }
  return true;
}

function groupHasActive(pathname: string, searchParams: URLSearchParams, group: DashboardNavGroup): boolean {
  if (group.items.length === 0) return false;
  return group.items.some((item) => isNavActive(pathname, searchParams, item));
}

function NavIcon({ icon }: { icon: DashboardNavIconKey }) {
  switch (icon) {
    case "overview":
      return <LayoutDashboard className="size-4" aria-hidden />;
    case "profile":
      return <User className="size-4" aria-hidden />;
    case "portfolio":
    case "media":
      return <Images className="size-4" aria-hidden />;
    case "mediaLibrary":
      return <LayoutGrid className="size-4" aria-hidden />;
    case "mediaQueue":
      return <ShieldCheck className="size-4" aria-hidden />;
    case "preview":
      return <Eye className="size-4" aria-hidden />;
    case "status":
      return <SlidersHorizontal className="size-4" aria-hidden />;
    case "account":
    case "settings":
      return <Settings className="size-4" aria-hidden />;
    case "talent":
      return <Users className="size-4" aria-hidden />;
    case "clients":
      return <UserRound className="size-4" aria-hidden />;
    case "accounts":
      return <Building2 className="size-4" aria-hidden />;
    case "inquiries":
    case "requests":
      return <ClipboardList className="size-4" aria-hidden />;
    case "taxonomy":
      return <Tags className="size-4" aria-hidden />;
    case "fields":
      return <FolderKanban className="size-4" aria-hidden />;
    case "directoryFilters":
      return <ListFilter className="size-4" aria-hidden />;
    case "locations":
      return <MapPinned className="size-4" aria-hidden />;
    case "saved":
      return <Bookmark className="size-4" aria-hidden />;
    case "search":
      return <Search className="size-4" aria-hidden />;
    case "admins":
      return <Shield className="size-4" aria-hidden />;
    case "translations":
      return <Languages className="size-4" aria-hidden />;
    default:
      return <LayoutDashboard className="size-4" aria-hidden />;
  }
}

function NavLinkList({
  groupId,
  pathname,
  searchParams,
  items,
}: {
  groupId: string;
  pathname: string;
  searchParams: URLSearchParams;
  items: DashboardNavItem[];
}) {
  return (
    <div id={`nav-group-${groupId}`} className="space-y-1">
      {items.map((item) => {
        const itemActive = isNavActive(pathname, searchParams, item);
        return (
          <Link
            key={item.id ?? item.href}
            href={item.href}
            scroll={false}
            aria-current={itemActive ? "page" : undefined}
            className={cn(
              "flex items-center gap-2.5 rounded-xl border px-3 py-2.5 text-sm transition-colors",
              itemActive
                ? "border-[var(--impronta-gold)]/35 bg-[var(--impronta-gold)]/10 font-medium text-[var(--impronta-gold)]"
                : "border-transparent text-[var(--impronta-foreground)] hover:border-[var(--impronta-gold-border)]/40 hover:bg-[var(--impronta-gold-border)]/10 hover:text-[var(--impronta-gold)]",
            )}
          >
            <span className={cn("text-muted-foreground", itemActive && "text-[var(--impronta-gold)]")}>
              <NavIcon icon={item.icon} />
            </span>
            <span className="min-w-0 truncate">{item.label}</span>
          </Link>
        );
      })}
    </div>
  );
}

function DashboardNavGroupBlock({
  group,
  pathname,
  searchParams,
  forceExpanded,
}: {
  group: DashboardNavGroup;
  pathname: string;
  searchParams: URLSearchParams;
  forceExpanded?: boolean;
}) {
  const active = groupHasActive(pathname, searchParams, group);
  const queryKey = searchParams.toString();
  const detailsRef = useRef<HTMLDetailsElement>(null);
  const wasActiveRef = useRef(false);

  /**
   * Open once when navigation lands in this section (inactive → active). Do not keep
   * forcing open on every render or the user cannot collapse while staying on that route.
   */
  useLayoutEffect(() => {
    if (!group.collapsible || forceExpanded) return;
    const el = detailsRef.current;
    if (!el) return;
    const wasActive = wasActiveRef.current;
    wasActiveRef.current = active;
    if (active && !wasActive) {
      el.open = true;
    }
  }, [active, pathname, queryKey, group.collapsible, forceExpanded]);

  if (group.singleLink && group.items.length === 1) {
    const item = group.items[0];
    const itemActive = isNavActive(pathname, searchParams, item);
    return (
      <div className="space-y-2">
        <Link
          href={item.href}
          scroll={false}
          aria-current={itemActive ? "page" : undefined}
          className={cn(
            "flex items-center gap-2.5 rounded-xl border px-3 py-2.5 text-sm transition-colors",
            itemActive
              ? "border-[var(--impronta-gold)]/35 bg-[var(--impronta-gold)]/10 font-medium text-[var(--impronta-gold)]"
              : "border-transparent text-[var(--impronta-foreground)] hover:border-[var(--impronta-gold-border)]/40 hover:bg-[var(--impronta-gold-border)]/10 hover:text-[var(--impronta-gold)]",
          )}
        >
          <span className={cn("text-muted-foreground", itemActive && "text-[var(--impronta-gold)]")}>
            <NavIcon icon={item.icon} />
          </span>
          <span className="min-w-0 truncate">{item.label}</span>
        </Link>
      </div>
    );
  }

  if (group.items.length === 0) {
    return null;
  }

  /** Mobile sheet: always show all links (no native toggle). */
  if (forceExpanded || !group.collapsible) {
    return (
      <div className="space-y-2">
        <div
          className={cn(
            "flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-[0.22em]",
            active ? "text-[var(--impronta-gold)]" : "text-[var(--impronta-muted)]",
          )}
        >
          <span>{group.label}</span>
        </div>
        <NavLinkList
          groupId={group.id}
          pathname={pathname}
          searchParams={searchParams}
          items={group.items}
        />
      </div>
    );
  }

  return (
    <details ref={detailsRef} className="group space-y-2">
      <summary
        className={cn(
          "flex w-full cursor-pointer list-none items-center justify-between rounded-md px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-[0.22em] [&::-webkit-details-marker]:hidden",
          active ? "text-[var(--impronta-gold)]" : "text-[var(--impronta-muted)]",
          "transition-colors hover:text-foreground",
        )}
      >
        <span>{group.label}</span>
        <ChevronDown
          className="size-4 shrink-0 transition-transform duration-200 group-open:rotate-180"
          aria-hidden
        />
      </summary>
      <NavLinkList
        groupId={group.id}
        pathname={pathname}
        searchParams={searchParams}
        items={group.items}
      />
    </details>
  );
}

export function DashboardSidebarNavLinks({
  groups,
  forceExpanded = false,
}: {
  groups: DashboardNavGroup[];
  forceExpanded?: boolean;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const normalizedPathname = useMemo(() => pathname ?? "", [pathname]);

  return (
    <div className="space-y-4">
      {groups.map((group) => (
        <DashboardNavGroupBlock
          key={group.id}
          group={group}
          pathname={normalizedPathname}
          searchParams={searchParams}
          forceExpanded={forceExpanded}
        />
      ))}
    </div>
  );
}
