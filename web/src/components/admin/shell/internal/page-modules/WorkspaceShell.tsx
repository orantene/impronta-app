"use client";

import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useWorkspaceNav } from "./workspace-nav";
import type { WorkspaceNavItem } from "./workspace-nav-groups";
import { useDashboardText } from "../dashboard-i18n";
import { Icon, useRovingTabindex } from "../primitives";
import type { AdminShellIconName } from "../primitives";
import { COLORS, FAB_PALETTE_CHANGED_EVENT, PAGE_META, PLAN_META, useAdminShell } from "../state";
import type { FabPaletteChangedDetail, WorkspacePage } from "../state";
import { ShortcutHelpOverlay, useKeyboardLayer } from "../keyboard-layer";
import { useCanonicalRouteChildren } from "../canonical-route-children";
import { resolveDestination } from "@/lib/workspace/destinations";
import { TulalaWordmark } from "@/components/brand/tulala-logo";
import { TulalaIdentityBar } from "./IdentityBar-1";
// EXPERIMENTAL. Renders nothing when the flag is off. Delete with REMOVAL.md.
import { WhatsAppDrawerHost } from "@/components/admin/channels/WhatsAppChrome";
import { GLOBAL_SEARCH_OPEN_EVENT, GlobalSearchOverlay } from "./GlobalSearchOverlay";
import { PosRailModeMenuProvider } from "./PosRailModeMenu";
// Every SPA page is a `next/dynamic` boundary (workspace-pages-lazy.tsx says
// why): the shell's chunk carries the rail and the chrome, not the pages.
import {
  AnalyticsPage,
  AppointmentsPage,
  CalendarPage,
  CatalogPage,
  ClientsPage,
  EventsPage,
  OverviewBoard,
  PayoutsPage,
  PitchesPage,
  ReviewsPage,
  TalentPage,
  WebsitePage,
  WorkspaceMediaPage,
  WorkspaceMessagesPage,
  WorkspacePageView,
} from "./workspace-pages-lazy";
import { PageSkeleton } from "../primitives/page-skeleton";
import { useUrlPageSync } from "../use-url-page-sync";


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
  useUrlPageSync();
  const [helpOpen,  setHelpOpen]  = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);

  // ⌘K and the top bar's search button open the record search (W53). The
  // bottom FAB keeps its own create/AI palette behind FAB_PALETTE_OPEN_EVENT.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onOpen = () => setSearchOpen(true);
    window.addEventListener(GLOBAL_SEARCH_OPEN_EVENT, onOpen);
    return () => window.removeEventListener(GLOBAL_SEARCH_OPEN_EVENT, onOpen);
  }, []);

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
  //
  // SUPPRESSED UNDER POINT-OF-SALE CHROME. The till replaces the workspace
  // chrome, and a keyboard-wedge barcode scanner is a keyboard: it types the
  // code into the document with nothing focused. With these shortcuts live,
  // a scanned code containing `c` opened the New inquiry drawer over the
  // register and one containing `g` then `o` navigated the cashier to
  // Overview mid-scan (found by `e2e/cases/pos-scanner.spec.ts`). `Cmd/Ctrl-K`
  // is unaffected: it needs a modifier no scanner sends.
  const posChromeForKeys = resolveDestination(state.page)?.chrome === "pos";
  useKeyboardLayer({
    onOpenPalette: () => setSearchOpen(true),
    onOpenHelp:    () => setHelpOpen((v) => !v),
    onNavigate:    setPage,
    onCompose:     () => openDrawer("new-inquiry"),
    isModalOpen:   !!state.drawer.drawerId || helpOpen || paletteOpen || searchOpen || posChromeForKeys,
  });

  return (
    <>
      {/* The sidebar rail is the ONE canonical workspace chrome, and it now
          hosts the identity bar in its content column (the board's layout:
          brand in the rail, "Workspace › Page" beside the page). The legacy
          horizontal-topbar layout (workspaceLayout === "topbar") is retired:
          it duplicated the rail's nav as a second parallel surface. The
          workspaceLayout pref is ignored here on purpose — do not re-add a
          branch without a product decision. */}
      <WorkspaceSidebarShell />
      {/* WS-7.5 Shortcut help overlay */}
      <ShortcutHelpOverlay open={helpOpen} onClose={() => setHelpOpen(false)} />
      <GlobalSearchOverlay open={searchOpen} onClose={() => setSearchOpen(false)} />
      <WhatsAppDrawerHost />
    </>
  );
}

