"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Bell,
  CalendarPlus,
  ChevronDown,
  ChevronRight,
  Eye,
  Keyboard,
  LogOut,
  Menu,
  Moon,
  Plus,
  Settings,
  Sun,
  UserPlus,
  UserRound,
  Users,
  Wallet,
} from "lucide-react";

import { signOut } from "@/app/auth/actions";
import { AdminCommandPalette } from "@/components/admin/admin-command-palette";
import { AdminGlobalSearch } from "@/components/admin/admin-global-search";
import {
  AdminShortcutsDrawer,
  useShortcutsDrawerHotkey,
} from "@/components/admin/admin-shortcuts-drawer";
import { AdminWorkspaceSummaryDrawer } from "@/components/admin/admin-workspace-summary-drawer";
import { DashboardLocaleToggle } from "@/components/dashboard-locale-toggle";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useUpgradeModal } from "@/components/admin/site-control-center/upgrade-context";
import {
  formatTalentUsage,
  useAdminWorkspace,
} from "@/components/admin/workspace-context";
import { TIER_DOT, TIER_LABEL } from "@/lib/admin/plan-tiers";
import { ADMIN_NAV_LABEL_BY_SEGMENT } from "@/lib/admin/admin-nav";
import { cn } from "@/lib/utils";
import {
  loadMyNotifications,
  markNotificationsRead,
} from "@/lib/notifications/my-notifications-actions";
import type { MyNotification } from "@/lib/notifications/self-types";

/**
 * AdminShellTopBar — single dense sticky header for every /admin/* page.
 * Breadcrumb · ⌘K · +New · notifications bell · plan chip · locale/theme · avatar.
 * The page heading sits BELOW this bar; content starts ~110px from the top.
 */

// Sub-route labels for paths that don't have a sidebar entry (composer panels,
// taxonomy children, analytics tabs). Top-level destinations come from
// ADMIN_NAV_LABEL_BY_SEGMENT so a sidebar rename auto-updates the breadcrumb.
const SUBROUTE_LABELS: Record<string, string> = {
  "site-settings": "Site",
  "card-design": "Card Design",
  structure: "Composer",
  design: "Design",
  sections: "Sections",
  pages: "Pages",
  content: "Content",
  navigation: "Navigation",
  seo: "SEO",
  identity: "Brand",
  branding: "Brand",
  system: "System",
  audit: "Audit",
  accounts: "Work locations",
  media: "Media",
  translations: "Translations",
  analytics: "Analytics",
  fields: "Fields",
  directory: "Directory",
  taxonomy: "Taxonomy",
  locations: "Locations",
  search: "Search",
  admins: "Admins",
};

const LABELS: Record<string, string> = {
  ...SUBROUTE_LABELS,
  ...ADMIN_NAV_LABEL_BY_SEGMENT,
};

function prettify(segment: string): string {
  if (LABELS[segment]) return LABELS[segment];
  return segment
    .split("-")
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ");
}

interface Crumb {
  label: string;
  href: string | null;
}

function buildCrumbs(pathname: string): Crumb[] {
  const parts =
    pathname.split("?")[0]?.split("#")[0]?.split("/").filter(Boolean) ?? [];
  const out: Crumb[] = [];
  let acc = "";
  for (let i = 0; i < parts.length; i++) {
    const seg = parts[i];
    if (!seg) continue;
    acc += `/${seg}`;
    const looksLikeId =
      /^[0-9a-f]{8}-[0-9a-f]{4}/i.test(seg) || /^[0-9]{6,}$/.test(seg);
    if (looksLikeId && i > 0) {
      out.push({ label: "…", href: acc });
      continue;
    }
    out.push({
      label: prettify(seg),
      href: i === parts.length - 1 ? null : acc,
    });
  }
  return out;
}

