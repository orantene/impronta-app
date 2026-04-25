"use client";

/**
 * Phase 15 / Admin shell v2 — contextual top bar.
 *
 * Renders above every `/admin/*` page content via `AdminWorkspaceShell`.
 * Carries:
 *   - Breadcrumb derived from pathname (clickable segments)
 *   - "Publish via Composer" pill on `/admin/site-settings/*` (minus
 *     /structure itself) so publishing is always one click away
 *   - "Open public site" toggle on any `/admin/site-settings/*` page
 *
 * Kept presentational — no server reads. Richer states (draft count,
 * presence) plug in later without touching the layout.
 *
 * Deliberately does NOT render a Cmd+K hint — the prototype shell above
 * us already ships a full-width search palette trigger. Rendering both
 * read as redundant in runtime QA.
 */

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { ChevronDown, ChevronRight, ExternalLink, Rocket } from "lucide-react";
import { useMemo } from "react";
import { cn } from "@/lib/utils";
import { useUpgradeModal } from "@/components/admin/site-control-center/upgrade-context";

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

const TIER_USAGE: Record<string, string> = {
  free: "8 / 10 talents",
  studio: "34 / 50 talents",
  agency: "87 / 200 talents",
  network: "Unlimited talents",
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
  const parts = pathname
    .split("?")[0]
    ?.split("#")[0]
    ?.split("/")
    .filter(Boolean) ?? [];
  const out: Crumb[] = [];
  let acc = "";
  for (let i = 0; i < parts.length; i++) {
    const seg = parts[i];
    if (!seg) continue;
    acc += `/${seg}`;
    // Skip purely-identifier segments (UUIDs, long numbers) from display.
    const looksLikeId =
      /^[0-9a-f]{8}-[0-9a-f]{4}/i.test(seg) ||
      /^[0-9]{6,}$/.test(seg);
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

export function AdminTopBar() {
  const pathname = usePathname() ?? "/admin";
  const searchParams = useSearchParams();
  const crumbs = useMemo(() => buildCrumbs(pathname), [pathname]);
  const upgradeModal = useUpgradeModal();

  const isSiteArea = pathname.startsWith("/admin/site-settings");
  const isComposer = pathname.startsWith("/admin/site-settings/structure");
  const showPublishPill = isSiteArea && !isComposer;

  // Tier-chip — mirrors the mockup's right-side workspace pill. Plan is
  // surfaced via `?plan=` for prototype routes; fallback to free.
  const planParam = searchParams?.get("plan") ?? "free";
  const planKey = (["free", "studio", "agency", "network"] as const).includes(
    planParam as never,
  )
    ? planParam
    : "free";
  const planLabel = TIER_LABEL[planKey] ?? "Free";
  const planDot = TIER_DOT[planKey] ?? TIER_DOT.free;
  const planUsage = TIER_USAGE[planKey] ?? TIER_USAGE.free;

  // Never render the bar on routes where it'd fight composer chrome.
  if (isComposer) {
    return null;
  }

  return (
    <div
      className={cn(
        "flex w-full items-center justify-between gap-3 border-b border-border/50",
        "bg-background/80 px-4 py-2 backdrop-blur-sm sm:px-6 lg:px-8",
      )}
    >
      {/* Breadcrumb */}
      <nav
        aria-label="Breadcrumb"
        className="flex min-w-0 items-center gap-1 overflow-hidden text-xs text-muted-foreground"
      >
        {crumbs.length === 0 ? (
          <span className="font-medium text-foreground">Admin</span>
        ) : (
          crumbs.map((c, i) => (
            <span key={`${c.href ?? c.label}-${i}`} className="flex items-center gap-1">
              {i > 0 ? <ChevronRight className="size-3 text-muted-foreground/60" aria-hidden /> : null}
              {c.href ? (
                <Link
                  href={c.href}
                  className="rounded px-1 py-0.5 transition-colors hover:bg-muted/50 hover:text-foreground"
                >
                  {c.label}
                </Link>
              ) : (
                <span className="px-1 py-0.5 font-semibold text-foreground">{c.label}</span>
              )}
            </span>
          ))
        )}
      </nav>

      {/* Right cluster — contextual actions + tier chip */}
      <div className="flex shrink-0 items-center gap-2">
        <button
          type="button"
          onClick={() => upgradeModal.setOpen(true)}
          className={cn(
            "inline-flex items-center gap-2 rounded-full bg-white px-3 py-1 text-[12px] text-foreground/80",
            "border border-[rgba(24,24,27,0.18)] transition-[border-color,box-shadow] duration-150",
            "hover:border-[rgba(201,162,39,0.4)] hover:shadow-[0_4px_12px_-6px_rgba(0,0,0,0.2)]",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(201,162,39,0.5)]",
          )}
          title="Click to view plans"
        >
          <span
            className="size-2 shrink-0 rounded-full"
            style={{ backgroundColor: planDot }}
            aria-hidden
          />
          <span className="truncate">
            <strong className="font-semibold text-foreground">Nova Roster</strong>
            <span className="mx-1 text-muted-foreground/70">·</span>
            <span>{planLabel}</span>
            <span className="mx-1 text-muted-foreground/70">·</span>
            <span className="text-muted-foreground">{planUsage}</span>
          </span>
          <ChevronDown className="size-3 shrink-0 text-muted-foreground/70" aria-hidden />
        </button>
        {showPublishPill ? (
          <Link
            href="/admin/site-settings/structure"
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border border-amber-500/40",
              "bg-amber-500/10 px-3 py-1 text-[11px] font-semibold text-amber-400",
              "transition-colors hover:border-amber-500/60 hover:bg-amber-500/15",
            )}
            title="Open the composer to review and publish pending draft changes."
          >
            <Rocket className="size-3" aria-hidden />
            Publish via Composer
          </Link>
        ) : null}
        {isSiteArea ? (
          <a
            href="/"
            target="_blank"
            rel="noreferrer noopener"
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border border-border/60",
              "bg-background/70 px-3 py-1 text-[11px] font-medium text-muted-foreground",
              "transition-colors hover:border-[var(--impronta-gold-border)]/55 hover:text-foreground",
            )}
            title="Open the public site in a new tab"
          >
            <ExternalLink className="size-3" aria-hidden />
            Public site
          </a>
        ) : null}
      </div>
    </div>
  );
}
