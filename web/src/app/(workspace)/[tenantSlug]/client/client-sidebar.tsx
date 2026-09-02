"use client";

// CW1 (client-dashboard premium plan, 2026-07-23) — workspace-style left
// sidebar for the client dashboard. Replaces the horizontal ClientTopbar tab
// strip on desktop so clients get the same navigation identity the workspace
// admin and talent dashboards ship. The topbar remains the MOBILE nav (the
// layout hides this rail and shows the strip under 900px — see
// client-shell.css).
//
// Deliberately self-contained: this tree is server-rendered, so we never
// import the admin shell's client-only state barrel here (it would pull the
// whole prototype into the client bundle). Icons are a minimal inline SVG set.

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { createTranslator } from "@/i18n/messages";
import { useFavorites } from "@/lib/talent-cards/use-favorites";
import { CLIENT_PRO_PRICING_LIVE } from "@/lib/client-billing/pricing-flag";
import type { ClientSubscriptionTier } from "@/lib/discover/client-subscription";
import type { ClientTrustLevel } from "@/lib/client-trust/evaluator";

// ─── Icon set (15px, stroke 1.6 — matches the talent rail) ─────────────────

function NavIcon({ name }: { name: string }) {
  const common = {
    width: 15,
    height: 15,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.6,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };
  switch (name) {
    case "home":
      return <svg {...common}><path d="M3 10.5 12 3l9 7.5" /><path d="M5 9.5V21h14V9.5" /></svg>;
    case "mail":
      return <svg {...common}><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6" /></svg>;
    case "inbox":
      return <svg {...common}><path d="M4 4h16v12h-5l-3 4-3-4H4z" /></svg>;
    case "calendar":
      return <svg {...common}><rect x="3" y="4" width="18" height="17" rx="2" /><path d="M3 9h18M8 2v4M16 2v4" /></svg>;
    case "compass":
      return <svg {...common}><circle cx="12" cy="12" r="9" /><path d="m15 9-2 5-4 1 2-5z" /></svg>;
    case "heart":
      return <svg {...common}><path d="M12 20s-7-4.5-9-9c-1.2-2.8.6-6 3.7-6 1.9 0 3.4 1 4.3 2.5C11.9 6 13.4 5 15.3 5c3.1 0 4.9 3.2 3.7 6-2 4.5-9 9-7 9z" /></svg>;
    case "list":
      return <svg {...common}><path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01" /></svg>;
    case "spark":
      return <svg {...common}><path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M18.4 5.6l-2.8 2.8M8.4 15.6l-2.8 2.8" /></svg>;
    case "star":
      return <svg {...common}><path d="m12 3 2.7 5.8 6.3.7-4.7 4.3 1.3 6.2L12 16.9 6.4 20l1.3-6.2L3 9.5l6.3-.7z" /></svg>;
    case "hub":
      return <svg {...common}><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></svg>;
    case "settings":
      return <svg {...common}><circle cx="12" cy="12" r="3" /><path d="M19 12a7 7 0 0 0-.1-1.2l2-1.6-2-3.4-2.4 1a7 7 0 0 0-2-1.2L14 3h-4l-.5 2.6a7 7 0 0 0-2 1.2l-2.4-1-2 3.4 2 1.6A7 7 0 0 0 5 12c0 .4 0 .8.1 1.2l-2 1.6 2 3.4 2.4-1a7 7 0 0 0 2 1.2L10 21h4l.5-2.6a7 7 0 0 0 2-1.2l2.4 1 2-3.4-2-1.6c.1-.4.1-.8.1-1.2z" /></svg>;
    default:
      return <svg {...common}><circle cx="12" cy="12" r="8" /></svg>;
  }
}

// ─── Nav model ──────────────────────────────────────────────────────────────

type NavItem = { key: string; path: string; icon: string; fallbackLabel?: string };

const GROUPS: Array<{ labelKey: string | null; items: NavItem[] }> = [
  {
    labelKey: null,
    items: [{ key: "today", path: "today", icon: "home" }],
  },
  {
    labelKey: "dashboard.clientNav.groupWork",
    items: [
      { key: "messages", path: "messages", icon: "mail" },
      { key: "inquiries", path: "inquiries", icon: "inbox" },
      { key: "bookings", path: "bookings", icon: "calendar" },
    ],
  },
  {
    labelKey: "dashboard.clientNav.groupFind",
    items: [
      { key: "discover", path: "discover", icon: "compass" },
      { key: "favorites", path: "favorites", icon: "heart" },
      { key: "shortlists", path: "shortlists", icon: "list" },
      { key: "pitches", path: "pitches", icon: "spark" },
    ],
  },
  {
    labelKey: "dashboard.clientNav.groupAccount",
    items: [{ key: "reviews", path: "reviews", icon: "star", fallbackLabel: "Reviews" }],
  },
];

const SETTINGS_ITEM: NavItem = { key: "settings", path: "settings", icon: "settings" };