const QUICK_CREATE = [
  {
    href: "/admin/inquiries",
    label: "New request",
    hint: "Capture a lead",
    Icon: Plus,
    keys: ["G", "R"],
  },
  {
    href: "/admin/bookings/new",
    label: "New booking",
    hint: "Confirmed job",
    Icon: CalendarPlus,
    keys: ["G", "B"],
  },
  {
    href: "/admin/talent/new",
    label: "Add talent",
    hint: "Create a roster profile",
    Icon: UserPlus,
    keys: ["G", "T"],
  },
  {
    href: "/admin/clients",
    label: "Add client",
    hint: "Open client list",
    Icon: Users,
    keys: ["G", "C"],
  },
] as const;

// TopBarNotificationBell — self-contained bell (no AdminShellProvider).
// All state + server-action calls are local; safe to render in layouts.

function relativeTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const min = Math.floor(ms / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return `${Math.floor(hr / 24)}d ago`;
}

function kindIcon(kind: MyNotification["kind"]): string {
  switch (kind) {
    case "approval":  return "👤";
    case "message":   return "💬";
    case "offer":     return "💼";
    case "booking":   return "📅";
    case "payment":   return "💳";
    case "profile":   return "✎";
    case "system":    return "ⓘ";
    default:          return "🔔";
  }
}

/**
 * Self-contained notification bell. Loads notifications via the shared
 * `loadMyNotifications` server action (does NOT touch AdminShellProvider).
 * Opens a popover drawer with unread badge, mark-all-read, and per-row
 * dismiss. Refreshes on first open + on window focus.
 */
