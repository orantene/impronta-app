"use client";

import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { WorkspaceMediaPage } from "../media-page";
import { Avatar, Icon, PrimaryButton, useRovingTabindex } from "../primitives";
import { COLORS, ENTITY_TYPE_META, FAB_PALETTE_CHANGED_EVENT, FAB_PALETTE_OPEN_EVENT, FONTS, PAGE_META, TRANSITION, WORKSPACE_PAGES, meetsRole, useAdminShell } from "../state";
import type { FabPaletteChangedDetail, WorkspacePage } from "../state";
import { ShortcutHelpOverlay, useKeyboardLayer } from "../workspace";
import { CalendarPage } from "./CalendarPage";
import { ClientsPage } from "./ClientsPage";
import { PAGE_ICON } from "./ControlBar";
import { TulalaIdentityBar } from "./IdentityBar-1";
import { UnifiedInboxPage, WorkspaceMessagesPage } from "./InboxPage";
import { OperationsPage, ProductionPage } from "./OperationsPage";
import { OverviewPage } from "./OverviewPage";
import { PitchesPage } from "./PitchesPage-1";
import { SitePage } from "./SitePage";
import { TalentPage } from "./TalentPage-1";
import { WebsitePage } from "./WebsitePage-1";
import { WorkPage } from "./WorkPage";
import { WorkspacePageView } from "./WorkspacePageView";
import { WorkspaceTopbar } from "./WorkspaceTopbar";
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
      {state.workspaceLayout === "sidebar" ? (
        <WorkspaceSidebarShell />
      ) : (
        <div style={{ minHeight: "calc(100vh - 56px - 56px - 50px)" }} className="bg-admin-surface">
          <WorkspaceTopbar onOpenSearch={openPalette} />
          <main
            data-tulala-surface-main
            style={{
              padding: "28px 28px 60px",
              maxWidth: 1320,
              margin: "0 auto",
            }}
          >
            <PageRouter page={state.page} />
          </main>
        </div>
      )}
      {/* WS-7.5 Shortcut help overlay */}
      <ShortcutHelpOverlay open={helpOpen} onClose={() => setHelpOpen(false)} />
    </HybridShell>
  );
}

/**
 * X2: SidebarShell — workspace-style vertical rail layout. Used by
 * hybrid talent owners who prefer a workspace-y mental model. Carries
 * the same content as the topbar shell (PageRouter), just with a
 * fixed-width sidebar on the left and the main column flexing.
 */