const TIER_LABEL: Record<ClientSubscriptionTier, string> = {
  standard: "Standard",
  pro: "Pro",
  enterprise: "Enterprise",
};

const TRUST_LABEL: Record<ClientTrustLevel, string> = {
  basic: "Basic",
  verified: "Verified",
  silver: "Silver",
  gold: "Gold",
};

// ─── Component ──────────────────────────────────────────────────────────────

export function ClientSidebar({
  tenantSlug,
  locale = "en",
  reviewsEnabled = true,
  subscriptionTier = "standard",
  trustLevel = "basic",
  showHub = false,
}: {
  tenantSlug: string;
  locale?: string;
  reviewsEnabled?: boolean;
  subscriptionTier?: ClientSubscriptionTier;
  trustLevel?: ClientTrustLevel;
  /**
   * CH1 — cross-agency hub entry. Hidden on whitelabel-branded surfaces: an
   * agency's own dashboard must not advertise a client's other agencies.
   */
  showHub?: boolean;
}) {
  const pathname = usePathname();
  const t = createTranslator(locale);
  const favorites = useFavorites();
  const [counts, setCounts] = useState<{ shortlists: number | null; pitches: number | null }>({
    shortlists: null,
    pitches: null,
  });

  // Same lazy count hydration the topbar used — pills appear when the
  // fetch lands; failures stay null (no pill).
  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetch("/api/discover/shortlists").then((r) => (r.ok ? r.json() : { shortlists: [] })),
      fetch("/api/client/pitches/count").then((r) => (r.ok ? r.json() : { count: 0 })),
    ])
      .then(([sl, pi]: [{ shortlists?: unknown[] }, { count?: number }]) => {
        if (cancelled) return;
        setCounts({
          shortlists: Array.isArray(sl.shortlists) ? sl.shortlists.length : 0,
          pitches: typeof pi.count === "number" ? pi.count : 0,
        });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const countFor = (path: string): number | null => {
    if (path === "favorites") return favorites.isReady ? favorites.favoritesCount : null;
    if (path === "shortlists") return counts.shortlists;
    if (path === "pitches") return counts.pitches;
    return null;
  };

  const label = (item: NavItem) => {
    const messageKey = `dashboard.clientNav.${item.key}`;
    const translated = t(messageKey);
    return translated === messageKey && item.fallbackLabel ? item.fallbackLabel : translated;
  };

  const renderItem = (item: NavItem) => {
    const href = `/${tenantSlug}/client/${item.path}`;
    const active = pathname === href || pathname.startsWith(href + "/");
    const n = countFor(item.path);
    return (
      <Link
        key={item.path}
        href={href}
        aria-current={active ? "page" : undefined}
        className={`flex w-full items-center gap-[10px] rounded-[8px] border px-[10px] py-[8px] font-admin-body text-[13px] tracking-[0.05px] no-underline [transition:background_120ms,color_120ms,box-shadow_120ms] ${
          active
            ? "border-admin-border-soft bg-white font-semibold text-admin-ink shadow-admin-rest"
            : "border-transparent bg-transparent font-medium text-admin-ink-muted hover:bg-[rgba(11,11,13,0.04)] hover:text-admin-ink"
        }`}
      >
        <NavIcon name={item.icon} />
        <span className="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap">
          {label(item)}
        </span>
        {n != null && n > 0 && (
          <span
            aria-label={`${n}`}
            className={`inline-flex h-[17px] min-w-[17px] items-center justify-center rounded-full px-[5px] text-[10px] font-bold leading-none ${
              active ? "bg-admin-brand text-white" : "bg-[rgba(11,11,13,0.06)] text-admin-ink-dim"
            }`}
          >
            {n > 99 ? "99+" : n}
          </span>
        )}
      </Link>
    );
  };

  const tierLabel = TIER_LABEL[subscriptionTier];
  const trustLabel = TRUST_LABEL[trustLevel];
  const tierChipClass =
    subscriptionTier === "enterprise"
      ? "bg-admin-ink text-white border border-admin-ink"
      : subscriptionTier === "pro"
        ? "bg-[rgba(15,79,62,0.10)] text-admin-accent border border-[rgba(15,79,62,0.28)]"
        : "bg-[rgba(11,11,13,0.05)] text-admin-ink-muted border border-[rgba(11,11,13,0.10)]";
  const trustChipClass =
    trustLevel === "gold"
      ? "bg-[rgba(15,79,62,0.10)] text-admin-accent border border-[rgba(15,79,62,0.28)]"
      : trustLevel === "silver"
        ? "bg-[rgba(11,11,13,0.08)] text-admin-ink border border-[rgba(11,11,13,0.14)]"
        : trustLevel === "verified"
          ? "bg-[rgba(29,78,216,0.08)] text-[#1D4ED8] border border-[rgba(29,78,216,0.22)]"
          : "bg-[rgba(11,11,13,0.05)] text-admin-ink-muted border border-[rgba(11,11,13,0.10)]";

  const planKey = "dashboard.clientNav.plan";
  const planT = t(planKey);
  const planLabel = planT === planKey ? "Plan" : planT;
  const trustKey = "dashboard.clientNav.trust";
  const trustT = t(trustKey);
  const trustRowLabel = trustT === trustKey ? "Trust" : trustT;

  return (
    <aside
      data-tulala-client-sidebar
      className="sticky top-[56px] flex h-[calc(100vh-56px)] flex-col gap-[12px] self-start overflow-y-auto border-r border-admin-border-soft bg-admin-surface-alt px-[10px] pb-[12px] pt-[14px] font-admin-body"
    >
      <nav aria-label={t("dashboard.clientNav.aria") === "dashboard.clientNav.aria" ? "Client sections" : t("dashboard.clientNav.aria")} className="flex flex-col gap-[2px]">
        {GROUPS.map((group, gi) => {
          const items = group.items.filter((i) => reviewsEnabled || i.key !== "reviews");
          if (items.length === 0) return null;
          const groupT = group.labelKey ? t(group.labelKey) : null;
          const groupLabel = groupT === group.labelKey ? null : groupT;
          return (
            <div key={group.labelKey ?? `group-${gi}`} className="flex flex-col gap-[2px]">
              {groupLabel && (
                <div
                  aria-hidden
                  className="px-[10px] pb-[4px] pt-[10px] text-[10px] font-bold uppercase tracking-[0.14em] text-admin-ink-dim"
                >
                  {groupLabel}
                </div>
              )}
              {items.map(renderItem)}
            </div>
          );
        })}
      </nav>

      {showHub && (
        <>
          <div
            aria-hidden
            className="px-[10px] pb-[4px] pt-[10px] text-[10px] font-bold uppercase tracking-[0.14em] text-admin-ink-dim"
          >
            {t("dashboard.clientHub.eyebrow") === "dashboard.clientHub.eyebrow"
              ? "All agencies"
              : t("dashboard.clientHub.eyebrow")}
          </div>
          <Link
            href="/client/hub"
            data-tulala-client-hub-nav
            className="flex w-full items-center gap-[10px] rounded-[8px] border border-transparent bg-transparent px-[10px] py-[8px] font-admin-body text-[13px] font-medium text-admin-ink-muted no-underline hover:bg-[rgba(11,11,13,0.04)] hover:text-admin-ink [transition:background_120ms,color_120ms]"
          >
            <NavIcon name="hub" />
            <span className="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap">
              {t("dashboard.clientHub.navHub") === "dashboard.clientHub.navHub"
                ? "All agencies"
                : t("dashboard.clientHub.navHub")}
            </span>
          </Link>
        </>
      )}

      <div className="flex-1" />

      {/* Rail footer — plan + trust standing, permanently visible (CW1's
          whole point: the monetization axes stop being invisible), plus
          Settings pinned Shopify-style. */}
      <div className="flex flex-col gap-[6px] border-t border-admin-border pt-[6px]">
        {/* WP4 — the always-visible Plan row advertises the client
            subscription tiers, whose pricing is still placeholder. Hidden
            until real pricing ships (CLIENT_PRO_PRICING_LIVE). Trust
            standing below is orthogonal to plan and stays visible. */}
        {CLIENT_PRO_PRICING_LIVE && (
          <Link
            href={`/${tenantSlug}/client/subscription`}
            data-tulala-client-plan-nav
            className="flex w-full items-center justify-between gap-[8px] rounded-[8px] border border-transparent bg-transparent px-[10px] py-[8px] font-admin-body text-[13px] font-medium text-admin-ink-muted no-underline hover:bg-[rgba(11,11,13,0.04)] hover:text-admin-ink [transition:background_120ms,color_120ms]"
          >
            <span>{planLabel}</span>
            <span
              aria-hidden
              className={`rounded-full px-[6px] py-[2px] text-[9.5px] font-bold uppercase tracking-[0.4px] ${tierChipClass}`}
            >
              {tierLabel}
            </span>
          </Link>
        )}
        <Link
          href={`/${tenantSlug}/client/settings#trust`}
          data-tulala-client-trust-nav
          className="flex w-full items-center justify-between gap-[8px] rounded-[8px] border border-transparent bg-transparent px-[10px] py-[8px] font-admin-body text-[13px] font-medium text-admin-ink-muted no-underline hover:bg-[rgba(11,11,13,0.04)] hover:text-admin-ink [transition:background_120ms,color_120ms]"
        >
          <span>{trustRowLabel}</span>
          <span
            aria-hidden
            className={`rounded-full px-[6px] py-[2px] text-[9.5px] font-bold uppercase tracking-[0.4px] ${trustChipClass}`}
          >
            {trustLabel}
          </span>
        </Link>
        {renderItem(SETTINGS_ITEM)}
      </div>
    </aside>
  );
}
