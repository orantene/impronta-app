"use client";

import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { WorkspaceMediaPage } from "../media-page";
import { useWebsiteSubnav } from "./website-nav";
import { useDashboardText } from "../dashboard-i18n";
import { Avatar, Icon, useRovingTabindex } from "../primitives";
import { COLORS, ENTITY_TYPE_META, FAB_PALETTE_CHANGED_EVENT, FAB_PALETTE_OPEN_EVENT, meetsRole, PAGE_META, PLAN_META, useAdminShell } from "../state";
import type { FabPaletteChangedDetail, WorkspacePage } from "../state";
import { ShortcutHelpOverlay, useKeyboardLayer } from "../workspace";
import { useCanonicalRouteChildren } from "../canonical-route-children";
import { CalendarPage } from "./CalendarPage";
import { ClientsPage } from "./ClientsPage";
import { TulalaIdentityBar } from "./IdentityBar-1";
import { UnifiedInboxPage, WorkspaceMessagesPage } from "./InboxPage";
import { OperationsPage, ProductionPage } from "./OperationsPage";
import { OverviewPage } from "./OverviewPage";
import { PayoutsPage } from "./PayoutsPage";
import { PitchesPage } from "./PitchesPage-1";
import { SitePage } from "./SitePage";
import { TalentPage } from "./TalentPage-1";
import { WebsitePage } from "./WebsitePage-1";
import { WorkPage } from "./WorkPage";
import { WorkspacePageView } from "./WorkspacePageView";
import { MessagesShell } from "./pages-dynamic";


/**
 * HybridShell — wraps any inner shell with the persistent identity bar.
 * Use for workspace + talent surfaces (the hybrid-user surfaces).
 */
export function HybridShell({ children }: { children: ReactNode }) {
  return (
    <>
      <TulalaIdentityBar />
      {children}
    </>
  );
}

// ════════════════════════════════════════════════════════════════════
// Workspace shell + page router
// ════════════════════════════════════════════════════════════════════

export function WorkspaceShell() {
  const { state, setPage, openDrawer } = useAdminShell();
  const [helpOpen,  setHelpOpen]  = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);

  const openPalette = () => {
    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event(FAB_PALETTE_OPEN_EVENT));
    }
  };

  // Track FAB palette state via the broadcast event so global keyboard
  // shortcuts (G I, j/k, etc.) suppress while the palette is open.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onChange = (e: Event) => {
      const detail = (e as CustomEvent<FabPaletteChangedDetail>).detail;
      setPaletteOpen(!!detail?.open);
    };
    window.addEventListener(FAB_PALETTE_CHANGED_EVENT, onChange);
    return () => window.removeEventListener(FAB_PALETTE_CHANGED_EVENT, onChange);
  }, []);

  // WS-7.4 — global keyboard shortcuts. ⌘K + onOpenSearch both route to
  // the unified BottomActionFab palette via window event.
  useKeyboardLayer({
    onOpenPalette: openPalette,
    onOpenHelp:    () => setHelpOpen((v) => !v),
    onNavigate:    setPage,
    onCompose:     () => openDrawer("new-inquiry"),
    isModalOpen:   !!state.drawer.drawerId || helpOpen || paletteOpen,
  });

  return (
    <HybridShell>
      {/* The sidebar rail is the ONE canonical workspace chrome. The legacy
          horizontal-topbar layout (workspaceLayout === "topbar") is retired:
          it duplicated the rail's nav as a second parallel surface. The
          workspaceLayout pref is ignored here on purpose — do not re-add a
          branch without a product decision. */}
      <WorkspaceSidebarShell />
      {/* WS-7.5 Shortcut help overlay */}
      <ShortcutHelpOverlay open={helpOpen} onClose={() => setHelpOpen(false)} />
    </HybridShell>
  );
}

/**
 * Sidebar nav IA — Shopify-style grouped rail. Small uppercase group
 * labels, every destination carries an icon, live badges on Messages
 * (unread) + Roster (pending approvals/verifications), and Settings
 * pinned to the bottom of the rail like Shopify's admin.
 */
