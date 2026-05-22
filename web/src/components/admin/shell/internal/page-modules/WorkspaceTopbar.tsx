"use client";

import { useEffect, useRef, useState } from "react";
import { HybridModeSwitcher } from "@/components/hybrid-identity/HybridModeSwitcher";
import { loadHybridSwitcherProps } from "@/lib/server-actions/hybrid-identity-self";
import type { HybridSwitcherProps } from "@/lib/server-actions/hybrid-identity-self";
import { useDashboardText } from "../dashboard-i18n";
import { FloatingFab, Icon, Popover, useRovingTabindex } from "../primitives";
import { COLORS, type DrawerId, ENTITY_TYPE_META, FONTS, NOTIFICATIONS, PAGE_META, PENDING_TALENT, TALENT_NOTIFICATION_COUNT, TRANSITION, WORKSPACE_NOTIFICATION_COUNT, WORKSPACE_PAGES, Z, meetsRole, useAdminShell } from "../state";
import { ControlBar } from "./ControlBar";


// ════════════════════════════════════════════════════════════════════
// Workspace topbar (product chrome)
// ════════════════════════════════════════════════════════════════════

export function WorkspaceTopbar({ onOpenSearch }: { onOpenSearch?: () => void }) {
  const { state, setPage, setWorkspaceLayout, pendingTalent, verificationRequests, overviewMetrics } = useAdminShell();
  const copy = useDashboardText();
  // Item #8 wiring: load hybrid identity for the signed-in user so
  // the HybridModeSwitcher knows whether to render + where to route.
  // Renders nothing on non-hybrids automatically. Lazy-loaded after
  // mount to avoid blocking the topbar render.
  const [hybridProps, setHybridProps] = useState<HybridSwitcherProps>({
    canTalent: false, canWorkspace: false, current: "workspace",
    talentHref: "#", workspaceHref: "#",
  });
  useEffect(() => {
    let cancelled = false;
    loadHybridSwitcherProps().then((p) => {
      if (!cancelled) setHybridProps(p);
    });
    return () => { cancelled = true; };
  }, []);
  const pendingVerifications = verificationRequests.filter(r =>
    r.status === "submitted" || r.status === "in_review" || r.status === "pending_user_action"
  ).length;
  // When bridge data is available use its authoritative pending count so the nav
  // badge doesn't echo the mock PENDING_TALENT array (which has 3 fake items).
  const effectivePendingTalentCount = overviewMetrics !== null
    ? (overviewMetrics.pendingApprovals ?? 0)
    : pendingTalent.length;
  // WS-3.2 — "workspace" is now "settings"; check both for backward compat
  const isSettingsActive = state.page === "settings" || state.page === "workspace";
  const canCreate = meetsRole(state.role, "editor");
  // WS-12.6 — roving tabindex on workspace topbar page nav
  const topbarNavRef = useRef<HTMLElement | null>(null);
  useRovingTabindex(topbarNavRef, "button", { orientation: "horizontal" });

  return (
    <header
      data-tulala-app-topbar
      style={{
        background: "#fff",
        borderBottom: `1px solid ${COLORS.borderSoft}`,
        padding: "0 28px",
        position: "sticky",
        top: "calc(var(--proto-cbar, 50px) + 56px)",
        zIndex: Z.topbar,
      }}
    >
      <style>{`
        /* Mobile compaction (premium): drop Search pill + theme + sidebar
           toggle from the workspace topbar — they're keyboard-driven on
           desktop and rarely tapped on mobile. Quick-create stays so the
           "+ New" affordance is one tap away. */
        @media (max-width: 720px) {
          [data-tulala-app-topbar] { padding: 0 14px !important; }
          [data-tulala-app-topbar-row] { gap: 8px !important; height: 46px !important; }
          [data-tulala-topbar-search] { display: none !important; }
          [data-tulala-app-topbar-right] [data-tulala-topbar-settings],
          [data-tulala-app-topbar-right] [data-tulala-topbar-sidebar] {
            display: none !important;
          }
        }
      `}</style>
      <div
        data-tulala-app-topbar-row
        style={{
          display: "flex",
          alignItems: "center",
          gap: 16,
          height: 52,
        }}
      >
        {/* Page nav — the only thing the workspace topbar owns now.
            Tenant identity, mode toggle, bell/help/settings, role chip,
            avatar all moved to the persistent identity bar above. */}
        <nav ref={topbarNavRef} data-tulala-app-topbar-nav aria-label={copy.t("Workspace sections")} style={{ display: "flex", alignItems: "center", gap: 2, flex: 1, overflow: "auto" }}>
          {WORKSPACE_PAGES.map((p) => {
            const active = state.page === p;
            const pageLabel = p === "roster"
              ? copy.t(ENTITY_TYPE_META[state.entityType].rosterLabel)
              : copy.t(PAGE_META[p].label);
            const pageDescription = PAGE_META[p].description
              ? copy.t(PAGE_META[p].description)
              : undefined;
            // 2026 redesign — surface pending-approval count on the Roster tab
            // so the signal is visible from anywhere in the workspace, not
            // just from the Roster page itself. Roster tab now splits the
            // signal: pending self-registrations (amber) and pending IG/
            // Tulala verifications (indigo) render as separate sub-dots so
            // admins can tell at a glance which queue needs attention.
            const showRosterBadges = p === "roster" && (effectivePendingTalentCount + pendingVerifications) > 0;
            const pageBadge = p === "roster" ? (effectivePendingTalentCount + pendingVerifications) : 0;
            return (
              <button
                key={p}
                onClick={() => setPage(p)}
                title={pageDescription}
                aria-label={pageDescription ? `${pageLabel} — ${pageDescription}` : pageLabel}
                style={{
                  background: "transparent",
                  border: "none",
                  cursor: "pointer",
                  padding: "8px 12px",
                  fontFamily: FONTS.body,
                  fontSize: 13,
                  fontWeight: active ? 600 : 500,
                  color: active ? COLORS.ink : COLORS.inkMuted,
                  letterSpacing: 0.1,
                  borderRadius: 7,
                  position: "relative",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  transition: `color ${TRANSITION.micro}, background ${TRANSITION.micro}`,
                }}
                onMouseEnter={(e) => {
                  if (!active) e.currentTarget.style.color = COLORS.ink;
                }}
                onMouseLeave={(e) => {
                  if (!active) e.currentTarget.style.color = COLORS.inkMuted;
                }}
              >
                {/* WS-3.2 — "roster" inherits the entity-type label (Talent/Models/Artists) */}
                {pageLabel}
                {showRosterBadges ? (
                  // Single combined badge — total pending actions. Tooltip
                  // breaks down approvals vs. verifications on hover.
                  <span
                    aria-label={`${effectivePendingTalentCount + pendingVerifications} ${copy.t("items need attention")}`}
                    title={(() => {
                      const parts: string[] = [];
                      if (effectivePendingTalentCount > 0) parts.push(copy.isSpanish
                        ? `${effectivePendingTalentCount} registro${effectivePendingTalentCount === 1 ? "" : "s"} pendiente${effectivePendingTalentCount === 1 ? "" : "s"} de revisión`
                        : `${effectivePendingTalentCount} self-registration${effectivePendingTalentCount === 1 ? "" : "s"} awaiting review`);
                      if (pendingVerifications > 0) parts.push(copy.isSpanish
                        ? `${pendingVerifications} verificación${pendingVerifications === 1 ? "" : "es"} pendiente${pendingVerifications === 1 ? "" : "s"}`
                        : `${pendingVerifications} verification${pendingVerifications === 1 ? "" : "s"} pending`);
                      return parts.join(" · ");
                    })()}
                    style={{
                      display: "inline-flex", alignItems: "center", justifyContent: "center",
                      minWidth: 16, height: 16, padding: "0 5px", borderRadius: 999,
                      background: COLORS.amber, color: "#fff",
                      fontSize: 10, fontWeight: 700, lineHeight: 1,
                    }}
                  >
                    {effectivePendingTalentCount + pendingVerifications}
                  </span>
                ) : pageBadge > 0 && (
                  <span
                    aria-label={`${pageBadge} ${copy.t("pending")}`}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      minWidth: 16,
                      height: 16,
                      padding: "0 5px",
                      borderRadius: 999,
                      background: COLORS.amber,
                      color: "#fff",
                      fontSize: 10,
                      fontWeight: 700,
                      lineHeight: 1,
                    }}
                  >
                    {pageBadge}
                  </span>
                )}
                <span
                  aria-hidden
                  style={{
                    position: "absolute",
                    bottom: -1,
                    left: 8,
                    right: 8,
                    height: 2,
                    background: COLORS.fill,
                    borderRadius: 2,
                    opacity: active ? 1 : 0,
                    transform: active ? "scaleX(1)" : "scaleX(0.4)",
                    transformOrigin: "center",
                    transition: `opacity ${TRANSITION.md}, transform ${TRANSITION.drawer}`,
                    pointerEvents: "none",
                  }}
                />
              </button>
            );
          })}
        </nav>

        {/* Right side — search chip + settings + sidebar layout toggle.
            "+ New" + AI assistant unified into BottomActionFab (bottom-right). */}
        <div data-tulala-app-topbar-right style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {/* Item #8 wiring: Talent ⇄ Workspace switcher for hybrid
              identities. Renders nothing when the user isn't a hybrid
              (canTalent && canWorkspace both required). Data plumbing:
              the topbar's parent should consume resolveActorIdentity
              and pass the props down. Placeholder defaults render
              nothing — wire when hybrid identity data is in scope. */}
          <HybridModeSwitcher {...hybridProps} />
          {/* #2 — Global search chip. Opens the existing CommandPalette
              (⌘K) so power-users can find anything instantly. */}
          {onOpenSearch && (
            <button type="button" onClick={onOpenSearch}
              aria-label={copy.t("Search anything (⌘K)")}
              data-tulala-topbar-search-right
              style={{
                display: "inline-flex", alignItems: "center", gap: 8,
                padding: "6px 10px 6px 8px", borderRadius: 8,
                border: `1px solid ${COLORS.borderSoft}`,
                background: COLORS.surfaceAlt, color: COLORS.inkMuted,
                fontFamily: FONTS.body, fontSize: 12, fontWeight: 500,
                cursor: "pointer", whiteSpace: "nowrap",
                transition: `border-color ${TRANSITION.micro}, color ${TRANSITION.micro}`,
              }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = COLORS.border; e.currentTarget.style.color = COLORS.ink; }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = COLORS.borderSoft; e.currentTarget.style.color = COLORS.inkMuted; }}
            >
              <Icon name="search" size={12} stroke={1.7} />
              <span>{copy.t("Search")}</span>
              <span style={{ marginLeft: 4, padding: "1px 5px", borderRadius: 4, background: "rgba(11,11,13,0.06)", fontSize: 9.5, fontFamily: FONTS.mono }} className="text-admin-ink-muted">⌘K</span>
            </button>
          )}
          <Popover content={copy.t("Workspace settings")}>
            <button
              type="button"
              onClick={() => setPage("workspace")}
              aria-label={copy.t("Workspace settings")}
              data-tulala-topbar-settings
              style={{
                ...iconButtonStyle,
                background: isSettingsActive ? COLORS.fill : "#fff",
                color: isSettingsActive ? "#fff" : COLORS.inkMuted,
                borderColor: isSettingsActive ? COLORS.ink : COLORS.borderSoft,
              }}
              onMouseEnter={(e) => {
                if (!isSettingsActive) { e.currentTarget.style.borderColor = COLORS.border; e.currentTarget.style.color = COLORS.ink; }
              }}
              onMouseLeave={(e) => {
                if (!isSettingsActive) { e.currentTarget.style.borderColor = COLORS.borderSoft; e.currentTarget.style.color = COLORS.inkMuted; }
              }}
            >
              <Icon name="settings" size={13} stroke={1.7} />
            </button>
          </Popover>
          <Popover content={copy.t("Switch to sidebar layout")}>
            <button
              type="button"
              onClick={() => setWorkspaceLayout("sidebar")}
              aria-label={copy.t("Switch to sidebar layout")}
              data-tulala-topbar-sidebar
              style={iconButtonStyle}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = COLORS.border;
                e.currentTarget.style.color = COLORS.ink;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = COLORS.borderSoft;
                e.currentTarget.style.color = COLORS.inkMuted;
              }}
            >
              <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <path d="M9 3v18" />
              </svg>
            </button>
          </Popover>
        </div>
      </div>
    </header>
  );
}