function TopBarNotificationBell() {
  const [open, setOpen] = React.useState(false);
  const [notifications, setNotifications] = React.useState<MyNotification[]>([]);
  const [loaded, setLoaded] = React.useState(false);
  const popoverRef = React.useRef<HTMLDivElement | null>(null);
  const buttonRef = React.useRef<HTMLButtonElement | null>(null);
  const [dismissed, setDismissed] = React.useState<Set<string>>(() => new Set());

  const loadNotifs = React.useCallback(async () => {
    try {
      const result = await loadMyNotifications(50);
      setNotifications(result);
      setLoaded(true);
    } catch {
      setLoaded(true);
    }
  }, []);

  // Load on first open
  React.useEffect(() => {
    if (open && !loaded) void loadNotifs();
  }, [open, loaded, loadNotifs]);

  // Re-load on window focus so the bell stays fresh after switching tabs
  React.useEffect(() => {
    const onFocus = () => { if (loaded) void loadNotifs(); };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [loaded, loadNotifs]);

  // Close on outside click
  React.useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(e.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", handler);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", handler);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const visible = notifications.filter((n) => !dismissed.has(n.id));
  const unread = visible.filter((n) => n.readAt === null).length;

  const markAllRead = async () => {
    setNotifications((prev) =>
      prev.map((n) => ({ ...n, readAt: n.readAt ?? new Date().toISOString() })),
    );
    await markNotificationsRead("all");
  };

  const dismissItem = async (id: string) => {
    setDismissed((prev) => new Set([...prev, id]));
    await markNotificationsRead([id]);
  };

  const markOneRead = async (id: string) => {
    setNotifications((prev) =>
      prev.map((n) =>
        n.id === id ? { ...n, readAt: n.readAt ?? new Date().toISOString() } : n,
      ),
    );
    await markNotificationsRead([id]);
  };

  return (
    <div className="relative">
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            ref={buttonRef}
            type="button"
            onClick={() => setOpen((v) => !v)}
            className={cn(
              "relative inline-flex size-9 shrink-0 items-center justify-center rounded-lg text-foreground/70 transition-colors hover:bg-foreground/[0.05] hover:text-foreground",
              open && "bg-foreground/[0.06] text-foreground",
            )}
            aria-label={
              unread > 0
                ? `${unread} unread notification${unread === 1 ? "" : "s"}`
                : "Notifications"
            }
          >
            <Bell className="size-4" aria-hidden />
            {unread > 0 && (
              <span className="absolute right-1.5 top-1.5 inline-flex min-w-[14px] items-center justify-center rounded-full bg-foreground px-1 text-[9px] font-bold leading-[14px] text-background">
                {unread > 9 ? "9+" : unread}
              </span>
            )}
          </button>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          {unread > 0 ? `${unread} unread` : "Notifications"}
        </TooltipContent>
      </Tooltip>

      {open && (
        <div
          ref={popoverRef}
          className="absolute right-0 top-[calc(100%+6px)] z-50 flex w-[360px] max-w-[calc(100vw-24px)] flex-col overflow-hidden rounded-xl border border-border bg-background shadow-xl"
          role="dialog"
          aria-label="Notifications"
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-border/60 px-3.5 py-2.5">
            <span className="text-[12.5px] font-bold text-foreground">Notifications</span>
            {unread > 0 && (
              <button
                type="button"
                onClick={markAllRead}
                className="text-[11px] font-semibold text-primary hover:underline"
              >
                Mark all read
              </button>
            )}
          </div>

          {/* Body */}
          <div className="max-h-[360px] overflow-y-auto">
            {!loaded ? (
              <div className="py-10 text-center text-[12px] text-muted-foreground">
                Loading…
              </div>
            ) : visible.length === 0 ? (
              <div className="py-10 text-center">
                <div className="mb-1.5 text-2xl">✓</div>
                <div className="text-[12px] text-muted-foreground">All caught up.</div>
              </div>
            ) : (
              <ul className="py-1">
                {visible.map((n) => {
                  const isRead = n.readAt !== null;
                  return (
                    <li
                      key={n.id}
                      className={cn(
                        "group relative flex items-start gap-2.5 px-3 py-2.5",
                        !isRead && "bg-primary/[0.03]",
                        "transition-colors hover:bg-muted/40",
                      )}
                    >
                      <span className="mt-0.5 inline-flex size-7 shrink-0 items-center justify-center rounded-lg bg-muted/60 text-[13px]">
                        {kindIcon(n.kind)}
                      </span>
                      <button
                        type="button"
                        className="min-w-0 flex-1 text-left"
                        onClick={() => {
                          void markOneRead(n.id);
                          if (n.href) window.location.href = n.href;
                        }}
                      >
                        <div className="flex items-baseline gap-1.5">
                          <span
                            className={cn(
                              "flex-1 truncate text-[12px] leading-snug",
                              isRead
                                ? "font-medium text-foreground/80"
                                : "font-semibold text-foreground",
                            )}
                          >
                            {n.title}
                          </span>
                          <span className="shrink-0 text-[10px] text-muted-foreground">
                            {relativeTime(n.createdAt)}
                          </span>
                        </div>
                        {n.body ? (
                          <div className="mt-0.5 text-[11px] leading-snug text-muted-foreground line-clamp-2">
                            {n.body}
                          </div>
                        ) : null}
                      </button>
                      <button
                        type="button"
                        aria-label="Dismiss"
                        onClick={() => void dismissItem(n.id)}
                        className="mt-0.5 shrink-0 opacity-0 transition-opacity group-hover:opacity-60 hover:!opacity-100"
                      >
                        <span className="text-[14px] leading-none text-foreground/60">×</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {/* Footer */}
          <div className="border-t border-border/60 px-3.5 py-2 text-center">
            <span className="text-[11px] text-muted-foreground">
              Showing last {notifications.length} notification{notifications.length === 1 ? "" : "s"}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

export function AdminShellTopBar({
  onOpenMobileMenu,
  chromeTheme,
  onToggleTheme,
  userEmail,
  unreadAlerts: _unreadAlerts = 0,
}: {
  onOpenMobileMenu: () => void;
  chromeTheme: "dark" | "light";
  onToggleTheme: () => void;
  userEmail: string | null;
  /**
   * Tier-1 alert count. Kept in the API for backward compatibility;
   * the bell is now self-loading via TopBarNotificationBell.
   */
  unreadAlerts?: number;
}) {
  const pathname = usePathname() ?? "/admin";
  const crumbs = React.useMemo(() => buildCrumbs(pathname), [pathname]);
  const upgradeModal = useUpgradeModal();
  const workspace = useAdminWorkspace();

  const [shortcutsOpen, setShortcutsOpen] = React.useState(false);
  const [summaryOpen, setSummaryOpen] = React.useState(false);
  useShortcutsDrawerHotkey(setShortcutsOpen);

  const planKey = workspace?.plan ?? "free";
  const planLabel = TIER_LABEL[planKey] ?? "Free";
  const planDot = TIER_DOT[planKey] ?? TIER_DOT.free;
  const planUsage =
    formatTalentUsage(workspace) || `${planLabel} plan`;

  // Roster fill ratio — tints the chip red-orange when within 90% of the cap
  // so the owner notices before they hit the wall. Network has no cap.
  const usageRatio =
    workspace && workspace.talentLimit && workspace.talentLimit > 0
      ? workspace.talentCount / workspace.talentLimit
      : 0;
  const seatsTight = usageRatio >= 0.9;

  return (
    <header
      className={cn(
        "sticky top-0 z-40 flex w-full items-center gap-2 border-b border-[var(--admin-gold-border)]/60 bg-[var(--admin-workspace-bg)]/92",
        "px-3 py-1.5 backdrop-blur-md supports-[backdrop-filter]:bg-[var(--admin-workspace-bg)]/85 sm:px-4 lg:px-6",
      )}
    >
      {/* Mobile menu */}
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="size-9 shrink-0 rounded-lg text-foreground/70 transition-colors duration-150 hover:bg-foreground/[0.05] hover:text-foreground lg:hidden"
        aria-label="Open menu"
        onClick={onOpenMobileMenu}
      >
        <Menu className="size-4" />
      </Button>

      {/* Mobile: just the current page label so the user always knows where
          they are. Tappable back-to-Admin home. */}
      <Link
        href="/admin"
        className="flex min-w-0 flex-1 items-center gap-1 truncate text-[13px] font-semibold text-foreground sm:hidden"
      >
        {crumbs.length > 0
          ? (crumbs[crumbs.length - 1]?.label ?? "Admin")
          : "Admin"}
      </Link>

      {/* Breadcrumb (desktop) */}
      <nav
        aria-label="Breadcrumb"
        className="hidden min-w-0 flex-1 items-center gap-1 overflow-hidden text-[12.5px] text-muted-foreground sm:flex"
      >
        {crumbs.length === 0 ? (
          <span className="font-medium text-foreground">Admin</span>
        ) : (
          crumbs.map((c, i) => (
            <span
              key={`${c.href ?? c.label}-${i}`}
              className="flex items-center gap-1"
            >
              {i > 0 ? (
                <ChevronRight
                  className="size-3 text-muted-foreground/60"
                  aria-hidden
                />
              ) : null}
              {c.href ? (
                <Link
                  href={c.href}
                  className="rounded px-1 py-0.5 transition-colors hover:bg-muted/50 hover:text-foreground"
                >
                  {c.label}
                </Link>
              ) : (
                <span className="px-1 py-0.5 font-semibold text-foreground">
                  {c.label}
                </span>
              )}
            </span>
          ))
        )}
      </nav>

      {/* Right cluster */}
      <div className="flex shrink-0 items-center gap-1.5">
        {/* Compact ⌘K search */}
        <div className="hidden min-w-0 sm:block">
          <AdminCommandPalette variant="strip" />
        </div>

        {/* + New quick-create */}
        <Popover>
          <PopoverTrigger asChild>
            <button
              type="button"
              className={cn(
                "inline-flex items-center gap-1 rounded-full border border-foreground/15 bg-foreground/[0.04] px-2.5 py-1.5 text-[12px] font-semibold text-foreground",
                "transition-colors hover:border-foreground/30 hover:bg-foreground/[0.08]",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--admin-gold)]/50",
              )}
              aria-label="Quick create"
            >
              <Plus className="size-3.5" aria-hidden />
              <span className="hidden md:inline">New</span>
              <ChevronDown className="size-3 text-muted-foreground" aria-hidden />
            </button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-64 p-1.5">
            <div className="px-2 pb-1.5 pt-1 text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
              Quick create
            </div>
            {QUICK_CREATE.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="flex items-center gap-2.5 rounded-md px-2 py-2 transition-colors hover:bg-muted/60"
              >
                <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-foreground/[0.06] text-foreground">
                  <item.Icon className="size-3.5" aria-hidden />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[12.5px] font-semibold text-foreground">
                    {item.label}
                  </span>
                  <span className="block text-[11.5px] text-muted-foreground">
                    {item.hint}
                  </span>
                </span>
                <span
                  className="ml-2 hidden shrink-0 items-center gap-0.5 sm:flex"
                  aria-hidden
                >
                  {item.keys.map((k) => (
                    <kbd
                      key={k}
                      className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded border border-foreground/15 bg-foreground/[0.04] px-1 font-mono text-[10px] font-semibold text-muted-foreground"
                    >
                      {k}
                    </kbd>
                  ))}
                </span>
              </Link>
            ))}
          </PopoverContent>
        </Popover>

        {/* Global search — self-contained (outside AdminShellProvider). */}
        <div className="hidden md:block">
          <AdminGlobalSearch />
        </div>

        {/* Notifications bell — self-contained (outside AdminShellProvider). */}
        <TopBarNotificationBell />

        {/* Plan + usage chip — render a skeleton stand-in while the workspace
            summary hasn't hydrated yet (the brief flash of "—" is jarring). */}
        {!workspace ? (
          <span
            className="ml-0.5 inline-flex h-[26px] w-[124px] items-center gap-1.5 rounded-full border border-[rgba(24,24,27,0.12)] bg-foreground/[0.04] px-2.5 animate-pulse"
            aria-hidden
          >
            <span className="size-2 rounded-full bg-foreground/15" />
            <span className="h-2 flex-1 rounded-full bg-foreground/10" />
          </span>
        ) : (
        <button
          type="button"
          onClick={() => setSummaryOpen(true)}
          className={cn(
            "ml-0.5 inline-flex items-center gap-1.5 rounded-full bg-white px-2.5 py-1 text-[12px] text-foreground/80",
            "border transition-[border-color,box-shadow] duration-150",
            seatsTight
              ? "border-foreground bg-foreground text-background hover:bg-foreground/90"
              : "border-[rgba(24,24,27,0.18)] hover:border-[rgba(24,24,27,0.4)]",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(24,24,27,0.45)]",
          )}
          title={
            seatsTight
              ? `Roster is ${Math.round(usageRatio * 100)}% full — open workspace summary`
              : "Open workspace summary"
          }
          aria-haspopup="dialog"
        >
          <span
            className="size-2 shrink-0 rounded-full"
            style={{ backgroundColor: seatsTight ? "#fff" : planDot }}
            aria-hidden
          />
          <span className="truncate">
            <strong
              className={cn(
                "font-semibold",
                seatsTight ? "text-background" : "text-foreground",
              )}
            >
              {planLabel}
            </strong>
            <span
              className={cn(
                "mx-1",
                seatsTight ? "text-background/60" : "text-muted-foreground/70",
              )}
            >
              ·
            </span>
            <span
              className={cn(
                seatsTight ? "text-background/90" : "text-muted-foreground",
              )}
            >
              {planUsage}
            </span>
          </span>
          {seatsTight ? (
            <span
              className={cn(
                "ml-0.5 hidden rounded-full bg-background/15 px-1.5 py-px text-[10px] font-bold uppercase tracking-[0.08em] text-background sm:inline",
              )}
            >
              Upgrade
            </span>
          ) : (
            <ChevronDown
              className="size-3 shrink-0 text-muted-foreground/70"
              aria-hidden
            />
          )}
        </button>
        )}

        {/* Locale */}
        <DashboardLocaleToggle
          variant="prototype"
          className="hidden shrink-0 sm:flex"
        />

        {/* Theme */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-9 shrink-0 rounded-lg text-foreground/60 transition-colors duration-150 hover:bg-foreground/[0.05] hover:text-foreground"
              aria-label={
                chromeTheme === "dark"
                  ? "Use light workspace"
                  : "Use dark workspace"
              }
              onClick={onToggleTheme}
            >
              {chromeTheme === "dark" ? (
                <Sun className="size-4" aria-hidden />
              ) : (
                <Moon className="size-4" aria-hidden />
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            {chromeTheme === "dark" ? "Light mode" : "Dark mode"}
          </TooltipContent>
        </Tooltip>

        {/* Preview site */}
        <Tooltip>
          <TooltipTrigger asChild>
            <a
              href="/"
              target="_blank"
              rel="noopener noreferrer"
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border border-foreground/15 bg-foreground/[0.04] px-2.5 py-1.5 text-[12px] font-semibold text-foreground",
                "transition-colors hover:border-foreground/30 hover:bg-foreground/[0.08]",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--admin-gold)]/50",
              )}
              aria-label="Preview public site"
            >
              <Eye className="size-3.5" aria-hidden />
              <span className="hidden md:inline">Preview</span>
            </a>
          </TooltipTrigger>
          <TooltipContent side="bottom">Preview public site</TooltipContent>
        </Tooltip>

        {/* Avatar / account menu */}
        <Popover>
          <PopoverTrigger asChild>
            <button
              type="button"
              className={cn(
                "ml-0.5 inline-flex size-9 shrink-0 items-center justify-center rounded-full border border-foreground/15 bg-foreground/[0.04] text-[12px] font-semibold text-foreground",
                "transition-colors hover:border-foreground/30 hover:bg-foreground/[0.08]",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--admin-gold)]/50",
              )}
              aria-label="Account menu"
            >
              {(userEmail?.[0] ?? "?").toUpperCase()}
            </button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-64 p-1.5">
            <div className="border-b border-border/60 px-2 py-2">
              <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
                Signed in
              </div>
              <div className="mt-0.5 truncate text-[12.5px] font-semibold text-foreground">
                {userEmail ?? "Unknown"}
              </div>
            </div>
            <Link
              href="/admin/account"
              className="mt-1 flex items-center gap-2.5 rounded-md px-2 py-2 text-[12.5px] text-foreground transition-colors hover:bg-muted/60"
            >
              <Wallet className="size-3.5 text-muted-foreground" aria-hidden />
              Account &amp; billing
            </Link>
            <Link
              href="/admin/settings"
              className="flex items-center gap-2.5 rounded-md px-2 py-2 text-[12.5px] text-foreground transition-colors hover:bg-muted/60"
            >
              <Settings className="size-3.5 text-muted-foreground" aria-hidden />
              Workspace settings
            </Link>
            <Link
              href="/admin/users"
              className="flex items-center gap-2.5 rounded-md px-2 py-2 text-[12.5px] text-foreground transition-colors hover:bg-muted/60"
            >
              <UserRound className="size-3.5 text-muted-foreground" aria-hidden />
              Team &amp; permissions
            </Link>
            <button
              type="button"
              onClick={() => setShortcutsOpen(true)}
              className="flex w-full items-center gap-2.5 rounded-md px-2 py-2 text-left text-[12.5px] text-foreground transition-colors hover:bg-muted/60"
            >
              <Keyboard className="size-3.5 text-muted-foreground" aria-hidden />
              Keyboard shortcuts
              <span className="ml-auto inline-flex h-[18px] min-w-[18px] items-center justify-center rounded border border-foreground/15 bg-foreground/[0.04] px-1 font-mono text-[10px] font-semibold text-muted-foreground">
                ?
              </span>
            </button>
            <form action={signOut} className="border-t border-border/60 pt-1">
              <button
                type="submit"
                className="flex w-full items-center gap-2.5 rounded-md px-2 py-2 text-left text-[12.5px] text-foreground transition-colors hover:bg-muted/60"
              >
                <LogOut className="size-3.5 text-muted-foreground" aria-hidden />
                Sign out
              </button>
            </form>
          </PopoverContent>
        </Popover>
      </div>

      {/* Globally-mounted drawers — `?` opens the cheatsheet, plan-chip opens
          the workspace summary. Both portal out so they overlay the entire
          shell, not just this top bar. */}
      <AdminShortcutsDrawer
        open={shortcutsOpen}
        onOpenChange={setShortcutsOpen}
      />
      <AdminWorkspaceSummaryDrawer
        open={summaryOpen}
        onOpenChange={setSummaryOpen}
        onOpenUpgrade={() => upgradeModal.setOpen(true)}
      />
    </header>
  );
}
