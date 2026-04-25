"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Bell,
  CalendarPlus,
  ChevronDown,
  ChevronRight,
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
import { cn } from "@/lib/utils";

/**
 * AdminShellTopBar — single dense sticky header for every /admin/* page.
 *
 * Merges what used to be three bands of chrome (giant search row + secondary
 * breadcrumb row + page-header card) into one ~48px sticky row. Carries every
 * tool an agency owner reaches for on a daily run-through:
 *
 *   - Mobile menu trigger        (lg:hidden)
 *   - Breadcrumb                 (where am I?)
 *   - Compact ⌘K search pill     (jump anywhere; teaches the shortcut)
 *   - "+ New" quick-create menu  (inquiry / talent / client / booking)
 *   - Notifications bell         (placeholder counter — wires to events later)
 *   - Plan + roster usage chip   (tier health; opens upgrade modal)
 *   - Locale + theme + avatar    (utilities)
 *
 * The page heading (`<AdminPageHeader>`) sits BELOW this bar without an icon
 * box, with a hairline divider — content starts ~110px below the top of the
 * viewport instead of the previous ~190px.
 */

const TIER_DOT: Record<string, string> = {
  free: "#a1a1aa",
  studio: "#3a7bff",
  agency: "#c9a227",
  network: "#146b3a",
};
const TIER_LABEL: Record<string, string> = {
  free: "Free",
  studio: "Studio",
  agency: "Agency",
  network: "Network",
};

const LABELS: Record<string, string> = {
  admin: "Admin",
  "site-settings": "Site",
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
  inquiries: "Inquiries",
  bookings: "Bookings",
  accounts: "Work locations",
  talent: "Roster",
  clients: "Clients",
  media: "Media",
  translations: "Translations",
  settings: "Settings",
  account: "Account",
  "ai-workspace": "AI",
  analytics: "Analytics",
  fields: "Fields",
  directory: "Directory",
  taxonomy: "Taxonomy",
  locations: "Locations",
  users: "Users",
  search: "Search",
  admins: "Admins",
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
    label: "New inquiry",
    hint: "Capture a lead",
    Icon: Plus,
  },
  {
    href: "/admin/talent/new",
    label: "Add talent",
    hint: "Create a roster profile",
    Icon: UserPlus,
  },
  {
    href: "/admin/clients",
    label: "Add client",
    hint: "Open client list",
    Icon: Users,
  },
  {
    href: "/admin/bookings/new",
    label: "New booking",
    hint: "Confirmed job",
    Icon: CalendarPlus,
  },
] as const;

export function AdminShellTopBar({
  onOpenMobileMenu,
  chromeTheme,
  onToggleTheme,
  userEmail,
}: {
  onOpenMobileMenu: () => void;
  chromeTheme: "dark" | "light";
  onToggleTheme: () => void;
  userEmail: string | null;
}) {
  const pathname = usePathname() ?? "/admin";
  const crumbs = React.useMemo(() => buildCrumbs(pathname), [pathname]);
  const upgradeModal = useUpgradeModal();
  const workspace = useAdminWorkspace();

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

  // Placeholder for unread alerts. The events table feeds this in a follow-up
  // (see audit Finding #4). Keep the affordance so visual layout is final.
  const unreadAlerts: number = 0;

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

      {/* Breadcrumb */}
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

      {/* Take remaining space on mobile so right cluster pins to right */}
      <div className="flex-1 sm:hidden" />

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
                className="flex items-start gap-2.5 rounded-md px-2 py-2 transition-colors hover:bg-muted/60"
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
              </Link>
            ))}
          </PopoverContent>
        </Popover>

        {/* Notifications */}
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              className="relative inline-flex size-9 shrink-0 items-center justify-center rounded-lg text-foreground/70 transition-colors hover:bg-foreground/[0.05] hover:text-foreground"
              aria-label={
                unreadAlerts > 0
                  ? `${unreadAlerts} unread alert${unreadAlerts === 1 ? "" : "s"}`
                  : "No new alerts"
              }
            >
              <Bell className="size-4" aria-hidden />
              {unreadAlerts > 0 ? (
                <span className="absolute right-1.5 top-1.5 inline-flex min-w-[14px] items-center justify-center rounded-full bg-[#a1302d] px-1 text-[9px] font-bold leading-[14px] text-white">
                  {unreadAlerts > 9 ? "9+" : unreadAlerts}
                </span>
              ) : null}
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            {unreadAlerts > 0
              ? `${unreadAlerts} unread alert${unreadAlerts === 1 ? "" : "s"}`
              : "No new alerts"}
          </TooltipContent>
        </Tooltip>

        {/* Plan + usage chip */}
        <button
          type="button"
          onClick={() => upgradeModal.setOpen(true)}
          className={cn(
            "ml-0.5 inline-flex items-center gap-1.5 rounded-full bg-white px-2.5 py-1 text-[12px] text-foreground/80",
            "border transition-[border-color,box-shadow] duration-150",
            seatsTight
              ? "border-[rgba(161,48,45,0.45)] hover:border-[rgba(161,48,45,0.7)]"
              : "border-[rgba(24,24,27,0.18)] hover:border-[rgba(24,24,27,0.4)]",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(24,24,27,0.45)]",
          )}
          title={
            seatsTight
              ? `Roster is ${Math.round(usageRatio * 100)}% full — consider upgrading`
              : "Click to view plans"
          }
        >
          <span
            className="size-2 shrink-0 rounded-full"
            style={{ backgroundColor: planDot }}
            aria-hidden
          />
          <span className="truncate">
            <strong className="font-semibold text-foreground">{planLabel}</strong>
            <span className="mx-1 text-muted-foreground/70">·</span>
            <span
              className={cn(
                seatsTight ? "text-[#a1302d]" : "text-muted-foreground",
              )}
            >
              {planUsage}
            </span>
          </span>
          <ChevronDown
            className="size-3 shrink-0 text-muted-foreground/70"
            aria-hidden
          />
        </button>

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
    </header>
  );
}