const SIDEBAR_GROUPS: Array<{ label: string | null; pages: WorkspacePage[] }> = [
  { label: null, pages: ["overview"] },
  { label: "Operate", pages: ["messages", "calendar", "roster", "clients"] },
  { label: "Grow", pages: ["pitches", "operations", "production"] },
  { label: "Site", pages: ["website", "media"] },
];

/** Complete icon coverage for the rail — PAGE_ICON only maps the canonical 6. */
const SIDEBAR_ICON: Record<string, Parameters<typeof Icon>[0]["name"]> = {
  overview: "home",
  messages: "mail",
  calendar: "calendar",
  roster: "team",
  clients: "briefcase",
  pitches: "send",
  operations: "layers",
  production: "camera",
  website: "globe",
  media: "image",
  settings: "settings",
};

function SidebarNavButton({
  page,
  active,
  badge,
  badgeTone = "amber",
  badgeTitle,
  onSelect,
  label,
  description,
}: {
  page: WorkspacePage;
  active: boolean;
  badge?: number;
  badgeTone?: "amber" | "brand";
  badgeTitle?: string;
  onSelect: () => void;
  label: string;
  description?: string;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      title={description}
      aria-label={description ? `${label} — ${description}` : label}
      aria-current={active ? "page" : undefined}
      className={`flex w-full cursor-pointer items-center gap-[10px] rounded-[8px] border px-[10px] py-[8px] text-left font-admin-body text-[13px] tracking-[0.05px] [transition:background_var(--transition-admin-micro),color_var(--transition-admin-micro),box-shadow_var(--transition-admin-micro)] ${
        active
          ? "border-admin-border-soft bg-white font-semibold text-admin-ink shadow-admin-rest"
          : "border-transparent bg-transparent font-medium text-admin-ink-muted hover:bg-[rgba(11,11,13,0.04)] hover:text-admin-ink"
      }`}
    >
      <Icon
        name={SIDEBAR_ICON[page] ?? "circle"}
        size={15}
        stroke={1.6}
        color="currentColor"
      />
      <span className="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap">
        {label}
      </span>
      {badge != null && badge > 0 && (
        <span
          title={badgeTitle}
          aria-label={badgeTitle ?? `${badge} pending`}
          className={`inline-flex h-[17px] min-w-[17px] items-center justify-center rounded-full px-[5px] text-[10px] font-bold leading-none text-white ${
            badgeTone === "brand" ? "bg-admin-brand" : "bg-admin-amber"
          }`}
        >
          {badge > 99 ? "99+" : badge}
        </span>
      )}
    </button>
  );
}

/**
 * X2: SidebarShell — workspace-style vertical rail layout, redesigned to
 * the Shopify admin mental model: grey rail on the left with grouped,
 * icon-complete nav (white active pill), live badges, Website sub-links
 * when that section is active, and Settings pinned at the bottom. The
 * main column carries the same PageRouter content as the topbar shell.
 */
