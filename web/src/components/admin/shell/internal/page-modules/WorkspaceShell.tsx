"use client";

import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import { WorkspaceMediaPage } from "../media-page";
import { useWorkspaceNav } from "./workspace-nav";
import type { WorkspaceNavItem } from "./workspace-nav-groups";
import { useDashboardText } from "../dashboard-i18n";
import { Avatar, Icon, useRovingTabindex } from "../primitives";
import type { AdminShellIconName } from "../primitives";
import { COLORS, FAB_PALETTE_CHANGED_EVENT, FAB_PALETTE_OPEN_EVENT, PAGE_META, PLAN_META, useAdminShell } from "../state";
import type { FabPaletteChangedDetail, WorkspacePage } from "../state";
import { ShortcutHelpOverlay, useKeyboardLayer } from "../workspace";
import { useCanonicalRouteChildren } from "../canonical-route-children";
import { CalendarPage } from "./CalendarPage";
import { MenuPage } from "./MenuPage";
import { ClientsPage } from "./ClientsPage";
import { TulalaIdentityBar } from "./IdentityBar-1";
import { WorkspaceMessagesPage } from "./InboxPage";
import { OverviewPage } from "./OverviewPage";
import { PayoutsPage } from "./PayoutsPage";
import { PitchesPage } from "./PitchesPage-1";
import { SessionsPage } from "./SessionsPage";
import { EventsPage } from "./EventsPage";
import { ReviewsPage } from "./ReviewsPage";
import { AnalyticsPage } from "./AnalyticsPage";
import { TalentPage } from "./TalentPage-1";
import { WebsitePage } from "./WebsitePage-1";
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
 * Sidebar nav IA — a light grouped rail, built entirely from the destination
 * registry (`lib/workspace/destinations.ts`) via `useWorkspaceNav()`.
 *
 * WHAT WENT. SIDEBAR_GROUP_TEMPLATE, buildSidebarGroups, SIDEBAR_ICON,
 * subItemsFor and the pageLabel helper: five structures that had to agree by
 * hand with the fixtures' page list, the admin route resolver and the canonical
 * matchers, and did not. Groups, order, labels (including the per-preset ones),
 * icons, sub-views and plan/role gating are now one projection.
 *
 * WHAT STAYED. The tenant chip, the pinned Settings row, the skip link, the
 * roving-focus nav and the `data-tulala-app-sidebar` test hook are untouched.
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
  badgeTone = "amber",
  badgeTitle,
  onSelect,
  label,
  description,
}: {
  /** From the registry. There is no second icon table any more. */
  icon: AdminShellIconName;
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
      <Icon name={icon} size={15} stroke={1.6} color="currentColor" />
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
 * SidebarShell — the workspace's one chrome: a LIGHT tinted rail on the left
 * with grouped, icon-complete nav (white active pill), live badges, sub-links
 * under the active section, and Settings pinned at the bottom.
 *
 * Every list this used to own now comes from `useWorkspaceNav()`. What is left
 * here is presentation: the tenant chip, the skip link, roving focus, and how a
 * row and its children draw.
 */
function WorkspaceSidebarShell() {
  const { state, setPage, openDrawer, effectiveTenant } = useAdminShell();
  const copy = useDashboardText();
  const router = useRouter();

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
        badgeTone={item.badge?.tone}
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
        <div className="mb-[3px] mt-[2px] flex flex-col gap-px pl-[25px]">
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
              className={`flex cursor-pointer items-center gap-[8px] border-y-0 border-r-0 border-l-2 border-solid bg-transparent px-[10px] py-[5px] text-left font-admin-body text-[12.5px] hover:text-admin-ink [transition:color_var(--transition-admin-micro),border-color_var(--transition-admin-micro)] ${
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
                <span className="inline-flex h-[15px] min-w-[16px] items-center justify-center rounded-full bg-admin-amber-soft px-[4px] text-[9.5px] font-bold leading-none text-admin-amber-deep">
                  {sub.count > 99 ? "99+" : sub.count}
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );

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
          {groups.map((group) => (
            <div key={group.id} className="flex flex-col gap-[2px]">
              {group.label && (
                <div
                  aria-hidden
                  className="px-[10px] pb-[4px] pt-[10px] text-[10px] font-bold uppercase tracking-[0.14em] text-admin-ink-dim"
                >
                  {copy.t(group.label)}
                </div>
              )}
              {group.items.map(renderItem)}
            </div>
          ))}
        </nav>

        <div className="flex-1" />

        {/* Settings — pinned to the rail's bottom, Shopify-style. No create
            CTA here: "New inquiry" already lives in the Overview header, the
            + FAB, the ⌘K palette, and the C shortcut — a fifth entry point
            would be duplication, not convenience. */}
        <div className="flex flex-col gap-[6px] border-t border-admin-border pt-[6px]">
          {pinned.map(renderItem)}
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
    case "menu":
    case "catalog":   // registry id; renders at /admin/menu until the route moves
      body = <MenuPage />;
      break;
    // Sessions — the Schedule tab (series + occurrences + series editor).
    // SPA page-module in the menu shape; placeholder until the Sessions &
    // Classes Manager fills it from lib/sessions/* (see the slot contract).
    case "sessions":
    case "appts":     // registry id; renders at /admin/sessions until the route moves
      body = <SessionsPage />;
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