function WorkspaceSidebarShell() {
  const { state, setPage, openDrawer, setWorkspaceLayout, effectiveTenant } = useAdminShell();
  const { role } = state;
  const canCreate = meetsRole(role, "editor");
  // WS-12.6 — roving tabindex on sidebar nav: arrow keys move between pages
  const sidebarNavRef = useRef<HTMLElement | null>(null);
  useRovingTabindex(sidebarNavRef, "button");
  return (
    <div
      data-tulala-workspace-grid
      style={{
        display: "grid",
        gridTemplateColumns: "232px 1fr",
        background: COLORS.surface,
        minHeight: "calc(100vh - 56px - 56px - 50px)",
      }}
    >
      <aside
        data-tulala-app-sidebar
        style={{
          background: "#fff",
          borderRight: `1px solid ${COLORS.borderSoft}`,
          padding: "20px 14px",
          position: "sticky",
          top: "calc(var(--proto-cbar, 50px) + 56px)",
          alignSelf: "flex-start",
          maxHeight: "calc(100vh - var(--proto-cbar, 50px) - 56px)",
          overflowY: "auto",
          display: "flex",
          flexDirection: "column",
          gap: 16,
          fontFamily: FONTS.body,
        }}
      >
        {/* WS-12.10 — secondary skip link lets keyboard users bypass the
            sidebar nav and jump straight to the page content area. */}
        <a href="#tulala-workspace-content" className="skip-to-main">
          Skip to page content
        </a>
        {/* Tenant switcher (#3) — compact context chip at the top of the
            sidebar. Clicking opens the tenant-switcher drawer. On multi-
            workspace accounts this lists all workspaces; single-workspace
            shows workspace info. */}
        <button
          type="button"
          onClick={() => openDrawer("tenant-switcher")}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 9,
            padding: "8px 10px",
            background: COLORS.surfaceAlt,
            border: "none",
            borderRadius: 9,
            cursor: "pointer",
            width: "100%",
            textAlign: "left",
            fontFamily: FONTS.body,
            transition: `background ${TRANSITION.micro}`,
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = COLORS.accentSoft)}
          onMouseLeave={(e) => (e.currentTarget.style.background = COLORS.surfaceAlt)}
        >
          <Avatar initials={effectiveTenant.name.slice(0, 2).toUpperCase()} size={26} tone="ink" />
          <div className="flex-1 min-w-0">
            <div style={{ fontSize: 12.5, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} className="text-admin-ink">
              {effectiveTenant.name}
            </div>
            <div style={{ fontSize: 10.5, textTransform: "capitalize" }} className="text-admin-ink-muted">
              {state.plan} · {state.entityType}
            </div>
          </div>
          <Icon name="chevron-down" size={10} color={COLORS.inkDim} />
        </button>

        {/* Page nav — the one thing the sidebar owns. Tenant identity,
            mode toggle, bell/help all live in the persistent identity
            bar above. Clean. */}
        <nav ref={sidebarNavRef} aria-label="Workspace sections" style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          {WORKSPACE_PAGES.map((p) => {
            const active = state.page === p;
            const iconName = PAGE_ICON[p];
            return (
              <button
                key={p}
                type="button"
                onClick={() => setPage(p)}
                title={PAGE_META[p].description}
                aria-label={PAGE_META[p].description ? `${PAGE_META[p].label} — ${PAGE_META[p].description}` : PAGE_META[p].label}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "9px 12px",
                  background: active ? "rgba(11,11,13,0.06)" : "transparent",
                  border: "none",
                  borderRadius: 7,
                  cursor: "pointer",
                  fontFamily: FONTS.body,
                  fontSize: 13,
                  fontWeight: active ? 600 : 500,
                  color: active ? COLORS.ink : COLORS.inkMuted,
                  textAlign: "left",
                  letterSpacing: 0.05,
                  transition: `background ${TRANSITION.micro}, color ${TRANSITION.micro}`,
                }}
                onMouseEnter={(e) => {
                  if (!active) {
                    e.currentTarget.style.background = "rgba(11,11,13,0.025)";
                    e.currentTarget.style.color = COLORS.ink;
                  }
                }}
                onMouseLeave={(e) => {
                  if (!active) {
                    e.currentTarget.style.background = "transparent";
                    e.currentTarget.style.color = COLORS.inkMuted;
                  }
                }}
              >
                {iconName && <Icon name={iconName} size={14} stroke={1.6} color={active ? COLORS.ink : COLORS.inkMuted} />}
                {p === "roster" ? ENTITY_TYPE_META[state.entityType].rosterLabel : PAGE_META[p].label}
              </button>
            );
          })}
        </nav>

        <div style={{ flex: 1 }} />

        {canCreate && (
          <PrimaryButton onClick={() => openDrawer("new-inquiry")}>+ New inquiry</PrimaryButton>
        )}

        {/* Switch back to topbar layout */}
        <button
          type="button"
          onClick={() => setWorkspaceLayout("topbar")}
          style={{
            display: "flex", alignItems: "center", gap: 6, padding: "7px 10px", background: "transparent", border: `1px solid ${COLORS.borderSoft}`, borderRadius: 7, cursor: "pointer", fontFamily: FONTS.body, fontSize: 11.5, transition: `border-color ${TRANSITION.micro}, color ${TRANSITION.micro}`, }}
          onMouseEnter={(e) => { e.currentTarget.style.borderColor = COLORS.border; e.currentTarget.style.color = COLORS.ink; }}
          onMouseLeave={(e) => { e.currentTarget.style.borderColor = COLORS.borderSoft; e.currentTarget.style.color = COLORS.inkMuted; }} className="text-admin-ink-muted">
          <Icon name="arrow-right" size={11} stroke={1.8} />
          Topbar layout
        </button>
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
  let body: React.ReactNode = null;
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
    // WS-3.5 — canonical "settings" route (was "workspace"); billing
    // is folded in as an anchor section inside the settings page.
    case "settings":
    case "workspace":  // legacy alias
    case "billing":    // legacy alias — folded into settings
      body = <WorkspacePageView />;
      break;
  }
  return (
    <div key={page} data-tulala-workspace-page-anim style={{ animation: "tulala-page-fade .22s cubic-bezier(.4,0,.2,1)" }}>
      {body}
    </div>
  );
}