// Shared compact <select> style for list-page sort/filter controls.
export const selectStyle: React.CSSProperties = {
  padding: "7px 10px",
  fontFamily: FONTS.body,
  fontSize: 12.5,
  color: COLORS.ink,
  background: "#fff",
  border: `1px solid ${COLORS.border}`,
  borderRadius: 7,
  cursor: "pointer",
};

// Shared icon-button shape for the workspace topbar right cluster.
const iconButtonStyle: React.CSSProperties = {
  width: 34,
  height: 34,
  borderRadius: 8,
  border: `1px solid ${COLORS.borderSoft}`,
  background: "#fff",
  color: COLORS.inkMuted,
  cursor: "pointer",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
};

function BellIcon() {
  return (
    <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 8a6 6 0 1 1 12 0c0 7 3 8 3 8H3s3-1 3-8" />
      <path d="M10 21a2 2 0 0 0 4 0" />
    </svg>
  );
}

/**
 * Canonical "what can I create now?" list. Used by both the desktop
 * QuickCreateMenu and the mobile FloatingFab popup so the choices stay
 * in sync. Each item is gated by role + plan.
 */
type QuickCreateItem = {
  id: string;
  label: string;
  sub: string;
  emoji: string;
  drawer: string;
  drawerPayload?: Record<string, unknown>;
  shortcut: string;
  canDo: boolean;
};
function useQuickCreateItems(): QuickCreateItem[] {
  const { state } = useAdminShell();
  return [
    {
      id: "new-inquiry", label: "New inquiry", emoji: "📨",
      sub: "Capture a lead from a client",
      drawer: "new-inquiry", shortcut: "G I",
      canDo: meetsRole(state.role, "manager") || state.plan === "free",
    },
    {
      id: "new-booking", label: "New booking", emoji: "📅",
      sub: "Confirmed job — skip the inquiry",
      drawer: "new-booking", shortcut: "G B",
      canDo: meetsRole(state.role, "manager"),
    },
    {
      id: "new-talent", label: "Add talent", emoji: "👤",
      sub: "Create a roster profile",
      drawer: "new-talent", shortcut: "G T",
      canDo: meetsRole(state.role, "editor"),
    },
    {
      id: "new-client", label: "Add client", emoji: "🏷",
      sub: "Track a relationship",
      drawer: "client-profile", drawerPayload: { id: "new" }, shortcut: "G C",
      canDo: meetsRole(state.role, "manager") && state.plan !== "free",
    },
    {
      id: "invite-team", label: "Invite teammate", emoji: "👥",
      sub: "Add a manager or editor",
      drawer: "team", shortcut: "G U",
      canDo: meetsRole(state.role, "admin"),
    },
    {
      id: "snippets", label: "New snippet", emoji: "💬",
      sub: "Reusable reply for the message composer",
      drawer: "inbox-snippets", shortcut: "G S",
      canDo: meetsRole(state.role, "manager"),
    },
    {
      id: "share-card", label: "Share talent", emoji: "🔗",
      sub: "Send a client-facing standalone link",
      drawer: "talent-share-card", shortcut: "G H",
      canDo: meetsRole(state.role, "manager"),
    },
  ];
}

