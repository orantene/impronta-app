"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
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
import { TopBarNotificationBell } from "@/components/admin/admin-shell-notification-bell";
import {
  AdminShortcutsDrawer,
  useShortcutsDrawerHotkey,
} from "@/components/admin/admin-shortcuts-drawer";
import { AdminWorkspaceSummaryDrawer } from "@/components/admin/admin-workspace-summary-drawer";
import { DashboardLocaleToggle } from "@/components/dashboard-locale-toggle";
import type { Locale } from "@/i18n/config";
import { useT } from "@/i18n/use-t";
import { interpolate } from "@/i18n/interpolate";
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

/**
 * AdminShellTopBar — single dense sticky header for every /admin/* page.
 * Breadcrumb · ⌘K · +New · notifications bell · plan chip · locale/theme · avatar.
 * The page heading sits BELOW this bar; content starts ~110px from the top.
 */

// Sub-route labels for paths that don't have a sidebar entry (composer panels,
// taxonomy children, analytics tabs). Top-level destinations come from
// ADMIN_NAV_LABEL_BY_SEGMENT so a sidebar rename auto-updates the breadcrumb.
const SUBROUTE_LABEL_KEYS = [
  "site-settings",
  "card-design",
  "profile-pages",
  "structure",
  "design",
  "setup",
  "sections",
  "pages",
  "content",
  "navigation",
  "seo",
  "identity",
  "branding",
  "system",
  "audit",
  "accounts",
  "media",
  "translations",
  "analytics",
  "fields",
  "directory",
  "taxonomy",
  "locations",
  "search",
  "admins",
] as const;

type Translate = (key: string) => string;

function buildLabels(t: Translate): Record<string, string> {
  const subroutes: Record<string, string> = {};
  for (const segment of SUBROUTE_LABEL_KEYS) {
    subroutes[segment] = t(`dashboard.adminShell.topBar.segment.${segment}`);
  }
  return {
    ...subroutes,
    ...ADMIN_NAV_LABEL_BY_SEGMENT,
  };
}

function prettify(segment: string, labels: Record<string, string>): string {
  if (labels[segment]) return labels[segment];
  return segment
    .split("-")
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ");
}

interface Crumb {
  label: string;
  href: string | null;
}

function buildCrumbs(pathname: string, labels: Record<string, string>): Crumb[] {
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
      label: prettify(seg, labels),
      href: i === parts.length - 1 ? null : acc,
    });
  }
  return out;
}

const QUICK_CREATE = [
  {
    href: "/admin/inquiries",
    labelKey: "dashboard.adminShell.topBar.quickCreate.newRequest",
    hintKey: "dashboard.adminShell.topBar.quickCreate.newRequestHint",
    Icon: Plus,
    keys: ["G", "R"],
  },
  {
    href: "/admin/bookings/new",
    labelKey: "dashboard.adminShell.topBar.quickCreate.newBooking",
    hintKey: "dashboard.adminShell.topBar.quickCreate.newBookingHint",
    Icon: CalendarPlus,
    keys: ["G", "B"],
  },
  {
    href: "/admin/talent/new",
    labelKey: "dashboard.adminShell.topBar.quickCreate.addTalent",
    hintKey: "dashboard.adminShell.topBar.quickCreate.addTalentHint",
    Icon: UserPlus,
    keys: ["G", "T"],
  },
  {
    href: "/admin/clients",
    labelKey: "dashboard.adminShell.topBar.quickCreate.addClient",
    hintKey: "dashboard.adminShell.topBar.quickCreate.addClientHint",
    Icon: Users,
    keys: ["G", "C"],
  },
] as const;