/**
 * Sidebar nav IA — the approved rail (Main / W36 / W37 / W38), built entirely
 * from the destination registry (`lib/workspace/destinations.ts`) via
 * `useWorkspaceNav()`.
 *
 * WHAT THE BOARD FIXES. The wordmark and its tagline sit at the head of the
 * rail, not in the top bar; the workspace chip carries the plan; the groups
 * read Operate / Sell & manage / Relationships / Money / Grow; counts sit on
 * Messages and Issues as quiet pills; Settings is pinned to the foot. Rows are
 * 27px high at 12.5px, the active row is a white pill with a hairline ring.
 *
 * WHAT STAYED. The skip link, the roving-focus nav and the
 * `data-tulala-app-sidebar` test hook.
 *
 * WHAT WILL NOT COME BACK. A point-of-sale row. The POS replaces the whole
 * admin chrome and is entered from the centred switch in the top bar; the
 * registry drops its group from the rail so a row here cannot be re-added by
 * accident.
 */
function SidebarNavButton({
  icon,
  active,
  badge,
  badgeTitle,
  onSelect,
  label,
  description,
}: {
  /** From the registry. There is no second icon table any more. */
  icon: AdminShellIconName;
  active: boolean;
  badge?: number;
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
      className={`flex h-[27px] w-full cursor-pointer items-center gap-[9px] rounded-[8px] border-0 px-[10px] text-left font-admin-body text-admin-12h [transition:background_var(--transition-admin-micro),color_var(--transition-admin-micro),box-shadow_var(--transition-admin-micro)] ${
        active
          ? "bg-admin-card font-semibold text-admin-ink shadow-[var(--shadow-admin-rest),inset_0_0_0_1px_var(--color-admin-border-soft)]"
          : "bg-transparent font-medium text-admin-ink-muted hover:bg-admin-card/60 hover:text-admin-ink"
      }`}
    >
      <Icon name={icon} size={15} stroke={1.6} color="currentColor" />
      <span className="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap">
        {label}
      </span>
      {badge != null && badge > 0 && (
        <span
          title={badgeTitle}
          aria-label={badgeTitle ?? `${badge} pending`}
          className="inline-flex items-center rounded-full bg-admin-surface-alt px-[6px] py-px text-admin-10h font-bold leading-[1.4] text-admin-ink-muted"
        >
          {badge > 99 ? "99+" : badge}
        </span>
      )}
    </button>
  );
}

/**
 * SidebarShell — the workspace's one chrome: the tinted rail on the left with
 * the brand at its head, grouped icon-complete nav (white active pill), live
 * counts, sub-links under the active section, and Settings pinned at the foot.
 * The top bar sits in the content column beside the rail, as the board draws
 * it, so the breadcrumb reads "Workspace › Page" next to the page itself.
 *
 * Every list this used to own now comes from `useWorkspaceNav()`. What is left
 * here is presentation: the brand block, the tenant chip, the skip link, roving
 * focus, and how a row and its children draw.
 */