/**
 * Hook for the mobile FAB. Returns the canonical create-actions filtered
 * to what this user can do. Use as: `actions={useQuickCreateActionsFiltered()}`.
 */
export function useQuickCreateActionsFiltered(): import("../primitives").FabAction[] {
  const { openDrawer } = useAdminShell();
  const copy = useDashboardText();
  return useQuickCreateItems()
    .filter(it => it.canDo)
    .map(it => ({
      id: it.id,
      label: copy.t(it.label),
      sub: copy.t(it.sub),
      emoji: it.emoji,
      onClick: () => openDrawer(it.drawer as Parameters<typeof openDrawer>[0], it.drawerPayload),
    }));
}

function QuickCreateMenu() {
  const { openDrawer, state } = useAdminShell();
  const copy = useDashboardText();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("mousedown", onClick);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onClick);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const items: { id: string; label: string; sub: string; drawer: DrawerId | null; shortcut: string; canDo: boolean }[] = [
    {
      id: "new-inquiry",
      label: "New inquiry",
      sub: "Capture a lead from a client",
      drawer: "new-inquiry",
      shortcut: "G I",
      canDo: meetsRole(state.role, "manager") || state.plan === "free",
    },
    {
      id: "new-booking",
      label: "New booking",
      sub: "Confirmed job — skip the inquiry",
      drawer: "new-booking",
      shortcut: "G B",
      canDo: meetsRole(state.role, "manager"),
    },
    {
      id: "new-talent",
      label: "Add talent",
      sub: "Create a roster profile",
      drawer: "new-talent",
      shortcut: "G T",
      canDo: meetsRole(state.role, "editor"),
    },
    {
      id: "new-client",
      label: "Add client",
      sub: "Track a relationship",
      drawer: "client-profile",
      shortcut: "G C",
      canDo: meetsRole(state.role, "manager") && state.plan !== "free",
    },
    {
      id: "invite-team",
      label: "Invite teammate",
      sub: "Add a manager or editor",
      drawer: "team",
      shortcut: "G U",
      canDo: meetsRole(state.role, "admin"),
    },
    {
      id: "snippets",
      label: "New snippet",
      sub: "Reusable reply for the message composer",
      drawer: "inbox-snippets",
      shortcut: "G S",
      canDo: meetsRole(state.role, "manager"),
    },
    {
      id: "share-card",
      label: "Share talent",
      sub: "Send a client-facing standalone link",
      drawer: "talent-share-card",
      shortcut: "G H",
      canDo: meetsRole(state.role, "manager"),
    },
  ];

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          padding: "7px 12px 7px 10px",
          background: COLORS.fill,
          color: "#fff",
          border: "none",
          borderRadius: 8,
          fontFamily: FONTS.body,
          fontSize: 12.5,
          fontWeight: 500,
          cursor: "pointer",
          letterSpacing: 0.1,
        }}
      >
        <Icon name="plus" size={13} stroke={2.2} />
        {copy.t("New")}
        <Icon name="chevron-down" size={11} stroke={2} />
      </button>
      {open && (
        <div
          role="menu"
          aria-label={copy.t("Quick create")}
          style={{
            position: "absolute",
            top: "calc(100% + 6px)",
            right: 0,
            background: COLORS.fillDeep,
            color: "#fff",
            borderRadius: 12,
            padding: 6,
            boxShadow: "0 20px 50px -10px rgba(11,11,13,0.55)",
            minWidth: 280,
            zIndex: 90,
            border: "1px solid rgba(255,255,255,0.08)",
          }}
        >
          <div
            style={{
              padding: "8px 10px 6px",
              fontSize: 10,
              fontWeight: 600,
              letterSpacing: 1.4,
              textTransform: "uppercase",
              color: "rgba(255,255,255,0.45)",
            }}
          >
            {copy.t("Quick create")}
          </div>
          {items.map((it) => (
            <button
              key={it.id}
              role="menuitem"
              disabled={!it.canDo}
              onClick={() => {
                if (it.drawer) {
                  openDrawer(it.drawer, it.id === "new-client" ? { id: "new" } : undefined);
                }
                setOpen(false);
              }}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "8px 10px",
                background: "transparent",
                border: "none",
                color: "#fff",
                width: "100%",
                textAlign: "left",
                fontFamily: FONTS.body,
                cursor: it.canDo ? "pointer" : "not-allowed",
                opacity: it.canDo ? 1 : 0.4,
                borderRadius: 8,
                transition: `background ${TRANSITION.micro}`,
              }}
              onMouseEnter={(e) => {
                if (it.canDo) e.currentTarget.style.background = "rgba(255,255,255,0.06)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "transparent";
              }}
            >
              <span
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 7,
                  background: "rgba(255,255,255,0.06)",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                <Icon name={it.id === "new-booking" ? "calendar" : it.id === "new-talent" ? "user" : it.id === "new-client" ? "team" : "plus"} size={13} stroke={1.7} />
              </span>
              <span className="flex-1 min-w-0">
                <span style={{ display: "block", fontSize: 13, fontWeight: 500 }}>
                  {copy.t(it.label)}
                </span>
                <span style={{ display: "block", fontSize: 11, color: "rgba(255,255,255,0.55)" }}>
                  {copy.t(it.sub)}
                </span>
              </span>
              <span
                style={{
                  display: "inline-flex",
                  gap: 3,
                  flexShrink: 0,
                }}
              >
                {it.shortcut.split(" ").map((k) => (
                  <span
                    key={k}
                    style={{
                      fontSize: 10,
                      fontFamily: FONTS.mono,
                      color: "rgba(255,255,255,0.65)",
                      background: "rgba(255,255,255,0.08)",
                      padding: "2px 5px",
                      borderRadius: 4,
                      minWidth: 16,
                      textAlign: "center",
                    }}
                  >
                    {k}
                  </span>
                ))}
              </span>
            </button>
          ))}
          <div
            style={{
              borderTop: "1px solid rgba(255,255,255,0.06)",
              margin: "4px 0 0",
              padding: "8px 10px 4px",
            }}
          >
            <span style={{ fontSize: 10.5, color: "rgba(255,255,255,0.45)" }}>
              {copy.t("Press G then a key from anywhere to quick-create")}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════
// Persistent identity bar — owns the chrome that's the SAME across
// workspace + talent modes (brand, user, acting-as context, mode toggle,
// global utilities). Sticks below the prototype ControlBar (50px).
//
// Why: the user is one human. The mode (Talent vs Workspace) is a
// context choice, not two products. Lifting the toggle + identity here
// means there's exactly ONE place to look, regardless of which surface
// is rendered below.
//
// Single source of truth for cross-mode unread:
// ════════════════════════════════════════════════════════════════════

// Derived from the real NOTIFICATIONS data — no more magic literals.
export const TALENT_UNREAD = TALENT_NOTIFICATION_COUNT;
const WORKSPACE_UNREAD = WORKSPACE_NOTIFICATION_COUNT;