export function AdminShellTopBar({
  onOpenMobileMenu,
  chromeTheme,
  onToggleTheme,
  userEmail,
  unreadAlerts: _unreadAlerts = 0,
  supportedLocales,
  defaultLocale,
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
  /** Tenant's supported locales — drives the locale toggle visibility. */
  supportedLocales?: readonly Locale[];
  /** Tenant's primary locale — initialises the toggle's active state. */
  defaultLocale?: Locale;
}) {
  const pathname = usePathname() ?? "/admin";
  const t = useT();
  const labels = React.useMemo(() => buildLabels(t), [t]);
  const crumbs = React.useMemo(
    () => buildCrumbs(pathname, labels),
    [pathname, labels],
  );
  const upgradeModal = useUpgradeModal();
  const workspace = useAdminWorkspace();

  const [shortcutsOpen, setShortcutsOpen] = React.useState(false);
  const [summaryOpen, setSummaryOpen] = React.useState(false);
  useShortcutsDrawerHotkey(setShortcutsOpen);

  const planKey = workspace?.plan ?? "free";
  const planLabel = TIER_LABEL[planKey] ?? "Free";
  const planDot = TIER_DOT[planKey] ?? TIER_DOT.free;
  const planUsage =
    formatTalentUsage(workspace, t) ||
    interpolate(t("dashboard.adminShell.topBar.planFallback"), {
      plan: planLabel,
    });

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
        aria-label={t("dashboard.adminShell.topBar.openMenu")}
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
          ? (crumbs[crumbs.length - 1]?.label ??
            t("dashboard.adminShell.topBar.admin"))
          : t("dashboard.adminShell.topBar.admin")}
      </Link>

      {/* Breadcrumb (desktop) */}
      <nav
        aria-label={t("dashboard.adminShell.topBar.breadcrumbAria")}
        className="hidden min-w-0 flex-1 items-center gap-1 overflow-hidden text-[12.5px] text-muted-foreground sm:flex"
      >
        {crumbs.length === 0 ? (
          <span className="font-medium text-foreground">
            {t("dashboard.adminShell.topBar.admin")}
          </span>
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
              aria-label={t("dashboard.adminShell.topBar.quickCreate.trigger")}
            >
              <Plus className="size-3.5" aria-hidden />
              <span className="hidden md:inline">
                {t("dashboard.adminShell.topBar.quickCreate.new")}
              </span>
              <ChevronDown className="size-3 text-muted-foreground" aria-hidden />
            </button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-64 p-1.5">
            <div className="px-2 pb-1.5 pt-1 text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
              {t("dashboard.adminShell.topBar.quickCreate.heading")}
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
                    {t(item.labelKey)}
                  </span>
                  <span className="block text-[11.5px] text-muted-foreground">
                    {t(item.hintKey)}
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
              ? interpolate(t("dashboard.adminShell.topBar.rosterFullTitle"), {
                  percent: Math.round(usageRatio * 100),
                })
              : t("dashboard.adminShell.topBar.workspaceSummary")
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
              {t("dashboard.adminShell.topBar.upgrade")}
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
          supportedLocales={supportedLocales}
          defaultLocale={defaultLocale}
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
                  ? t("dashboard.adminShell.topBar.useLightWorkspace")
                  : t("dashboard.adminShell.topBar.useDarkWorkspace")
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
            {chromeTheme === "dark"
              ? t("dashboard.adminShell.topBar.lightMode")
              : t("dashboard.adminShell.topBar.darkMode")}
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
              aria-label={t("dashboard.adminShell.topBar.previewPublicSite")}
            >
              <Eye className="size-3.5" aria-hidden />
              <span className="hidden md:inline">
                {t("dashboard.adminShell.topBar.preview")}
              </span>
            </a>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            {t("dashboard.adminShell.topBar.previewPublicSite")}
          </TooltipContent>
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
              aria-label={t("dashboard.adminShell.topBar.accountMenu")}
            >
              {(userEmail?.[0] ?? "?").toUpperCase()}
            </button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-64 p-1.5">
            <div className="border-b border-border/60 px-2 py-2">
              <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
                {t("dashboard.adminShell.topBar.signedIn")}
              </div>
              <div className="mt-0.5 truncate text-[12.5px] font-semibold text-foreground">
                {userEmail ?? t("dashboard.adminShell.topBar.unknownUser")}
              </div>
            </div>
            <Link
              href="/admin/account"
              className="mt-1 flex items-center gap-2.5 rounded-md px-2 py-2 text-[12.5px] text-foreground transition-colors hover:bg-muted/60"
            >
              <Wallet className="size-3.5 text-muted-foreground" aria-hidden />
              {t("dashboard.adminShell.topBar.accountBilling")}
            </Link>
            <Link
              href="/admin/settings"
              className="flex items-center gap-2.5 rounded-md px-2 py-2 text-[12.5px] text-foreground transition-colors hover:bg-muted/60"
            >
              <Settings className="size-3.5 text-muted-foreground" aria-hidden />
              {t("dashboard.adminShell.topBar.workspaceSettings")}
            </Link>
            <Link
              href="/admin/users"
              className="flex items-center gap-2.5 rounded-md px-2 py-2 text-[12.5px] text-foreground transition-colors hover:bg-muted/60"
            >
              <UserRound className="size-3.5 text-muted-foreground" aria-hidden />
              {t("dashboard.adminShell.topBar.teamPermissions")}
            </Link>
            <button
              type="button"
              onClick={() => setShortcutsOpen(true)}
              className="flex w-full items-center gap-2.5 rounded-md px-2 py-2 text-left text-[12.5px] text-foreground transition-colors hover:bg-muted/60"
            >
              <Keyboard className="size-3.5 text-muted-foreground" aria-hidden />
              {t("dashboard.adminShell.topBar.keyboardShortcuts")}
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
                {t("dashboard.adminShell.topBar.signOut")}
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