function WorkspaceSidebarShell() {
  const { state, setPage, openDrawer, effectiveTenant } = useAdminShell();
  const copy = useDashboardText();
  const router = useRouter();

  /**
   * THE POINT OF SALE HAS NO SIDEBAR, and this is where that happens.
   *
   * `chrome: "pos"` on the destination registry says the surface replaces the
   * admin chrome rather than sitting inside it, so the rail and the 1180px
   * content clamp both come off and the route gets the whole width.
   *
   * DECIDED FROM SERVER DATA, NOT FROM THE PATH DURING RENDER. `state.page` is
   * seeded by the admin layout from `x-impronta-original-pathname` (see
   * `deriveInitialPage` there) and clamped by the same pure function on both
   * sides, so the server and the first client render agree. Reading
   * `usePathname()` here instead would be `null` during SSR — the shape of
   * the bug that made the whole tenant tree die on hydration — and would
   * paint the rail for one frame on every hard refresh of the counter.
   */
  const posChrome = resolveDestination(state.page)?.chrome === "pos";

  // The rail, from the registry. Groups, order, labels, icons, gating and
  // sub-views all come from here — see workspace-nav.ts.
  const { groups, pinned } = useWorkspaceNav();

  // WS-12.6 — roving tabindex on sidebar nav: arrow keys move between pages
  const sidebarNavRef = useRef<HTMLElement | null>(null);
  useRovingTabindex(sidebarNavRef, "button");

  const badgeTitleFor = (item: WorkspaceNavItem): string | undefined => {
    if (!item.badge || item.badge.count <= 0) return undefined;
    if (item.id === "messages") {
      return copy.isSpanish ? `${item.badge.count} sin leer` : `${item.badge.count} unread`;
    }
    if (item.id === "issues") {
      return copy.isSpanish ? `${item.badge.count} abiertas` : `${item.badge.count} open`;
    }
    return copy.isSpanish
      ? `${item.badge.count} pendientes de revisión`
      : `${item.badge.count} awaiting review`;
  };

  const renderItem = (item: WorkspaceNavItem) => (
    <div key={item.id}>
      <SidebarNavButton
        icon={item.icon}
        active={item.active}
        badge={item.badge?.count}
        badgeTitle={badgeTitleFor(item)}
        onSelect={() => setPage(item.page)}
        label={copy.t(item.label)}
        description={
          PAGE_META[item.page].description
            ? copy.t(PAGE_META[item.page].description as string)
            : undefined
        }
      />
      {/* Sub-links — nested nav under the active section. Sub-destinations are
          real Next routes, so navigate via router. Hrefs are built from the
          workspace base path (never the tenant slug — see the
          admin-href-invariant guard). */}
      {item.active && item.subItems.length > 0 && (
        <div className="mb-[3px] mt-[2px] flex flex-col gap-px pl-[24px]">
          {item.subItems.map((sub) => (
            <button
              key={sub.id}
              type="button"
              onClick={() =>
                sub.external
                  ? window.open(sub.href, "_blank", "noopener,noreferrer")
                  : router.push(sub.href)
              }
              aria-current={sub.active ? "page" : undefined}
              className={`flex cursor-pointer items-center gap-[8px] border-y-0 border-r-0 border-l-2 border-solid bg-transparent px-[10px] py-[4px] text-left font-admin-body text-[12px] hover:text-admin-ink [transition:color_var(--transition-admin-micro),border-color_var(--transition-admin-micro)] ${
                sub.active
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
                <span className="inline-flex items-center rounded-full bg-admin-surface-alt px-[6px] py-px text-admin-10 font-bold leading-[1.4] text-admin-ink-muted">
                  {sub.count > 99 ? "99+" : sub.count}
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );

  if (posChrome) {
    // NO TOP BAR EITHER. The POS boards (`POSCounter`, `M33_ModeSwitch`) draw
    // the till full-bleed: its own 96px rail, its own 64px header, nothing of
    // the workspace above it. The two things the workspace bar offered inside
    // the till are both on the POS rail already: the `MODE` chip opens the
    // mode menu (`PosRailModeMenuProvider`, the same model as the bar's own
    // switch) and the `Workspace` door at the foot of the rail leaves.
    return (
      <div
        data-tulala-workspace-grid
        data-tulala-pos-chrome
        className="grid grid-cols-[1fr] bg-admin-surface min-h-[calc(100vh-var(--proto-cbar,50px))]"
      >
        <main
          id="tulala-workspace-content"
          tabIndex={-1}
          data-tulala-surface-main
          className="w-full outline-none"
        >
          <PosRailModeMenuProvider>
            <PageRouter page={state.page} />
          </PosRailModeMenuProvider>
        </main>
      </div>
    );
  }

  const planLabel = PLAN_META[state.plan]?.label ?? state.plan;

  return (
    <div
      data-tulala-workspace-grid
      className="grid grid-cols-[240px_1fr] bg-admin-surface-alt min-h-[calc(100vh-var(--proto-cbar,50px))]"
    >
      {/* Full viewport-column height (not max-height) so the tinted rail
          never ends mid-page — it reads as chrome, not a floating card. */}
      <aside
        data-tulala-app-sidebar
        className="sticky top-[var(--proto-cbar,50px)] flex h-[calc(100vh-var(--proto-cbar,50px))] flex-col self-start overflow-hidden border-r border-admin-border-soft bg-admin-surface-alt font-admin-body"
      >
        {/* WS-12.10 — secondary skip link lets keyboard users bypass the
            sidebar nav and jump straight to the page content area. */}
        <a href="#tulala-workspace-content" className="skip-to-main">
          {copy.t("Skip to page content")}
        </a>

        {/* The brand, at the head of the rail (Main board). Whitelabel tiers
            with an uploaded logo show their own mark here instead; the
            wordmark + tagline lockup is the default for everyone else. */}
        <div className="flex h-[56px] shrink-0 flex-col justify-center gap-[3px] border-b border-admin-border-soft bg-admin-surface px-[14px]">
          <WorkspaceBrandMark />
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-[10px] px-[10px] pb-[10px] pt-[12px]">
          {/* Tenant switcher (#3) — compact context chip at the top of the
              sidebar. Clicking opens the tenant-switcher drawer. On multi-
              workspace accounts this lists all workspaces; single-workspace
              shows workspace info. */}
          <button
            type="button"
            onClick={() => openDrawer("tenant-switcher")}
            className="flex w-full cursor-pointer items-center gap-[9px] rounded-[9px] border border-admin-border-soft bg-admin-card px-[10px] py-[8px] text-left font-admin-body shadow-admin-rest hover:border-admin-border-strong [transition:border-color_var(--transition-admin-micro),box-shadow_var(--transition-admin-micro)]"
          >
            <span
              aria-hidden
              className="inline-flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-full bg-admin-brand text-[11px] font-bold text-white"
            >
              {effectiveTenant.name.slice(0, 2).toUpperCase()}
            </span>
            <div className="flex-1 min-w-0">
              <div className="overflow-hidden text-ellipsis whitespace-nowrap text-admin-12h font-semibold leading-[1.2] text-admin-ink">
                {effectiveTenant.name}
              </div>
              <div className="text-admin-11 leading-[1.2] text-admin-ink-muted">
                {copy.isSpanish ? `Plan ${copy.t(planLabel)}` : `${planLabel} plan`}
              </div>
            </div>
            <Icon name="chevron-down" size={13} color={COLORS.inkDim} />
          </button>

          {/* Page nav — the one thing the sidebar owns. Grouped as the
              registry groups it. */}
          <nav
            ref={sidebarNavRef}
            aria-label="Workspace sections"
            className="flex min-h-0 flex-1 flex-col gap-px overflow-y-auto"
          >
            {groups.map((group) => (
              <div key={group.id} className="flex flex-col gap-px">
                {group.label && (
                  <div
                    aria-hidden
                    className="px-[10px] pb-[3px] pt-[7px] text-admin-9h font-bold uppercase leading-[1.2] tracking-[0.14em] text-admin-ink-dim"
                  >
                    {copy.t(group.label)}
                  </div>
                )}
                {group.items.map(renderItem)}
              </div>
            ))}
          </nav>

          {/* Settings — pinned to the rail's foot. No create CTA here: the
              top bar's Create menu, the ⌘K palette and the C shortcut are the
              doors into creating things. */}
          <div className="flex flex-col gap-[6px] border-t border-admin-border pt-[6px]">
            {pinned.map(renderItem)}
            {/* Staff have no Settings row (W38): the foot says where setup
                lives instead of leaving a gap. */}
            {pinned.length === 0 && (
              <div className="px-[10px] py-[6px] text-admin-11h leading-[1.4] text-admin-ink-dim">
                {copy.t("Setup is owner-only · ask the owner")}
              </div>
            )}
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-col">
        <TulalaIdentityBar />
        <main
          id="tulala-workspace-content"
          tabIndex={-1}
          data-tulala-surface-main
          className="mx-auto w-full max-w-[1200px] px-[28px] pb-[60px] pt-[24px] outline-none"
        >
          <PageRouter page={state.page} />
        </main>
      </div>
    </div>
  );
}

/**
 * The mark at the head of the rail. A whitelabel tier with an uploaded logo
 * shows that logo; everyone else shows the Tulala lockup: wordmark at 20px
 * and the tagline beneath it, as the Main board draws it.
 */
function WorkspaceBrandMark() {
  const { bridgeTenantIdentity } = useAdminShell();
  const copy = useDashboardText();
  const agencyLogoUrl = bridgeTenantIdentity?.logoUrl ?? null;
  if (agencyLogoUrl) {
    return (
      <img
        src={agencyLogoUrl}
        alt={bridgeTenantIdentity?.displayName || "Workspace logo"}
        data-tulala-brand
        className="block h-[30px] w-auto max-w-[200px] object-contain object-left"
      />
    );
  }
  // The lockup's own tagline is 9px at 0.2em tracking, which does not fit a
  // 240px rail; the board sets it at 8px, 0.08em, so the tagline is drawn
  // here at that size under the same wordmark.
  return (
    <span aria-hidden className="inline-flex flex-col items-start gap-[3px] leading-none text-admin-ink">
      <TulalaWordmark height={20} />
      <span className="overflow-hidden text-ellipsis whitespace-nowrap text-[8px] font-semibold uppercase tracking-[0.08em] text-admin-ink-dim">
        {copy.t("Sell what you do, not what you ship")}
      </span>
    </span>
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
  // A bridge slice this page reads is still on its way (the layout loads only
  // the URL's page before the first byte; the rest arrive in one server
  // action after hydration). The skeleton is the honest state: never an empty
  // list that reads as "you have no messages" for the second it takes.
  const { pageSlicesReady } = useAdminShell();
  let body: React.ReactNode = null;
  if (canonicalChildren != null) {
    body = canonicalChildren;
  } else if (!pageSlicesReady(page)) {
    body = <PageSkeleton />;
  } else
  switch (page) {
    case "overview":
      // The board reads its snapshot from the store /admin/page.tsx fills;
      // on any other path with this page clamped in, it says it is loading.
      body = <OverviewBoard />;
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
    case "menu":
    case "catalog":   // registry id; renders at /admin/menu until the route moves
      body = <CatalogPage />;
      break;
    // Appointments & Classes — the registry's `appts` destination, still
    // rendering at /admin/sessions until the route moves. Four views under one
    // route (boards W39, W40): the appointments, the dated sessions with the
    // materialiser's refusals, the series, and the waitlist. `?view=` selects
    // one; see AppointmentsPage.
    case "sessions":
    case "appts":     // registry id; renders at /admin/sessions until the route moves
      body = <AppointmentsPage />;
      break;
    // Events & Ticketing — the Events tab (list + 7 per-event tabs). SPA
    // page-module in the menu shape; placeholder until the Events & Ticketing
    // Manager fills it from lib/events/* (see the slot contract). Reachable by
    // URL now; the rail entry + events-on visibility gate are a follow-up.
    case "events":
      body = <EventsPage />;
      break;
    // WS-3.3 — "work" pipeline is a view-filter inside Messages; the legacy
    // /admin/work route syncs to messages. The old WorkPage stub was deleted
    // in WP1, so the alias renders Messages directly.
    case "work":
    case "projects":  // not built; the registry lands its URL on Messages
      body = <WorkspaceMessagesPage />;
      break;
    // WS-3.1 — canonical "roster" route (was "talent")
    case "roster":
    case "talent":     // legacy alias
    case "people":     // registry id; renders at /admin/roster until the route moves
      body = <TalentPage />;
      break;
    case "clients":
      body = <ClientsPage />;
      break;
    case "pitches":
      body = <PitchesPage />;
      break;
    case "reviews":
      body = <ReviewsPage />;
      break;
    case "analytics":
      body = <AnalyticsPage />;
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