function WorkspaceSidebarShell() {
  const {
    state,
    setPage,
    openDrawer,
    effectiveTenant,
    totalUnread,
    effectiveRoster,
    verificationRequests,
    overviewMetrics,
    tenantSlug,
    adminBasePath,
  } = useAdminShell();
  const copy = useDashboardText();
  const router = useRouter();
  const pathname = usePathname();

  // Website sub-nav — single source of truth shared with the hover dropdown
  // and the mobile pill strip (website-nav.ts). Gating (Redirects/Forms/
  // Design) is computed inside the hook.
  const websiteSubnav = useWebsiteSubnav();

  // WS-12.6 — roving tabindex on sidebar nav: arrow keys move between pages
  const sidebarNavRef = useRef<HTMLElement | null>(null);
  useRovingTabindex(sidebarNavRef, "button");

  // Badge sources — mirrors WorkspaceTopbar so both layouts agree on counts.
  const pendingVerifications = verificationRequests.filter(
    (r) => r.status === "submitted" || r.status === "in_review" || r.status === "pending_user_action",
  ).length;
  const livePendingCount = effectiveRoster.filter((p) => p.state === "awaiting-approval").length;
  const rosterPending =
    (overviewMetrics !== null ? (overviewMetrics.pendingApprovals ?? 0) : livePendingCount) +
    pendingVerifications;

  // Nested sub-nav (Shopify pattern) — shown under the active section.
  // Website sub-views + the Roster queues (Applications carries the pending
  // count so the parent badge is actionable in one click).
  // Host-aware: `/admin` on the tenant's own domain, `/{slug}/admin` on the
  // shared app host. Resolved once in the provider — see `adminBasePath`.
  const adminBase = adminBasePath;
  const rosterBase = `${adminBase}/roster`;
  const pendingApplications =
    overviewMetrics !== null ? (overviewMetrics.pendingApprovals ?? 0) : livePendingCount;
  const subItemsFor = (
    p: WorkspacePage,
  ): Array<{
    label: string;
    href: string;
    exact?: boolean;
    count?: number;
    /** Opens in a new tab instead of routing (the visual editor is the storefront). */
    external?: boolean;
  }> | null => {
    if (p === "website") {
      // Single source of truth — see website-nav.ts. Order + gating are
      // computed there; the sidebar just maps to its own render shape.
      return websiteSubnav.map((item) => ({
        label: item.label,
        href: item.href,
        exact: item.id === "overview",
        external: item.external,
        count: item.count,
      }));
    }
    if (p === "roster") {
      return [
        {
          label: copy.isSpanish ? "Todos" : "All",
          href: rosterBase,
          exact: true,
        },
        {
          label: copy.isSpanish ? "Solicitudes" : "Applications",
          href: `${rosterBase}/applications`,
          count: pendingApplications,
        },
        {
          label: copy.isSpanish ? "Registro" : "Registration",
          href: `${rosterBase}/registration`,
        },
        {
          // Per-talent day rates — roster DATA, so it belongs beside the
          // roster. The tenant-wide fallback stays in Settings (a policy).
          label: copy.isSpanish ? "Tarifas" : "Rates",
          href: `${rosterBase}/rates`,
        },
      ];
    }
    return null;
  };

  const pageLabel = (p: WorkspacePage) =>
    p === "roster"
      ? copy.t(ENTITY_TYPE_META[state.entityType].rosterLabel)
      : copy.t(PAGE_META[p].label);
  const pageDescription = (p: WorkspacePage) =>
    PAGE_META[p].description ? copy.t(PAGE_META[p].description as string) : undefined;

  const renderItem = (p: WorkspacePage) => {
    const active =
      state.page === p ||
      (p === "settings" && state.page === "workspace") ||
      (p === "messages" && state.page === "inbox") ||
      (p === "website" && state.page === "site") ||
      (p === "roster" && state.page === "talent");
    const badge = p === "messages" ? totalUnread : p === "roster" ? rosterPending : 0;
    const badgeTitle =
      p === "messages"
        ? copy.isSpanish
          ? `${totalUnread} sin leer`
          : `${totalUnread} unread`
        : p === "roster"
          ? copy.isSpanish
            ? `${rosterPending} pendientes de revisión`
            : `${rosterPending} awaiting review`
          : undefined;
    return (
      <div key={p}>
        <SidebarNavButton
          page={p}
          active={active}
          badge={badge}
          badgeTone={p === "messages" ? "brand" : "amber"}
          badgeTitle={badgeTitle}
          onSelect={() => setPage(p)}
          label={pageLabel(p)}
          description={pageDescription(p)}
        />
        {/* Sub-links — Shopify-style nested nav under the active section.
            Sub-destinations are real Next routes, so navigate via router. */}
        {active && subItemsFor(p) && (
          <div className="mb-[3px] mt-[2px] flex flex-col gap-px pl-[25px]">
            {(subItemsFor(p) ?? []).map((sub) => {
              const subActive = sub.external
                ? false
                : sub.exact
                  ? pathname === sub.href
                  : (pathname ?? "").startsWith(sub.href);
              return (
                <button
                  key={sub.href}
                  type="button"
                  onClick={() =>
                    sub.external
                      ? window.open(sub.href, "_blank", "noopener,noreferrer")
                      : router.push(sub.href)
                  }
                  aria-current={subActive ? "page" : undefined}
                  className={`flex cursor-pointer items-center gap-[8px] border-y-0 border-r-0 border-l-2 border-solid bg-transparent px-[10px] py-[5px] text-left font-admin-body text-[12.5px] hover:text-admin-ink [transition:color_var(--transition-admin-micro),border-color_var(--transition-admin-micro)] ${
                    subActive
                      ? "border-l-admin-ink font-semibold text-admin-ink"
                      : "border-l-admin-border font-medium text-admin-ink-muted"
                  }`}
                >
                  <span className="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap">
                    {copy.t(sub.label)}
                  </span>
                  {sub.external && (
                    <span aria-hidden className="text-[10px] leading-none opacity-70">
                      ↗
                    </span>
                  )}
                  {sub.count != null && sub.count > 0 && (
                    <span className="inline-flex h-[15px] min-w-[16px] items-center justify-center rounded-full bg-admin-amber-soft px-[4px] text-[9.5px] font-bold leading-none text-admin-amber-deep">
                      {sub.count > 99 ? "99+" : sub.count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  return (
    <div
      data-tulala-workspace-grid
      className="grid grid-cols-[240px_1fr] bg-admin-surface min-h-[calc(100vh-56px-56px-50px)]"
    >
      {/* Full viewport-column height (not max-height) so the tinted rail
          never ends mid-page — it reads as chrome, not a floating card. */}
      <aside
        data-tulala-app-sidebar
        className="sticky top-[calc(var(--proto-cbar,50px)+56px)] flex h-[calc(100vh-var(--proto-cbar,50px)-56px)] flex-col gap-[12px] self-start overflow-y-auto border-r border-admin-border-soft bg-admin-surface-alt px-[10px] pb-[12px] pt-[14px] font-admin-body"
      >
        {/* WS-12.10 — secondary skip link lets keyboard users bypass the
            sidebar nav and jump straight to the page content area. */}
        <a href="#tulala-workspace-content" className="skip-to-main">
          {copy.t("Skip to page content")}
        </a>
        {/* Tenant switcher (#3) — compact context chip at the top of the
            sidebar. Clicking opens the tenant-switcher drawer. On multi-
            workspace accounts this lists all workspaces; single-workspace
            shows workspace info. */}
        <button
          type="button"
          onClick={() => openDrawer("tenant-switcher")}
          className="flex w-full cursor-pointer items-center gap-[9px] rounded-[9px] border border-admin-border-soft bg-white px-[10px] py-[8px] text-left font-admin-body shadow-admin-rest hover:border-admin-border-strong [transition:border-color_var(--transition-admin-micro),box-shadow_var(--transition-admin-micro)]"
        >
          <Avatar initials={effectiveTenant.name.slice(0, 2).toUpperCase()} size={26} tone="ink" />
          <div className="flex-1 min-w-0">
            <div className="overflow-hidden text-ellipsis whitespace-nowrap text-[12.5px] font-semibold text-admin-ink">
              {effectiveTenant.name}
            </div>
            <div className="text-[10.5px] text-admin-ink-muted">
              {copy.isSpanish
                ? `Plan ${copy.t(PLAN_META[state.plan]?.label ?? state.plan)}`
                : `${PLAN_META[state.plan]?.label ?? state.plan} plan`}
            </div>
          </div>
          <Icon name="chevron-down" size={10} color={COLORS.inkDim} />
        </button>

        {/* Page nav — the one thing the sidebar owns. Tenant identity,
            mode toggle, bell/help all live in the persistent identity
            bar above. Grouped Shopify-style. */}
        <nav ref={sidebarNavRef} aria-label="Workspace sections" className="flex flex-col gap-[2px]">
          {SIDEBAR_GROUPS.map((group, gi) => (
            <div key={group.label ?? `group-${gi}`} className="flex flex-col gap-[2px]">
              {group.label && (
                <div
                  aria-hidden
                  className="px-[10px] pb-[4px] pt-[10px] text-[10px] font-bold uppercase tracking-[0.14em] text-admin-ink-dim"
                >
                  {copy.t(group.label)}
                </div>
              )}
              {group.pages.map(renderItem)}
            </div>
          ))}
        </nav>

        <div className="flex-1" />

        {/* Settings — pinned to the rail's bottom, Shopify-style. No create
            CTA here: "New inquiry" already lives in the Overview header, the
            + FAB, the ⌘K palette, and the C shortcut — a fifth entry point
            would be duplication, not convenience. */}
        <div className="flex flex-col gap-[6px] border-t border-admin-border pt-[6px]">
          {renderItem("settings")}
        </div>
      </aside>

      <main
        id="tulala-workspace-content"
        tabIndex={-1}
        data-tulala-surface-main
        style={{
          padding: "28px 28px 60px",
          maxWidth: 1180,
          width: "100%",
          margin: "0 auto",
          outline: "none",
        }}
      >
        <PageRouter page={state.page} />
      </main>
    </div>
  );
}

function PageRouter({ page }: { page: WorkspacePage }) {
  // W12 — same first-paint guard as TalentRouter: animating the initial page
  // pins the whole surface at opacity 0 until hydration completes. The fade
  // only attaches once the user has switched pages in-app.
  const [initialPage] = useState(page);
  const navigatedAway = page !== initialPage;
  const [everNavigated, setEverNavigated] = useState(false);
  useEffect(() => { if (navigatedAway) setEverNavigated(true); }, [navigatedAway]);
  const animate = everNavigated || navigatedAway;
  // Canonical routes (financials, discover-performance, triage, work/[id], …)
  // are real Next.js server pages. When AdminShellClient detects a canonical
  // path it publishes the route content here so it renders INSIDE the shell's
  // <main> — with the real sidebar + top bar — instead of as a naked page.
  // Non-canonical routes get `null` and fall through to the SPA page switch.
  // The route content flows through the SAME animated wrapper as SPA bodies
  // (below) so it reuses the existing styling rather than adding a new one.
  const canonicalChildren = useCanonicalRouteChildren();
  let body: React.ReactNode = null;
  if (canonicalChildren != null) {
    body = canonicalChildren;
  } else
  switch (page) {
    case "overview":
      body = <OverviewPage />;
      break;
    // WS-3.2 — canonical "messages" route (was "inbox").
    // 2026 redesign: legacy "inbox" alias now also routes to MessagesShell
    // so the old UnifiedInboxPage chrome stops appearing for any user that
    // bookmarks the legacy URL. (UnifiedInboxPage kept compiled for any
    // direct programmatic invocations elsewhere in the prototype.)
    case "messages":
    case "inbox":
      body = <WorkspaceMessagesPage />;
      break;
    case "calendar":
      body = <CalendarPage />;
      break;
    // WS-3.3 — "work" pipeline is now a view-filter inside Messages;
    // keep the page component for now so deep-links still land somewhere.
    case "work":
      body = <WorkPage />;
      break;
    // WS-3.1 — canonical "roster" route (was "talent")
    case "roster":
    case "talent":     // legacy alias
      body = <TalentPage />;
      break;
    case "clients":
      body = <ClientsPage />;
      break;
    case "pitches":
      body = <PitchesPage />;
      break;
    case "operations":
      body = <OperationsPage />;
      break;
    case "production":
      body = <ProductionPage />;
      break;
    // 2026 — Website is the premium site management surface (pages,
    // posts, redirects, custom code, tracking, SEO, domain, maintenance,
    // announcement). Legacy `site` aliases here; `SitePage` is the older
    // stub kept for the alias path.
    case "website":
      body = <WebsitePage />;
      break;
    case "site":
      body = <WebsitePage />;
      break;
    // Media Gallery + Watermark — Agency/Studio gated
    case "media":
      body = <WorkspaceMediaPage />;
      break;
    // Stripe Connect payout onboarding + base reservation fee. In-shell
    // SPA section (renders inside the dashboard nav, not standalone).
    case "payouts":
      body = <PayoutsPage />;
      break;
    // WS-3.5 — canonical "settings" route (was "workspace"); billing
    // is folded in as an anchor section inside the settings page.
    case "settings":
    case "workspace":  // legacy alias
    case "billing":    // legacy alias — folded into settings
      body = <WorkspacePageView />;
      break;
  }
  return (
    <div key={page} data-tulala-workspace-page-anim style={animate ? { animation: "tulala-page-fade .22s cubic-bezier(.4,0,.2,1)" } : undefined}>
      {body}
    </div>
  );
}
