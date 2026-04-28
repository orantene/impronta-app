"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode, type CSSProperties } from "react";
import {
  CLIENT_PAGES,
  CLIENT_PAGE_META,
  COLORS,
  ENTITY_TYPE_META,
  ENTITY_TYPES,
  FONTS,
  describeSource,
  INQUIRY_STAGE_META,
  PAGE_META,
  PLAN_META,
  PLANS,
  PLATFORM_PAGES,
  PLATFORM_PAGE_META,
  RICH_INQUIRIES,
  NOTIFICATIONS,
  WORKSPACE_NOTIFICATION_COUNT,
  TALENT_NOTIFICATION_COUNT,
  ROLE_META,
  ROLES,
  SURFACE_META,
  SURFACES,
  TALENT_PAGES,
  TALENT_PAGE_META,
  TALENT_STATE_LABEL,
  MY_TALENT_PROFILE,
  TENANT,
  WORKSPACE_PAGES,
  getClients,
  getInquiries,
  getRoster,
  getTeam,
  meetsPlan,
  meetsRole,
  pluralize,
  useProto,
  Z,
  RADIUS,
  ACTIVATION_TASKS,
  FREE_PLAN_VALUE,
  SITE_PAGES,
  WORKSPACE_PAYMENTS,
  PAYMENT_STATUS_META,
  PAYOUT_STATUS_META,
  PLAN_FEE_META,
  getWorkspacePayout,
  fmtDate,
  fmtMoney,
  relativeTime,
  type ClientPage,
  type EntityType,
  type InquirySource,
  type Plan,
  type PlatformPage,
  type Role,
  type Surface,
  type TalentPage,
  type WorkspacePage,
} from "./_state";
import {
  Affordance,
  Avatar,
  Bullet,
  CapNudge,
  CapsLabel,
  ClientTrustChip,
  CompactLockedCard,
  EmptyState,
  Divider,
  EntityChip,
  GhostButton,
  Icon,
  IconChip,
  LockedCard,
  MoreWithSection,
  PrimaryButton,
  PrimaryCard,
  ReadOnlyChip,
  RoleChip,
  SecondaryButton,
  SecondaryCard,
  StarterCard,
  StateChip,
  StatDot,
  StatusCard,
  StatusPill,
  PlanChip,
  Popover,
  PayoutStatusChip,
  PaymentStatusChip,
  SwipeableRow,
  BulkSelectBar,
  BulkRowCheckbox,
  useKeyboardListNav,
  FloatingFab,
  ConfirmModal,
  AutoSaveIndicator,
  RetryCard,
  ActivityFeedItem,
  PageSkeleton,
  RowSkeleton,
} from "./_primitives";
import { SavedViewsBar, LoadMore, QuickReplyButtons, downloadCsv } from "./_wave2";
import { TalentSurface } from "./_talent";
import { ClientSurface } from "./_client";
import { PlatformSurface } from "./_platform";

// ════════════════════════════════════════════════════════════════════
// Prototype control bar
// ════════════════════════════════════════════════════════════════════

export function ControlBar() {
  const {
    state,
    setSurface,
    setPlan,
    setRole,
    setEntityType,
    setAlsoTalent,
    setPage,
    setTalentPage,
    setClientPage,
    setPlatformPage,
  } = useProto();

  // Dev controls are only useful while building/demoing the prototype.
  // Hide them in non-dev environments unless the URL opts in via ?dev=1.
  // This lets us share the prototype with non-developers without the
  // dark debug strip dominating the screen.
  const [devVisible, setDevVisible] = useState(true);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const stored = window.localStorage.getItem("tulala_dev_controls");
    if (params.get("dev") === "0") {
      setDevVisible(false);
    } else if (params.get("dev") === "1") {
      setDevVisible(true);
      try { window.localStorage.setItem("tulala_dev_controls", "1"); } catch {}
    } else if (stored === "0") {
      setDevVisible(false);
    }
  }, []);
  if (!devVisible) return null;

  return (
    <header
      role="banner"
      aria-label="Prototype control bar"
      style={{
        background: "#0F0F11",
        color: "#fff",
        borderBottom: "1px solid rgba(255,255,255,0.08)",
        padding: "6px 14px",
        display: "flex",
        alignItems: "center",
        gap: 12,
        flexWrap: "wrap",
        rowGap: 6,
        position: "sticky",
        top: 0,
        zIndex: Z.controlBar,
        fontFamily: FONTS.body,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginRight: 6 }}>
        <span
          style={{
            display: "inline-flex",
            width: 22,
            height: 22,
            borderRadius: 5,
            background: "rgba(255,255,255,0.10)",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: 0.5,
          }}
        >
          ◆
        </span>
        <span
          style={{
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: 1.2,
            textTransform: "uppercase",
            color: "rgba(255,255,255,0.72)",
          }}
        >
          Prototype
        </span>
      </div>

      <SegmentedControl
        label="Surface"
        value={state.surface}
        options={SURFACES.map((s) => ({
          value: s,
          label: SURFACE_META[s].short,
          disabledHint: SURFACE_META[s].ready ? undefined : "stub",
        }))}
        onChange={(v) => setSurface(v as Surface)}
      />

      {state.surface === "workspace" && (
        <>
          <SegmentedControl
            label="Plan"
            value={state.plan}
            options={PLANS.map((p) => ({ value: p, label: PLAN_META[p].label }))}
            onChange={(v) => setPlan(v as Plan)}
          />
          <SegmentedControl
            label="Entity"
            value={state.entityType}
            options={ENTITY_TYPES.map((e) => ({ value: e, label: ENTITY_TYPE_META[e].label }))}
            onChange={(v) => setEntityType(v as EntityType)}
          />
          <SegmentedControl
            label="Role"
            value={state.role}
            options={ROLES.map((r) => ({ value: r, label: ROLE_META[r].label }))}
            onChange={(v) => setRole(v as Role)}
          />
          <ToggleControl
            label="Also on roster"
            on={state.alsoTalent}
            onChange={setAlsoTalent}
          />
          <SegmentedControl
            label="Page"
            value={state.page}
            options={WORKSPACE_PAGES.map((p) => ({ value: p, label: PAGE_META[p].label }))}
            onChange={(v) => setPage(v as WorkspacePage)}
          />
        </>
      )}

      {state.surface === "talent" && (
        <SegmentedControl
          label="Page"
          value={state.talentPage}
          options={TALENT_PAGES.map((p) => ({ value: p, label: TALENT_PAGE_META[p].label }))}
          onChange={(v) => setTalentPage(v as TalentPage)}
        />
      )}

      {state.surface === "client" && (
        <SegmentedControl
          label="Page"
          value={state.clientPage}
          options={CLIENT_PAGES.map((p) => ({ value: p, label: CLIENT_PAGE_META[p].label }))}
          onChange={(v) => setClientPage(v as ClientPage)}
        />
      )}

      {state.surface === "platform" && (
        <SegmentedControl
          label="Page"
          value={state.platformPage}
          options={PLATFORM_PAGES.map((p) => ({ value: p, label: PLATFORM_PAGE_META[p].label }))}
          onChange={(v) => setPlatformPage(v as PlatformPage)}
        />
      )}

      <div style={{ flex: 1 }} />
      {/* Hide-controls toggle — sets localStorage so future visits stay
          hidden. Re-enable by appending ?dev=1 to the URL. */}
      <button
        type="button"
        onClick={() => {
          try { window.localStorage.setItem("tulala_dev_controls", "0"); } catch {}
          setDevVisible(false);
        }}
        title="Hide dev controls (re-enable with ?dev=1)"
        style={{
          background: "transparent",
          border: "none",
          color: "rgba(255,255,255,0.45)",
          fontFamily: FONTS.body,
          fontSize: 10,
          letterSpacing: 0.2,
          cursor: "pointer",
          padding: "4px 6px",
        }}
      >
        Hide
      </button>
    </header>
  );
}

function SegmentedControl({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { value: string; label: string; disabledHint?: string }[];
  onChange: (v: string) => void;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <span
        style={{
          fontSize: 9.5,
          color: "rgba(255,255,255,0.45)",
          letterSpacing: 0.8,
          textTransform: "uppercase",
          fontWeight: 600,
        }}
      >
        {label}
      </span>
      <div
        style={{
          display: "inline-flex",
          background: "rgba(255,255,255,0.06)",
          borderRadius: 6,
          padding: 1.5,
          gap: 0,
        }}
      >
        {options.map((opt) => {
          const active = opt.value === value;
          return (
            <button
              key={opt.value}
              onClick={() => onChange(opt.value)}
              style={{
                background: active ? "rgba(255,255,255,0.94)" : "transparent",
                color: active ? "#0F0F11" : "rgba(255,255,255,0.78)",
                border: "none",
                padding: "3px 8px",
                fontSize: 11,
                fontWeight: 500,
                letterSpacing: 0.05,
                fontFamily: FONTS.body,
                cursor: "pointer",
                borderRadius: 4,
                whiteSpace: "nowrap",
                transition: "background .12s, color .12s",
              }}
            >
              {opt.label}
              {opt.disabledHint && (
                <span style={{ marginLeft: 5, opacity: 0.5, fontSize: 10 }}>
                  · {opt.disabledHint}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function ToggleControl({
  label,
  on,
  onChange,
}: {
  label: string;
  on: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      onClick={() => onChange(!on)}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        background: on ? "rgba(255,255,255,0.94)" : "rgba(255,255,255,0.06)",
        color: on ? "#0F0F11" : "rgba(255,255,255,0.78)",
        border: "none",
        padding: "4px 9px",
        fontSize: 11,
        fontWeight: 500,
        fontFamily: FONTS.body,
        cursor: "pointer",
        borderRadius: 6,
        transition: "background .12s, color .12s",
      }}
    >
      <span
        style={{
          width: 8,
          height: 8,
          borderRadius: "50%",
          background: on ? COLORS.green : "rgba(255,255,255,0.30)",
        }}
      />
      {label}
    </button>
  );
}

// Time-aware greeting for the overview page header.
function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

// Mock storefront analytics — centralised so the numbers aren't
// scattered as magic literals across multiple render calls.
const MOCK_STOREFRONT_STATS = { views7d: 284, viewsGrowth: "+18%" };
const ME_EMAIL = "orantenemx@gmail.com";

// Sidebar page icons — local map so PAGE_META stays lean.
const PAGE_ICON: Record<string, "bolt" | "mail" | "calendar" | "arrow-right" | "team" | "user" | "globe" | "credit" | "settings"> = {
  overview: "bolt",
  inbox: "mail",
  calendar: "calendar",
  work: "arrow-right",
  talent: "team",
  clients: "user",
  site: "globe",
  billing: "credit",
  workspace: "settings",
};

// ════════════════════════════════════════════════════════════════════
// Workspace topbar (product chrome)
// ════════════════════════════════════════════════════════════════════

export function WorkspaceTopbar() {
  const { state, setPage, setWorkspaceLayout } = useProto();
  const isSettingsActive = state.page === "workspace";
  const canCreate = meetsRole(state.role, "editor");

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
        <nav data-tulala-app-topbar-nav aria-label="Workspace sections" style={{ display: "flex", alignItems: "center", gap: 2, flex: 1, overflow: "auto" }}>
          {WORKSPACE_PAGES.map((p) => {
            const active = state.page === p;
            return (
              <button
                key={p}
                onClick={() => setPage(p)}
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
                  transition: "color .12s, background .12s",
                }}
                onMouseEnter={(e) => {
                  if (!active) e.currentTarget.style.color = COLORS.ink;
                }}
                onMouseLeave={(e) => {
                  if (!active) e.currentTarget.style.color = COLORS.inkMuted;
                }}
              >
                {p === "talent" ? ENTITY_TYPE_META[state.entityType].rosterLabel : PAGE_META[p].label}
                <span
                  aria-hidden
                  style={{
                    position: "absolute",
                    bottom: -1,
                    left: 8,
                    right: 8,
                    height: 2,
                    background: COLORS.ink,
                    borderRadius: 2,
                    opacity: active ? 1 : 0,
                    transform: active ? "scaleX(1)" : "scaleX(0.4)",
                    transformOrigin: "center",
                    transition: "opacity .18s ease, transform .25s cubic-bezier(.4,.0,.2,1)",
                    pointerEvents: "none",
                  }}
                />
              </button>
            );
          })}
        </nav>

        {/* Right side — Quick create + settings shortcut + sidebar layout toggle. */}
        <div data-tulala-app-topbar-right style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {canCreate && <QuickCreateMenu />}
          <Popover content="Workspace settings">
            <button
              type="button"
              onClick={() => setPage("workspace")}
              aria-label="Workspace settings"
              style={{
                ...iconButtonStyle,
                background: isSettingsActive ? COLORS.ink : "#fff",
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
          <Popover content="Switch to sidebar layout">
            <button
              type="button"
              onClick={() => setWorkspaceLayout("sidebar")}
              aria-label="Switch to sidebar layout"
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
const selectStyle: React.CSSProperties = {
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

function QuickCreateMenu() {
  const { openDrawer, state } = useProto();
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

  const items: { id: string; label: string; sub: string; drawer: any; shortcut: string; canDo: boolean }[] = [
    {
      id: "new-inquiry",
      label: "New inquiry",
      sub: "Capture a lead from a client",
      drawer: "new-inquiry",
      shortcut: "G I",
      canDo: meetsRole(state.role, "coordinator") || state.plan === "free",
    },
    {
      id: "new-booking",
      label: "New booking",
      sub: "Confirmed job — skip the inquiry",
      drawer: "new-booking",
      shortcut: "G B",
      canDo: meetsRole(state.role, "coordinator"),
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
      canDo: meetsRole(state.role, "coordinator") && state.plan !== "free",
    },
    {
      id: "invite-team",
      label: "Invite teammate",
      sub: "Add a coordinator or editor",
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
      canDo: meetsRole(state.role, "coordinator"),
    },
    {
      id: "share-card",
      label: "Share talent",
      sub: "Send a client-facing standalone link",
      drawer: "talent-share-card",
      shortcut: "G H",
      canDo: meetsRole(state.role, "coordinator"),
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
          background: COLORS.ink,
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
        New
        <Icon name="chevron-down" size={11} stroke={2} />
      </button>
      {open && (
        <div
          role="menu"
          aria-label="Quick create"
          style={{
            position: "absolute",
            top: "calc(100% + 6px)",
            right: 0,
            background: "#15151A",
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
            Quick create
          </div>
          {items.map((it) => (
            <button
              key={it.id}
              role="menuitem"
              disabled={!it.canDo}
              onClick={() => {
                openDrawer(it.drawer, it.id === "new-client" ? { id: "new" } : undefined);
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
                transition: "background .1s",
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
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: "block", fontSize: 13, fontWeight: 500 }}>
                  {it.label}
                </span>
                <span style={{ display: "block", fontSize: 11, color: "rgba(255,255,255,0.55)" }}>
                  {it.sub}
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
              Press G then a key from anywhere to quick-create
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
const TALENT_UNREAD = TALENT_NOTIFICATION_COUNT;
const WORKSPACE_UNREAD = WORKSPACE_NOTIFICATION_COUNT;

export function TulalaIdentityBar() {
  const { state, openDrawer, flipMode, toast } = useProto();
  const { surface, alsoTalent, role, plan, entityType } = state;

  // Only the hybrid-user surfaces (workspace + talent) get this bar.
  // Client and platform are different products with their own chrome.
  if (surface !== "workspace" && surface !== "talent") return null;

  const userName = MY_TALENT_PROFILE.name;
  const userInitials = MY_TALENT_PROFILE.initials;

  // Acting-as context flips with mode. Workspace = the agency the user
  // owns. Talent = the agency the user is currently representing.
  const inWorkspace = surface === "workspace";
  const actingLabel = inWorkspace ? TENANT.name : MY_TALENT_PROFILE.primaryAgency;
  const actingSubLabel = inWorkspace
    ? `${plan.charAt(0).toUpperCase() + plan.slice(1)} · ${entityType} · ${role.charAt(0).toUpperCase() + role.slice(1)}`
    : "Primary agency";
  // Acting-as detail line — surfaces a secondary metric next to the
  // workspace/agency name so the chip says more than just "Acme Models".
  // Workspace shows pending receivables; talent shows confirmed bookings
  // count for the active agency relationship. Mocked.
  const actingDetail = inWorkspace
    ? `${fmtMoney(4200)} pending · 3 confirmed`
    : `3 confirmed · ${fmtMoney(4200)} YTD`;
  const onActingClick = () =>
    inWorkspace ? openDrawer("tenant-switcher") : openDrawer("talent-agency-relationship");

  // The notifications + help drawers are different on each side — the
  // bell opens the right one based on surface.
  const notificationsDrawerId = inWorkspace ? "notifications" : "talent-notifications";
  const notificationsUnread = inWorkspace ? WORKSPACE_UNREAD : TALENT_UNREAD;

  return (
    <header
      data-tulala-identity-bar
      style={{
        background: "#fff",
        borderBottom: `1px solid ${COLORS.borderSoft}`,
        position: "sticky",
        top: "var(--proto-cbar, 50px)",
        zIndex: 50,
        padding: "0 24px",
        height: 56,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 14,
          height: "100%",
          maxWidth: 1440,
          margin: "0 auto",
        }}
      >
        {/* Brand mark — wordmark in display font, restrained.
            Hidden at phone widths to free space for identity + toggle. */}
        <div
          aria-label="Tulala"
          data-tulala-brand
          style={{
            fontFamily: FONTS.display,
            fontSize: 16,
            fontWeight: 500,
            letterSpacing: 0.4,
            color: COLORS.ink,
            textTransform: "uppercase",
            paddingRight: 4,
          }}
        >
          Tulala
        </div>

        <div data-tulala-id-divider style={{ width: 1, height: 22, background: COLORS.borderSoft, margin: "0 4px" }} />

        {/* User identity — the one human across modes. Click opens
            the account menu (audit #3). */}
        <AccountMenuTrigger userName={userName} userInitials={userInitials}>
          <Avatar initials={userInitials} size={28} tone="ink" />
          <span
            data-tulala-identity-name
            style={{
              fontFamily: FONTS.body,
              fontSize: 14,
              fontWeight: 500,
              color: COLORS.ink,
              letterSpacing: -0.05,
            }}
          >
            {userName}
          </span>
          <Icon name="chevron-down" size={10} color={COLORS.inkDim} />
        </AccountMenuTrigger>

        {/* Subtle separator dot between identity and acting-as.
            Hidden at phone widths (where the name text also collapses). */}
        <span
          aria-hidden
          data-tulala-id-slash
          style={{ fontFamily: FONTS.body, fontSize: 14, color: COLORS.inkDim, marginLeft: -2 }}
        >
          /
        </span>

        {/* Acting-as context — flips with mode. Click opens the
            tenant or agency switcher depending on which side.
            Audit #4 — chevron rotates on hover to invite the click. */}
        <button
          type="button"
          onClick={onActingClick}
          aria-label={`Acting as ${actingLabel} — switch`}
          title={actingSubLabel}
          className="tulala-acting-chip"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            background: "transparent",
            border: "none",
            cursor: "pointer",
            padding: "5px 9px",
            borderRadius: 999,
            fontFamily: FONTS.body,
            transition: "background .12s",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(11,11,13,0.04)")}
          onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
        >
          <span
            aria-hidden
            style={{
              width: 6,
              height: 6,
              borderRadius: "50%",
              background: COLORS.green,
              flexShrink: 0,
            }}
          />
          <span
            data-tulala-acting-label
            style={{
              display: "inline-flex",
              flexDirection: "column",
              alignItems: "flex-start",
              minWidth: 0,
              overflow: "hidden",
              maxWidth: 180,
            }}
          >
            <span style={{
              fontFamily: FONTS.body,
              fontSize: 13,
              fontWeight: 500,
              color: COLORS.ink,
              letterSpacing: -0.05,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
              lineHeight: 1.15,
            }}>{actingLabel}</span>
            <span data-tulala-acting-detail style={{
              fontFamily: FONTS.body,
              fontSize: 10,
              fontWeight: 500,
              color: COLORS.inkMuted,
              letterSpacing: 0,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
              lineHeight: 1.1,
              marginTop: 1,
            }}>{actingDetail}</span>
          </span>
          <span
            aria-hidden
            className="tulala-acting-chevron"
            style={{
              display: "inline-flex",
              transition: "transform .22s cubic-bezier(.4,.0,.2,1)",
            }}
          >
            <Icon name="chevron-down" size={10} color={COLORS.inkDim} />
          </span>
        </button>

        <div style={{ flex: 1 }} />

        {/* Mode toggle — the centerpiece. ONLY for hybrid users. Pill
            with ink-filled active side; inactive side carries unread. */}
        {alsoTalent && <ModeTogglePill surface={surface} flipMode={flipMode} />}

        {/* Global utilities — single source for both modes. */}
        <IdentityBarIconButton
          aria-label={`Notifications · ${notificationsUnread} unread`}
          onClick={() => openDrawer(notificationsDrawerId)}
          badge={notificationsUnread}
        >
          <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
            <path d="M6 8a6 6 0 1 1 12 0c0 7 3 8 3 8H3s3-1 3-8" />
            <path d="M10 21a2 2 0 0 0 4 0" />
          </svg>
        </IdentityBarIconButton>

        <IdentityBarIconButton
          aria-label="Help"
          onClick={() => openDrawer("help")}
        >
          <span style={{ fontFamily: FONTS.body, fontWeight: 700, fontSize: 13 }}>?</span>
        </IdentityBarIconButton>

        {/* Locale toggle — matches production EN/ES affordance.
            Compact pill; the inactive side flips on click. */}
        <LocaleToggle />

        {/* Sign out — matches production. Compact icon button at the
            far right; click confirms via toast in the prototype. */}
        <IdentityBarIconButton
          aria-label="Sign out"
          onClick={() => toast("Signed out (prototype)")}
        >
          <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
            <path d="m16 17 5-5-5-5" />
            <path d="M21 12H9" />
          </svg>
        </IdentityBarIconButton>
      </div>
    </header>
  );
}

/**
 * Account menu trigger + popover (audit #3). Wraps the identity
 * button with click-to-open menu. Items: Profile / Settings /
 * Keyboard shortcuts / Sign out. Used in the persistent identity
 * bar above the surfaces.
 */
function AccountMenuTrigger({
  userName,
  userInitials: _userInitials,
  children,
}: {
  userName: string;
  userInitials: string;
  children: ReactNode;
}) {
  const { toast, state } = useProto();
  const [open, setOpen] = useState(false);
  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && !target.closest("[data-tulala-account-menu-root]")) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div
      data-tulala-account-menu-root
      style={{ position: "relative" }}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setOpen(false);
      }}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={`Signed in as ${userName}`}
        aria-haspopup="menu"
        aria-expanded={open}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 9,
          background: open ? "rgba(11,11,13,0.06)" : "transparent",
          border: "none",
          cursor: "pointer",
          padding: "4px 6px 4px 4px",
          borderRadius: 999,
          fontFamily: FONTS.body,
          transition: "background .12s",
        }}
        onMouseEnter={(e) => {
          if (!open) e.currentTarget.style.background = "rgba(11,11,13,0.04)";
        }}
        onMouseLeave={(e) => {
          if (!open) e.currentTarget.style.background = "transparent";
        }}
      >
        {children}
      </button>
      {open && (
        <div
          role="menu"
          style={{
            position: "absolute",
            top: "calc(100% + 6px)",
            left: 0,
            minWidth: 240,
            background: "#fff",
            border: `1px solid ${COLORS.borderSoft}`,
            borderRadius: 12,
            boxShadow: "0 10px 40px rgba(11,11,13,0.16)",
            padding: 6,
            zIndex: 200,
            fontFamily: FONTS.body,
            animation: "tulala-menu-fade .14s ease",
          }}
        >
          <style>{`@keyframes tulala-menu-fade { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: translateY(0); } }`}</style>
          {/* Header — signed-in-as identity */}
          <div
            style={{
              padding: "10px 12px 10px",
              borderBottom: `1px solid ${COLORS.borderSoft}`,
              marginBottom: 4,
            }}
          >
            <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: 0.7, textTransform: "uppercase", color: COLORS.inkMuted, marginBottom: 2 }}>
              Signed in as
            </div>
            <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.ink }}>{userName}</div>
            <div style={{ fontSize: 11.5, color: COLORS.inkMuted, marginTop: 1 }}>{ME_EMAIL}</div>
            {/* Tenant meta — plan / role, shown on mobile where the identity
                bar chips are hidden (#2) */}
            {state.surface === "workspace" && (
              <div
                data-tulala-tenant-meta-mobile
                style={{
                  display: "none",
                  marginTop: 8,
                  padding: "6px 8px",
                  background: COLORS.surfaceAlt,
                  borderRadius: 7,
                  fontSize: 11,
                  color: COLORS.ink,
                  fontWeight: 500,
                  gap: 6,
                }}
              >
                <span style={{ textTransform: "capitalize" }}>{PLAN_META[state.plan].label}</span>
                <span style={{ color: COLORS.inkMuted }}>·</span>
                <span style={{ textTransform: "capitalize" }}>{state.entityType}</span>
                <span style={{ color: COLORS.inkMuted }}>·</span>
                <span style={{ textTransform: "capitalize" }}>{state.role}</span>
              </div>
            )}
          </div>

          <AccountMenuItem
            label="Profile"
            sub="View / edit your public profile"
            onClick={() => { setOpen(false); toast("Profile drawer (prototype)"); }}
          />
          <AccountMenuItem
            label="Account settings"
            sub="Email, password, security"
            onClick={() => { setOpen(false); toast("Account settings (prototype)"); }}
          />
          <AccountMenuItem
            label="Notifications"
            sub="Email, push, digest preferences"
            onClick={() => { setOpen(false); toast("Notification prefs (prototype)"); }}
          />
          <AccountMenuItem
            label="Language"
            sub="EN · ES"
            onClick={() => { setOpen(false); toast("Language picker (prototype)"); }}
          />
          <AccountMenuItem
            label="Keyboard shortcuts"
            sub="Press ?"
            onClick={() => { setOpen(false); toast("⌘K · ? for shortcuts"); }}
          />
          <div style={{ borderTop: `1px solid ${COLORS.borderSoft}`, marginTop: 4, paddingTop: 4 }}>
            <AccountMenuItem
              label="Sign out"
              sub=""
              tone="coral"
              onClick={() => { setOpen(false); toast("Signed out (prototype)"); }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function AccountMenuItem({
  label,
  sub,
  tone,
  onClick,
}: {
  label: string;
  sub: string;
  tone?: "coral";
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-start",
        justifyContent: "center",
        gap: 1,
        width: "100%",
        minHeight: 36,
        padding: "8px 12px",
        background: "transparent",
        border: "none",
        borderRadius: 7,
        cursor: "pointer",
        textAlign: "left",
        fontFamily: FONTS.body,
        transition: "background .1s",
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(11,11,13,0.04)")}
      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
    >
      <span style={{ fontSize: 13, fontWeight: 500, color: tone === "coral" ? COLORS.coralDeep : COLORS.ink }}>
        {label}
      </span>
      {sub && (
        <span style={{ fontSize: 11, color: COLORS.inkMuted, marginTop: 1 }}>
          {sub}
        </span>
      )}
    </button>
  );
}

function LocaleToggle() {
  const { toast } = useProto();
  const [locale, setLocale] = useState<"EN" | "ES">("EN");
  return (
    <div
      role="group"
      aria-label="Language"
      style={{
        display: "inline-flex",
        alignItems: "center",
        background: "rgba(11,11,13,0.05)",
        borderRadius: 8,
        padding: 2,
        fontFamily: FONTS.body,
      }}
    >
      {(["EN", "ES"] as const).map((code) => {
        const active = locale === code;
        return (
          <button
            key={code}
            type="button"
            onClick={() => {
              if (active) return;
              setLocale(code);
              toast(`Language · ${code === "EN" ? "English" : "Español"}`);
            }}
            aria-pressed={active}
            style={{
              background: active ? "#fff" : "transparent",
              border: "none",
              borderRadius: 6,
              padding: "5px 9px",
              cursor: active ? "default" : "pointer",
              fontFamily: FONTS.body,
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: 0.6,
              color: active ? COLORS.ink : COLORS.inkMuted,
              boxShadow: active ? "0 1px 1px rgba(11,11,13,0.06)" : "none",
              transition: "background .12s, color .12s",
            }}
          >
            {code}
          </button>
        );
      })}
    </div>
  );
}

function ModeTogglePill({
  surface,
  flipMode,
}: {
  surface: Surface;
  flipMode: () => void;
}) {
  const inTalent = surface === "talent";
  // Direct-background active state. The earlier absolute-thumb
  // slide animation was visually unreliable (active pill appeared
  // larger than its container at narrow widths). Reliable beats
  // animated — both buttons render the same size, the active one
  // just gets a real background fill.
  return (
    <div
      role="group"
      aria-label="Switch between Talent and Workspace"
      style={{
        display: "inline-flex",
        alignItems: "center",
        background: "rgba(11,11,13,0.05)",
        borderRadius: 999,
        padding: 3,
        fontFamily: FONTS.body,
        height: 32,
      }}
    >
      <ModeTogglePillButton
        active={inTalent}
        label="Talent"
        unread={inTalent ? 0 : TALENT_UNREAD}
        onClick={inTalent ? undefined : flipMode}
      />
      <ModeTogglePillButton
        active={!inTalent}
        label="Workspace"
        unread={!inTalent ? 0 : WORKSPACE_UNREAD}
        onClick={!inTalent ? undefined : flipMode}
      />
    </div>
  );
}

function ModeTogglePillButton({
  active,
  label,
  unread,
  onClick,
}: {
  active: boolean;
  label: string;
  unread: number;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      style={{
        background: active ? COLORS.ink : "transparent",
        color: active ? "#fff" : COLORS.inkMuted,
        border: "none",
        borderRadius: 999,
        // height matches container minus 6px padding (3+3) so the
        // active background fills exactly the inner space without
        // overflow.
        height: 26,
        padding: "0 14px",
        cursor: active ? "default" : "pointer",
        fontFamily: FONTS.body,
        fontSize: 12.5,
        fontWeight: active ? 600 : 500,
        letterSpacing: 0.1,
        lineHeight: 1,
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        transition: "background .2s ease, color .2s ease",
        flex: 1,
        justifyContent: "center",
        boxShadow: active ? "0 1px 2px rgba(11,11,13,0.12)" : "none",
      }}
      onMouseEnter={(e) => {
        if (!active) e.currentTarget.style.color = COLORS.ink;
      }}
      onMouseLeave={(e) => {
        if (!active) e.currentTarget.style.color = COLORS.inkMuted;
      }}
    >
      {label}
      {unread > 0 && (
        <span
          aria-label={`${unread} unread`}
          style={{
            minWidth: 16,
            height: 16,
            padding: "0 5px",
            borderRadius: 999,
            background: COLORS.green,
            color: "#fff",
            fontSize: 9.5,
            fontWeight: 700,
            lineHeight: 1,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {unread > 9 ? "9+" : unread}
        </span>
      )}
    </button>
  );
}

function IdentityBarIconButton({
  onClick,
  children,
  badge,
  ...rest
}: {
  onClick: () => void;
  children: ReactNode;
  badge?: number;
  "aria-label"?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
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
        position: "relative",
        transition: "border-color .12s, color .12s",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = COLORS.border;
        e.currentTarget.style.color = COLORS.ink;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = COLORS.borderSoft;
        e.currentTarget.style.color = COLORS.inkMuted;
      }}
      {...rest}
    >
      {children}
      {badge && badge > 0 && (
        <span
          aria-hidden
          style={{
            position: "absolute",
            top: -4,
            right: -4,
            minWidth: 14,
            height: 14,
            padding: "0 3px",
            borderRadius: 999,
            background: COLORS.accent,
            color: "#fff",
            fontSize: 9,
            fontWeight: 700,
            lineHeight: 1,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            boxShadow: "0 0 0 1.5px #fff",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {badge > 9 ? "9+" : badge}
        </span>
      )}
    </button>
  );
}

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
  const { state } = useProto();
  return (
    <HybridShell>
      {state.workspaceLayout === "sidebar" ? (
        <WorkspaceSidebarShell />
      ) : (
        <div style={{ background: COLORS.surface, minHeight: "calc(100vh - 56px - 56px - 50px)" }}>
          <WorkspaceTopbar />
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
  const { state, setPage, openDrawer, setWorkspaceLayout } = useProto();
  const { role } = state;
  const canCreate = meetsRole(role, "editor");
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
            transition: "background .12s",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = COLORS.accentSoft)}
          onMouseLeave={(e) => (e.currentTarget.style.background = COLORS.surfaceAlt)}
        >
          <Avatar initials={TENANT.name.slice(0, 2).toUpperCase()} size={26} tone="ink" />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12.5, fontWeight: 600, color: COLORS.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {TENANT.name}
            </div>
            <div style={{ fontSize: 10.5, color: COLORS.inkMuted, textTransform: "capitalize" }}>
              {state.plan} · {state.entityType}
            </div>
          </div>
          <Icon name="chevron-down" size={10} color={COLORS.inkDim} />
        </button>

        {/* Page nav — the one thing the sidebar owns. Tenant identity,
            mode toggle, bell/help all live in the persistent identity
            bar above. Clean. */}
        <nav aria-label="Workspace sections" style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          {WORKSPACE_PAGES.map((p) => {
            const active = state.page === p;
            const iconName = PAGE_ICON[p];
            return (
              <button
                key={p}
                type="button"
                onClick={() => setPage(p)}
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
                  transition: "background .12s, color .12s",
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
                {p === "talent" ? ENTITY_TYPE_META[state.entityType].rosterLabel : PAGE_META[p].label}
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
            display: "flex",
            alignItems: "center",
            gap: 6,
            padding: "7px 10px",
            background: "transparent",
            border: `1px solid ${COLORS.borderSoft}`,
            borderRadius: 7,
            cursor: "pointer",
            fontFamily: FONTS.body,
            fontSize: 11.5,
            color: COLORS.inkMuted,
            transition: "border-color .12s, color .12s",
          }}
          onMouseEnter={(e) => { e.currentTarget.style.borderColor = COLORS.border; e.currentTarget.style.color = COLORS.ink; }}
          onMouseLeave={(e) => { e.currentTarget.style.borderColor = COLORS.borderSoft; e.currentTarget.style.color = COLORS.inkMuted; }}
        >
          <Icon name="arrow-right" size={11} stroke={1.8} />
          Topbar layout
        </button>
      </aside>

      <main
        data-tulala-surface-main
        style={{
          padding: "28px 28px 60px",
          maxWidth: 1180,
          width: "100%",
          margin: "0 auto",
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
    case "inbox":
      body = <UnifiedInboxPage />;
      break;
    case "calendar":
      body = <CalendarPage />;
      break;
    case "work":
      body = <WorkPage />;
      break;
    case "talent":
      body = <TalentPage />;
      break;
    case "clients":
      body = <ClientsPage />;
      break;
    case "site":
      body = <SitePage />;
      break;
    case "billing":
      body = <BillingPage />;
      break;
    case "workspace":
      body = <WorkspacePageView />;
      break;
  }
  return (
    <div key={page} data-tulala-workspace-page-anim style={{ animation: "tulala-page-fade .22s cubic-bezier(.4,0,.2,1)" }}>
      {body}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════
// Page header shared
// ════════════════════════════════════════════════════════════════════

function PageHeader({
  eyebrow,
  title,
  subtitle,
  actions,
  onBack,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  /** Mobile-only back arrow (#1). Pass label for the previous context. */
  onBack?: () => void;
}) {
  return (
    <>
    <style>{`@media (max-width: 680px) { [data-tulala-page-back] { display: flex !important; } }`}</style>
    <div
      data-tulala-page-header
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 16,
        marginBottom: 24,
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        {/* Back button: visible only on mobile via CSS (#1) */}
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            data-tulala-page-back
            style={{
              display: "none",
              alignItems: "center",
              gap: 4,
              background: "transparent",
              border: "none",
              padding: "0 0 8px",
              cursor: "pointer",
              fontFamily: FONTS.body,
              fontSize: 12,
              fontWeight: 500,
              color: COLORS.inkMuted,
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = COLORS.ink)}
            onMouseLeave={(e) => (e.currentTarget.style.color = COLORS.inkMuted)}
          >
            <span aria-hidden style={{ fontSize: 14 }}>←</span>
            Back
          </button>
        )}
        {eyebrow && (
          <div style={{ marginBottom: 6 }}>
            <CapsLabel>{eyebrow}</CapsLabel>
          </div>
        )}
        <h1
          data-tulala-h1
          style={{
            fontFamily: FONTS.display,
            fontSize: 30,
            fontWeight: 500,
            letterSpacing: -0.6,
            color: COLORS.ink,
            margin: 0,
            lineHeight: 1.15,
          }}
        >
          {title}
        </h1>
        {subtitle && (
          <p
            style={{
              fontFamily: FONTS.body,
              fontSize: 14,
              color: COLORS.inkMuted,
              margin: "6px 0 0",
              lineHeight: 1.55,
              maxWidth: 720,
            }}
          >
            {subtitle}
          </p>
        )}
      </div>
      {actions && (
        <div
          data-tulala-page-header-actions
          style={{ display: "flex", gap: 8, alignItems: "center", flexShrink: 0 }}
        >
          {actions}
        </div>
      )}
    </div>
    </>
  );
}

function Grid({
  children,
  cols = "auto",
}: {
  children: ReactNode;
  cols?: "auto" | "2" | "3" | "4";
}) {
  const colMap = {
    auto: "repeat(auto-fit, minmax(280px, 1fr))",
    "2": "repeat(2, 1fr)",
    "3": "repeat(3, 1fr)",
    "4": "repeat(4, 1fr)",
  };
  return (
    <div
      data-tulala-grid={cols}
      style={{
        display: "grid",
        gridTemplateColumns: colMap[cols],
        gap: 12,
      }}
    >
      {children}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════
// OVERVIEW
// ════════════════════════════════════════════════════════════════════

/**
 * Audit #49 — Today's focus card. One prominent banner at the top of
 * the workspace overview with the single most urgent line of the day.
 * Reduces "where do I start" anxiety by surfacing the answer above
 * the metric grid.
 */
function TodaysFocusCard({
  pendingClients,
  draftCount,
  nextBookingLabel,
  oldestWaitDays,
  onOpen,
}: {
  pendingClients: number;
  draftCount: number;
  nextBookingLabel: string | null;
  oldestWaitDays: number;
  onOpen: () => void;
}) {
  // Build a one-line action priority — most urgent thing wins.
  let title = "All caught up — nothing urgent today.";
  let body = nextBookingLabel
    ? `Next up: ${nextBookingLabel}. Use the quiet time to refine a draft or prep call sheets.`
    : "Use the next quiet hour to refine a draft or chase a hold.";
  let primary: { label: string; onClick: () => void } | null = null;
  if (pendingClients > 0) {
    title = `${pendingClients} ${pendingClients === 1 ? "inquiry is" : "inquiries are"} waiting for a client decision.`;
    const waitHint = oldestWaitDays >= 2 ? ` Oldest wait: ${oldestWaitDays}d — follow up before it goes cold.` : " Send a nudge or share polaroids to move it forward.";
    body = `The ball is in their court.${waitHint}`;
    primary = { label: "Open today's pulse", onClick: onOpen };
  } else if (draftCount > 0) {
    title = `${draftCount} ${draftCount === 1 ? "draft hasn't" : "drafts haven't"} been sent yet.`;
    body = "Finish the brief and send while the client's still warm.";
    primary = { label: "Open drafts", onClick: onOpen };
  }
  return (
    <section
      style={{
        position: "relative",
        background: `linear-gradient(135deg, ${COLORS.accentSoft} 0%, #fff 60%)`,
        border: `1px solid ${COLORS.accent}`,
        borderRadius: 14,
        padding: "16px 20px",
        marginBottom: 16,
        fontFamily: FONTS.body,
        display: "flex",
        alignItems: "center",
        gap: 16,
      }}
    >
      <div
        aria-hidden
        style={{
          width: 38,
          height: 38,
          borderRadius: 12,
          background: "#fff",
          border: `1px solid ${COLORS.accent}`,
          color: COLORS.accent,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
          boxShadow: `0 0 0 4px ${COLORS.accentSoft}`,
        }}
      >
        <Icon name="bolt" size={17} stroke={1.7} color={COLORS.accent} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 10.5,
            fontWeight: 700,
            letterSpacing: 0.7,
            textTransform: "uppercase",
            color: COLORS.accent,
            marginBottom: 3,
          }}
        >
          Today's focus
        </div>
        <h2
          style={{
            fontFamily: FONTS.display,
            fontSize: 18,
            fontWeight: 500,
            color: COLORS.ink,
            margin: 0,
            letterSpacing: -0.2,
            lineHeight: 1.3,
          }}
        >
          {title}
        </h2>
        <p style={{ fontSize: 12.5, color: COLORS.inkMuted, margin: "4px 0 0", lineHeight: 1.5 }}>
          {body}
          {nextBookingLabel && <span> · {nextBookingLabel}.</span>}
        </p>
      </div>
      {primary && (
        <PrimaryButton size="sm" onClick={primary.onClick}>
          {primary.label}
        </PrimaryButton>
      )}
    </section>
  );
}

function OverviewPage() {
  const { state, openDrawer, openUpgrade, completeTask, toast } = useProto();
  const isFree = state.plan === "free";
  const canEdit = meetsRole(state.role, "editor");

  if (isFree) {
    return <OverviewFree />;
  }

  const inquiries = getInquiries(state.plan);
  // Use RICH_INQUIRIES for accurate stage-based metrics — legacy getInquiries()
  // uses an older 5-stage model that no longer maps to production stages.
  const richInqs = RICH_INQUIRIES;
  const draftCount = richInqs.filter((i) => i.stage === "draft").length;
  const awaiting = richInqs.filter((i) => i.nextActionBy === "client");
  const confirmedThisWeek = richInqs.filter(
    (i) => i.stage === "booked" || i.stage === "approved",
  );

  return (
    <>
      <PageHeader
        eyebrow={`${greeting()}, ${MY_TALENT_PROFILE.name.split(" ")[0]} · ${TENANT.name}`}
        title={new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
        subtitle="Your workspace at a glance — what's moving, what's stuck, and what needs you."
        actions={
          canEdit && (
            <PrimaryButton onClick={() => openDrawer("new-inquiry")}>
              New inquiry
            </PrimaryButton>
          )
        }
      />

      {/* Audit #49 — Today's focus card. ONE prominent banner at the
          top with the highest-urgency line of the day. Single source
          of urgency above the metric strip. */}
      <TodaysFocusCard
        pendingClients={awaiting.length}
        draftCount={draftCount}
        nextBookingLabel={confirmedThisWeek[0]?.clientName ? `${confirmedThisWeek[0].clientName} starts soon` : null}
        oldestWaitDays={awaiting.length > 0 ? Math.max(...awaiting.map((i) => i.ageDays)) : 0}
        onOpen={() => openDrawer("today-pulse")}
      />

      {/* Stat row */}
      <Grid cols="4">
        <StatusCard
          label="Needs attention"
          value={awaiting.length + draftCount}
          caption="items needing your attention"
          tone="amber"
          onClick={() => openDrawer("today-pulse")}
        />
        <StatusCard
          label="Active inquiries"
          value={richInqs.filter((i) => i.stage !== "rejected" && i.stage !== "expired").length}
          caption="across pipeline"
          tone="ink"
          onClick={() => openDrawer("pipeline")}
        />
        <StatusCard
          label="Confirmed this week"
          value={confirmedThisWeek.length}
          caption="bookings on the calendar"
          tone="green"
          onClick={() => openDrawer("confirmed-bookings")}
        />
        <StatusCard
          label="Profile views"
          value={MOCK_STOREFRONT_STATS.views7d}
          caption={`last 7 days · ${MOCK_STOREFRONT_STATS.viewsGrowth}`}
          tone="ink"
          onClick={() => openDrawer("storefront-visibility")}
        />
      </Grid>

      <div style={{ height: 24 }} />

      {/* Primary row */}
      <Grid cols="2">
        <PrimaryCard
          title="What needs you today"
          description={`${pluralize(awaiting.length, "inquiry", "inquiries")} ${awaiting.length === 1 ? "is" : "are"} waiting for a client decision and ${pluralize(draftCount, "draft", "drafts")} ${draftCount === 1 ? "hasn't" : "haven't"} been sent.`}
          icon={<Icon name="bolt" size={14} stroke={1.7} />}
          affordance="Open focus list"
          meta={<>{pluralize(awaiting.length + draftCount, "item", "items", true)}</>}
          onClick={() => openDrawer("today-pulse")}
        />
        <PrimaryCard
          title="Workflow"
          description="Every inquiry, grouped by where it's stuck. See who's waiting on whom from first request to confirmed booking."
          icon={<Icon name="arrow-right" size={14} stroke={1.7} />}
          affordance="Open workflow"
          meta={
            <>
              {pluralize(inquiries.length, "active", "active", true)}
              <Bullet />
              {confirmedThisWeek.length} confirmed
            </>
          }
          onClick={() => openDrawer("pipeline")}
        />
      </Grid>

      <div style={{ height: 12 }} />

      {/* Secondary row */}
      <Grid cols="3">
        <SecondaryCard
          title="Drafts"
          description="Inquiries you started but haven't sent."
          meta={pluralize(draftCount, "item", "items")}
          affordance="Review"
          onClick={() => openDrawer("drafts-holds")}
        />
        <SecondaryCard
          title="Sent — waiting"
          description="Offers sent. Waiting on the client to confirm."
          meta={pluralize(awaiting.length, "item", "items")}
          affordance="Review"
          onClick={() => openDrawer("awaiting-client")}
        />
        <SecondaryCard
          title="Recent activity"
          description="What teammates and clients did in the last 24h."
          affordance="See feed"
          onClick={() => openDrawer("team-activity")}
        />
      </Grid>

      {/* Locked strip — what's available higher up */}
      {state.plan === "studio" && (
        <MoreWithSection plan="agency">
          <CompactLockedCard
            title="Agency design system"
            requiredPlan="agency"
            onClick={() =>
              openUpgrade({
                feature: "Branded site design",
                why: "Take full control of your storefront's typography, color and layout.",
                requiredPlan: "agency",
                unlocks: ["Custom design tokens", "Theme builder", "Section presets"],
              })
            }
          />
          <CompactLockedCard
            title="Field catalog"
            requiredPlan="agency"
            onClick={() =>
              openUpgrade({
                feature: "Custom talent fields",
                why: "Add fields your agency cares about — tags, niches, contracts.",
                requiredPlan: "agency",
                unlocks: ["Custom fields", "Per-roster taxonomy", "Filter config"],
              })
            }
          />
          <CompactLockedCard
            title="Hub distribution"
            requiredPlan="network"
            onClick={() =>
              openUpgrade({
                feature: "Multi-brand hub",
                why: "Run multiple agency identities under one roof and distribute roster across them.",
                requiredPlan: "network",
                unlocks: ["Sub-tenants", "Cross-roster sharing", "Hub-level analytics"],
              })
            }
          />
        </MoreWithSection>
      )}

      {state.plan === "agency" && (
        <MoreWithSection plan="network">
          <CompactLockedCard
            title="Multi-brand workspaces"
            requiredPlan="network"
            onClick={() =>
              openUpgrade({
                feature: "Multi-brand hub",
                why: "Run several agencies as one operation. Move talent across brands without losing history.",
                requiredPlan: "network",
                unlocks: ["Sub-brands", "Cross-roster pool", "Hub-level dashboards"],
              })
            }
          />
          <CompactLockedCard
            title="Hub analytics"
            requiredPlan="network"
            onClick={() =>
              openUpgrade({
                feature: "Hub analytics",
                why: "See booking velocity and roster utilization across all your brands at once.",
                requiredPlan: "network",
              })
            }
          />
        </MoreWithSection>
      )}

      {/* Tenant activity feed (#32) — recent workspace events */}
      <div style={{ marginTop: 28 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 4,
          }}
        >
          <h2
            style={{
              fontFamily: FONTS.display,
              fontSize: 18,
              fontWeight: 500,
              color: COLORS.ink,
              margin: 0,
              letterSpacing: -0.2,
            }}
          >
            Recent activity
          </h2>
          <GhostButton size="sm" onClick={() => toast("Activity feed (prototype)")}>View all</GhostButton>
        </div>
        <div
          style={{
            background: "#fff",
            border: `1px solid ${COLORS.borderSoft}`,
            borderRadius: 12,
            padding: "0 18px",
          }}
        >
          {[
            { actor: "Oran Tene", action: "sent an offer to", target: "Vogue Italia", timestamp: relativeTime(Date.now() - 2 * 60_000), iconName: "mail" as const },
            { actor: "Marta Reyes", action: "accepted hold for", target: "Bvlgari campaign", timestamp: relativeTime(Date.now() - 34 * 60_000), iconName: "check" as const },
            { actor: "Kai Lin", action: "updated profile", target: "measurements + comp card", timestamp: relativeTime(Date.now() - 65 * 60_000), iconName: "user" as const },
            { actor: "System", action: "auto-archived expired inquiry from", target: "H&M (6 weeks old)", timestamp: relativeTime(Date.now() - 3 * 60 * 60_000), iconName: "archive" as const },
          ].map((ev, i, arr) => (
            <div key={i} style={{ borderTop: i > 0 ? `1px solid ${COLORS.borderSoft}` : "none" }}>
              <ActivityFeedItem {...ev} />
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

function OverviewFree() {
  const { state, setPage, openDrawer, openUpgrade, completeTask, toast } = useProto();

  // Live signals that prove a step is "really done" — overrides the
  // user-confirmed Set. Order: real state first, manual confirmation
  // second. This way a returning user with 3 talents already on roster
  // sees "Add your first talent" pre-checked, even if they never clicked
  // the row in this prototype session.
  const liveRoster = getRoster(state.plan);
  const livePublished = liveRoster.filter((t) => t.state === "published").length;
  const liveInquiries = getInquiries(state.plan);
  const liveTeam = getTeam(state.plan);
  const autoComplete: Record<string, boolean> = {
    "add-talent": liveRoster.length > 0,
    publish: livePublished > 0,
    "share-url": false, // genuinely manual — no upstream signal
    "try-inquiry": liveInquiries.length > 0,
    "invite-team": liveTeam.length > 1,
  };
  const isDone = (taskId: string) =>
    state.completedTasks.has(taskId) || !!autoComplete[taskId];
  const completedCount = ACTIVATION_TASKS.filter((t) => isDone(t.id)).length;
  const totalTasks = ACTIVATION_TASKS.length;
  const progressPct = Math.round((completedCount / totalTasks) * 100);

  return (
    <>
      <PageHeader
        eyebrow="Setup"
        title="You're already live."
        subtitle="Five steps to your first booking. About 10 minutes total."
        actions={
          <span
            style={{
              fontFamily: FONTS.body,
              fontSize: 12,
              color: COLORS.inkMuted,
            }}
          >
            {completedCount} of {totalTasks} steps · ~10 min total
          </span>
        }
      />

      {/* Progress strip — gives the user a sense of momentum */}
      <div
        style={{
          background: "#fff",
          border: `1px solid ${COLORS.borderSoft}`,
          borderRadius: 12,
          padding: "12px 16px",
          marginBottom: 16,
          fontFamily: FONTS.body,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            justifyContent: "space-between",
            marginBottom: 8,
          }}
        >
          <span style={{ fontSize: 12, fontWeight: 600, color: COLORS.ink, letterSpacing: 0.3, textTransform: "uppercase" }}>
            First 10 minutes
          </span>
          <span style={{ fontSize: 11.5, color: COLORS.inkMuted }}>
            {progressPct}% complete
          </span>
        </div>
        <div
          style={{
            height: 6,
            background: "rgba(11,11,13,0.06)",
            borderRadius: 999,
            overflow: "hidden",
          }}
        >
          <div
            style={{
              width: `${progressPct}%`,
              height: "100%",
              background: COLORS.ink,
              transition: "width .25s ease",
            }}
          />
        </div>
      </div>

      <StarterCard
        title="Your activation arc"
        subtitle="All five are reversible — skip what you don't need."
      >
        <ol style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 10 }}>
          {ACTIVATION_TASKS.map((task, idx) => {
            const done = isDone(task.id);
            return (
              <li key={task.id}>
                <button
                  type="button"
                  onClick={() => {
                    if (task.drawer) {
                      // Demo-inquiry step — open the prototype's rich inquiry workspace
                      if (task.id === "try-inquiry") {
                        openDrawer("inquiry-workspace", { inquiryId: "RI-201", pov: "admin" });
                        completeTask(task.id);
                      } else {
                        openDrawer(task.drawer, { fromTask: task.id });
                      }
                    } else {
                      completeTask(task.id);
                      toast(`Marked "${task.label}" as done`);
                    }
                  }}
                  style={{
                    background: "#fff",
                    border: `1px solid ${done ? "rgba(46,125,91,0.30)" : COLORS.borderSoft}`,
                    borderRadius: 10,
                    padding: "12px 14px",
                    width: "100%",
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    cursor: "pointer",
                    fontFamily: FONTS.body,
                    textAlign: "left",
                    transition: "border-color .12s",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = "rgba(11,11,13,0.20)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = done
                      ? "rgba(46,125,91,0.30)"
                      : COLORS.borderSoft;
                  }}
                >
                  <span
                    style={{
                      width: 22,
                      height: 22,
                      borderRadius: "50%",
                      border: `1.5px solid ${done ? COLORS.green : "rgba(11,11,13,0.18)"}`,
                      background: done ? COLORS.green : "transparent",
                      color: "#fff",
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                    }}
                  >
                    {done && <Icon name="check" size={13} stroke={2.5} color="#fff" />}
                    {!done && (
                      <span style={{ fontSize: 11, color: COLORS.inkMuted, fontWeight: 600 }}>
                        {idx + 1}
                      </span>
                    )}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: 13.5,
                        color: COLORS.ink,
                        fontWeight: 500,
                        textDecoration: done ? "line-through" : "none",
                        opacity: done ? 0.55 : 1,
                      }}
                    >
                      {task.label}
                    </div>
                    <div
                      style={{
                        fontSize: 11.5,
                        color: COLORS.inkMuted,
                        marginTop: 1,
                        opacity: done ? 0.55 : 1,
                      }}
                    >
                      {done && autoComplete[task.id] && !state.completedTasks.has(task.id)
                        ? "Auto-detected — already done."
                        : task.hint}
                    </div>
                  </div>
                  {!done && (
                    <span
                      style={{
                        fontSize: 10.5,
                        color: COLORS.inkDim,
                        fontFamily: FONTS.body,
                        letterSpacing: 0.3,
                      }}
                    >
                      {task.est}
                    </span>
                  )}
                  <Affordance label={done ? "Done" : "Open"} />
                </button>
              </li>
            );
          })}
        </ol>
      </StarterCard>

      <div style={{ height: 24 }} />

      {/* What you can do TODAY — the value-not-walls panel */}
      <FreeValuePanel />

      <div style={{ height: 24 }} />

      <Grid cols="2">
        <PrimaryCard
          title="Your public storefront"
          description={`Live at ${TENANT.domain}. Anyone with the link can see your published roster.`}
          icon={<Icon name="globe" size={14} stroke={1.7} />}
          meta={<><StatDot tone="green" /> Live</>}
          affordance="Manage visibility"
          onClick={() => openDrawer("storefront-visibility")}
        />
        <PrimaryCard
          title="Your roster"
          description="3 talent profiles. Add more, invite talent to claim, or publish drafts."
          icon={<Icon name="team" size={14} stroke={1.7} />}
          meta="3 profiles · 1 published"
          affordance="Open roster"
          onClick={() => setPage("talent")}
        />
      </Grid>

      <MoreWithSection plan="studio" title="More with Studio">
        <CompactLockedCard
          title="Custom domain"
          requiredPlan="studio"
          onClick={() =>
            openUpgrade({
              feature: "Custom domain",
              why: "Run your storefront at your own brand's domain — not a Tulala subdomain.",
              requiredPlan: "studio",
              unlocks: ["Custom domain (e.g. acme-models.com)", "Verified email-from", "SSL automatic"],
            })
          }
        />
        <CompactLockedCard
          title="Private inquiry inbox"
          requiredPlan="studio"
          onClick={() =>
            openUpgrade({
              feature: "Private inquiries",
              why: "Take inquiries privately on your domain. Your client list stays your own.",
              requiredPlan: "studio",
              unlocks: ["Private inbox", "Owned client list", "Custom email templates"],
            })
          }
        />
        <CompactLockedCard
          title="Hide from Tulala discovery"
          requiredPlan="studio"
          onClick={() =>
            openUpgrade({
              feature: "Stealth mode",
              why: "On Free, your roster appears in our directory. Studio takes you private.",
              requiredPlan: "studio",
            })
          }
        />
      </MoreWithSection>

      <MoreWithSection plan="agency">
        <CompactLockedCard
          title="Branded design system"
          requiredPlan="agency"
          onClick={() =>
            openUpgrade({
              feature: "Branded site design",
              why: "Bring your full visual identity to the storefront — typography, color, layout.",
              requiredPlan: "agency",
              unlocks: ["Theme builder", "Section presets", "Brand tokens"],
            })
          }
        />
        <CompactLockedCard
          title="Custom talent fields"
          requiredPlan="agency"
          onClick={() =>
            openUpgrade({
              feature: "Field catalog",
              why: "Add fields your agency cares about — tags, niches, contracts.",
              requiredPlan: "agency",
            })
          }
        />
        <CompactLockedCard
          title="Team & roles"
          requiredPlan="agency"
          onClick={() =>
            openUpgrade({
              feature: "Team",
              why: "Invite teammates with viewer / editor / coordinator / admin roles.",
              requiredPlan: "agency",
            })
          }
        />
      </MoreWithSection>
    </>
  );
}

// ════════════════════════════════════════════════════════════════════
// INBOX (#8 — unified)
// ════════════════════════════════════════════════════════════════════
/**
 * Single-pane view that joins inquiry threads + 1:1 messages +
 * notifications, grouped by entity. Replaces the fragmented
 * inquiry/messages/notifications drawers as the default mental model.
 *
 * Mock implementation: builds rows from RICH_INQUIRIES with their unread
 * counts and last-activity timestamps. In production this would read from
 * a unified `events` view.
 */
function UnifiedInboxPage() {
  const { openDrawer, toast } = useProto();
  // Use RICH_INQUIRIES so we have nextActionBy / unread / lastActivityHrs.
  const inquiries = RICH_INQUIRIES;
  const [filter, setFilter] = useState<"needs-me" | "all" | "unread">("needs-me");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<"recent" | "oldest" | "client">("recent");
  const [pagesShown, setPagesShown] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const PAGE_SIZE = 8;

  const isOpen = (s: typeof inquiries[number]["stage"]) =>
    s !== "rejected" && s !== "expired";

  const matched = inquiries
    .filter((i) => isOpen(i.stage))
    .filter((i) => {
      if (filter === "needs-me") return i.nextActionBy === "coordinator";
      if (filter === "unread") return i.unreadGroup > 0;
      return true;
    })
    .filter((i) => {
      if (!search.trim()) return true;
      const q = search.trim().toLowerCase();
      return (
        i.clientName.toLowerCase().includes(q) || i.brief.toLowerCase().includes(q)
      );
    })
    .sort((a, b) => {
      if (sort === "client") return a.clientName.localeCompare(b.clientName);
      if (sort === "oldest") return b.lastActivityHrs - a.lastActivityHrs;
      return a.lastActivityHrs - b.lastActivityHrs;
    });

  const rows = matched.slice(0, PAGE_SIZE * pagesShown);

  // Reset pagination + selection when filter / search changes.
  useEffect(() => {
    setPagesShown(1);
  }, [filter, search, sort]);

  // Saved-views payload — capture the active filter; restore on click.
  type InboxView = { filter: typeof filter; sort: typeof sort };
  const onApplyView = (v: InboxView) => {
    setFilter(v.filter);
    setSort(v.sort);
  };

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const clearSelection = () => setSelected(new Set());

  // Keyboard nav refs — populated on render.
  const rowRefs = useRef<(HTMLButtonElement | null)[]>([]);
  useKeyboardListNav({
    rows: rowRefs.current,
    onActivate: (idx) => {
      const inq = rows[idx];
      if (inq) openDrawer("inquiry-workspace", { inquiryId: inq.id });
    },
  });

  const exportCsv = () => {
    downloadCsv(
      `inbox-${new Date().toISOString().slice(0, 10)}.csv`,
      matched.map((i) => ({
        client: i.clientName,
        brief: i.brief,
        stage: INQUIRY_STAGE_META[i.stage].label,
        nextActionBy: i.nextActionBy ?? "",
        unread: i.unreadGroup,
        ageHours: i.lastActivityHrs,
      })),
    );
    toast(`Exported ${matched.length} rows to CSV`);
  };

  return (
    <>
      <PageHeader
        eyebrow="Inbox"
        title="Unified inbox"
        subtitle="Inquiry threads, mentions, and notifications in one place — sorted by what needs you next."
        actions={
          <GhostButton size="sm" onClick={exportCsv}>
            Export CSV
          </GhostButton>
        }
      />
      <SavedViewsBar viewKey="inbox" current={{ filter, sort }} onApply={onApplyView} />

      <BulkSelectBar
        count={selected.size}
        onClear={clearSelection}
        actions={[
          {
            label: "Mark read",
            onClick: () => {
              toast(`Marked ${selected.size} read`);
              clearSelection();
            },
          },
          {
            label: "Snooze 4h",
            onClick: () => {
              toast(`Snoozed ${selected.size} for 4 hours`);
              clearSelection();
            },
          },
          {
            label: "Archive",
            tone: "red",
            onClick: () => {
              toast(`Archived ${selected.size}`);
              clearSelection();
            },
          },
        ]}
      />

      {/* Search + sort row */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          marginBottom: 12,
          flexWrap: "wrap",
        }}
      >
        <div style={{ flex: 1, minWidth: 200 }}>
          <input
            type="text"
            aria-label="Search inbox by client or brief"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by client or brief…"
            style={{
              width: "100%",
              padding: "9px 12px",
              fontFamily: FONTS.body,
              fontSize: 13,
              color: COLORS.ink,
              background: "#fff",
              border: `1px solid ${COLORS.border}`,
              borderRadius: 8,
              outline: "none",
            }}
          />
        </div>
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as typeof sort)}
          aria-label="Sort"
          style={{
            padding: "9px 12px",
            fontFamily: FONTS.body,
            fontSize: 13,
            color: COLORS.ink,
            background: "#fff",
            border: `1px solid ${COLORS.border}`,
            borderRadius: 8,
            cursor: "pointer",
          }}
        >
          <option value="recent">Most recent</option>
          <option value="oldest">Oldest</option>
          <option value="client">Client name</option>
        </select>
      </div>
      <div
        style={{
          display: "flex",
          gap: 6,
          marginBottom: 14,
          flexWrap: "wrap",
        }}
      >
        {(
          [
            { id: "needs-me", label: `Needs me · ${inquiries.filter((i) => i.nextActionBy === "coordinator").length}` },
            { id: "all", label: `All · ${inquiries.filter((i) => isOpen(i.stage)).length}` },
            { id: "unread", label: `Unread · ${inquiries.filter((i) => isOpen(i.stage) && i.unreadGroup > 0).length}` },
          ] as const
        ).map((f) => {
          const active = filter === f.id;
          return (
            <button
              key={f.id}
              type="button"
              onClick={() => setFilter(f.id)}
              style={{
                padding: "6px 12px",
                background: active ? COLORS.ink : "rgba(11,11,13,0.04)",
                color: active ? "#fff" : COLORS.ink,
                border: "none",
                borderRadius: 999,
                cursor: "pointer",
                fontFamily: FONTS.body,
                fontSize: 12,
                fontWeight: 500,
              }}
            >
              {f.label}
            </button>
          );
        })}
        {/* Saved searches (#31) — quick-access saved query chips */}
        {[
          { label: "Awaiting client reply", q: () => { setFilter("needs-me"); } },
          { label: "Unread threads", q: () => { setFilter("unread"); } },
        ].map(({ label, q }) => (
          <button
            key={label}
            type="button"
            onClick={q}
            style={{
              padding: "6px 10px",
              background: "transparent",
              color: COLORS.inkMuted,
              border: `1px dashed ${COLORS.border}`,
              borderRadius: 999,
              cursor: "pointer",
              fontFamily: FONTS.body,
              fontSize: 11.5,
              fontWeight: 500,
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
            }}
          >
            <span aria-hidden style={{ fontSize: 10 }}>🔖</span>
            {label}
          </button>
        ))}

        {/* Clear all filters (#19) — visible when something non-default is active */}
        {(filter !== "needs-me" || search.trim() || sort !== "recent") && (
          <button
            type="button"
            onClick={() => { setFilter("needs-me" as const); setSearch(""); setSort("recent"); }}
            style={{
              padding: "6px 10px",
              background: "transparent",
              color: COLORS.inkMuted,
              border: `1px solid ${COLORS.border}`,
              borderRadius: 999,
              cursor: "pointer",
              fontFamily: FONTS.body,
              fontSize: 11.5,
              fontWeight: 500,
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
            }}
          >
            <span aria-hidden>×</span> Clear
          </button>
        )}
      </div>

      {matched.length > 0 && (filter !== "needs-me" || search.trim() || sort !== "recent") && (
        <div style={{ fontFamily: FONTS.body, fontSize: 12, color: COLORS.inkMuted, marginBottom: 8 }}>
          Showing {matched.length} {matched.length === 1 ? "thread" : "threads"}
          {search.trim() && ` matching "${search.trim()}"`}
        </div>
      )}

      {rows.length === 0 ? (
        <EmptyState
          icon="mail"
          title={search.trim() ? `No results for "${search.trim()}"` : "Inbox zero"}
          body={search.trim() ? "Try a different search term or clear the query." : "Nothing waiting on you in this filter. Switch to All to see everything moving."}
          primaryLabel={search.trim() ? "Clear search" : "Show all threads"}
          onPrimary={() => { if (search.trim()) setSearch(""); else setFilter("all"); }}
        />
      ) : (
        <div
          style={{
            background: "#fff",
            border: `1px solid ${COLORS.borderSoft}`,
            borderRadius: 12,
            overflow: "hidden",
          }}
        >
          {rows.map((inq, idx) => {
            const isOfferPending = inq.stage === "offer_pending";
            const isSelected = selected.has(inq.id);
            return (
              <SwipeableRow
                key={inq.id}
                leftActions={[
                  {
                    label: "Pin",
                    tone: "ink",
                    onClick: () => toast(`Pinned ${inq.clientName}`),
                  },
                ]}
                rightActions={[
                  {
                    label: "Snooze",
                    tone: "ink",
                    onClick: () => toast(`Snoozed ${inq.clientName} 4h`),
                  },
                  {
                    label: "Archive",
                    tone: "red",
                    onClick: () => toast(`Archived ${inq.clientName}`),
                  },
                ]}
              >
                <button
                  type="button"
                  data-tulala-row
                  ref={(el) => {
                    rowRefs.current[idx] = el;
                  }}
                  onClick={() => openDrawer("inquiry-workspace", { inquiryId: inq.id })}
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    gap: 12,
                    width: "100%",
                    padding: "14px 16px",
                    background: isSelected ? COLORS.accentSoft : "#fff",
                    border: "none",
                    borderTop: idx === 0 ? "none" : `1px solid ${COLORS.borderSoft}`,
                    cursor: "pointer",
                    textAlign: "left",
                    fontFamily: FONTS.body,
                  }}
                >
                  <span
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleSelect(inq.id);
                    }}
                    style={{ display: "inline-flex", marginTop: 8 }}
                  >
                    <BulkRowCheckbox
                      checked={isSelected}
                      onChange={() => toggleSelect(inq.id)}
                    />
                  </span>
                  <Avatar
                    initials={inq.clientName.slice(0, 2).toUpperCase()}
                    hashSeed={inq.clientName}
                    size={32}
                    tone="auto"
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: COLORS.ink }}>
                        {inq.clientName}
                      </span>
                      <ClientTrustChip level={inq.clientTrust} compact />
                      {inq.unreadPrivate > 0 && (
                        <span
                          title="Unread in private thread"
                          style={{
                            fontSize: 10,
                            fontWeight: 700,
                            background: COLORS.amber,
                            color: "#fff",
                            padding: "1px 6px",
                            borderRadius: 999,
                          }}
                        >
                          {inq.unreadPrivate} private
                        </span>
                      )}
                      {inq.unreadGroup > 0 && (
                        <span
                          title="Unread in group thread"
                          style={{
                            fontSize: 10,
                            fontWeight: 700,
                            background: COLORS.accent,
                            color: "#fff",
                            padding: "1px 6px",
                            borderRadius: 999,
                          }}
                        >
                          {inq.unreadGroup}
                        </span>
                      )}
                    </div>
                    <div
                      style={{
                        fontSize: 12.5,
                        color: COLORS.inkMuted,
                        marginTop: 2,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {inq.brief}
                    </div>
                    <div
                      style={{
                        display: "flex",
                        gap: 8,
                        marginTop: 6,
                        fontSize: 11,
                        color: COLORS.inkDim,
                        alignItems: "center",
                      }}
                    >
                      <span>{INQUIRY_STAGE_META[inq.stage].label}</span>
                      <Bullet />
                      <span>
                        {inq.lastActivityHrs < 1
                          ? "just now"
                          : inq.lastActivityHrs < 24
                            ? `${Math.round(inq.lastActivityHrs)}h ago`
                            : `${Math.round(inq.lastActivityHrs / 24)}d ago`}
                      </span>
                      {inq.nextActionBy && (
                        <>
                          <Bullet />
                          <span
                            style={{
                              fontSize: 10,
                              fontWeight: 600,
                              padding: "1px 6px",
                              borderRadius: 999,
                              background:
                                inq.nextActionBy === "coordinator"
                                  ? COLORS.accentSoft
                                  : inq.nextActionBy === "client"
                                    ? "rgba(184,134,11,0.10)"
                                    : "rgba(11,11,13,0.06)",
                              color:
                                inq.nextActionBy === "coordinator"
                                  ? COLORS.accent
                                  : inq.nextActionBy === "client"
                                    ? COLORS.amber
                                    : COLORS.ink,
                            }}
                          >
                            {inq.nextActionBy === "coordinator" ? "Needs you"
                              : inq.nextActionBy === "client"    ? "Awaiting client"
                              : inq.nextActionBy === "talent"    ? "Awaiting talent"
                              : `Awaiting ${inq.nextActionBy}`}
                          </span>
                        </>
                      )}
                    </div>
                    {/* Inline quick-reply trio for offer_pending rows.
                        Lets coordinators / clients act without opening
                        the workspace drawer. */}
                    {isOfferPending && (
                      <div
                        style={{ marginTop: 10 }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <QuickReplyButtons
                          onAccept={() => toast(`Accepted offer from ${inq.clientName}`)}
                          onCounter={() => {
                            openDrawer("inquiry-workspace", { inquiryId: inq.id });
                          }}
                          onDecline={() => toast(`Declined offer from ${inq.clientName}`)}
                        />
                      </div>
                    )}
                  </div>
                  <Icon name="chevron-right" size={14} color={COLORS.inkDim} />
                </button>
              </SwipeableRow>
            );
          })}
        </div>
      )}
      <LoadMore
        total={matched.length}
        shown={rows.length}
        onMore={() => setPagesShown((p) => p + 1)}
      />
      {/* FAB — new inquiry, mobile only (#4) */}
      <FloatingFab
        label="New inquiry"
        onClick={() => openDrawer("new-inquiry")}
      />
    </>
  );
}

// ════════════════════════════════════════════════════════════════════
// CALENDAR (#12 — month grid)
// ════════════════════════════════════════════════════════════════════
/**
 * Roster-wide calendar. Lays out a 6×7 month grid; each cell hints at
 * any bookings/holds on that day. Mock — real version reads from a
 * unified events feed.
 */
// ─── Calendar date helpers ────────────────────────────────────────────
// Parse inquiry/booking date strings into arrays of {day, inquiryId} for
// the currently-displayed month. Handles formats the mock data uses:
//   "Tue, May 6"  "May 14–15"  "May 18–20"  "Apr 10"  "Apr 29"
const MONTH_ABBR: Record<string, number> = {
  Jan:0, Feb:1, Mar:2, Apr:3, May:4, Jun:5,
  Jul:6, Aug:7, Sep:8, Oct:9, Nov:10, Dec:11,
};
function parseInquiryDays(dateStr: string, displayMonth: number): number[] {
  // Strip leading weekday prefix ("Tue, " / "Sat, ")
  const s = dateStr.replace(/^(?:Sun|Mon|Tue|Wed|Thu|Fri|Sat),?\s*/, "").trim();
  // Range within a month: "May 14–15" or "May 18–20"
  const rangeM = s.match(/^([A-Z][a-z]{2})\s+(\d+)[–\-](\d+)/);
  if (rangeM) {
    if (MONTH_ABBR[rangeM[1]] !== displayMonth) return [];
    const from = parseInt(rangeM[2], 10);
    const to   = parseInt(rangeM[3], 10);
    return Array.from({ length: to - from + 1 }, (_, i) => from + i);
  }
  // Single day: "Apr 10" or "May 6"
  const singleM = s.match(/^([A-Z][a-z]{2})\s+(\d+)/);
  if (singleM && MONTH_ABBR[singleM[1]] === displayMonth) {
    return [parseInt(singleM[2], 10)];
  }
  return [];
}

function CalendarPage() {
  const { openDrawer } = useProto();
  const inquiries = RICH_INQUIRIES;
  const today = new Date();
  const [displayYear, setDisplayYear] = useState(today.getFullYear());
  const [displayMonth, setDisplayMonth] = useState(today.getMonth());
  const year = displayYear;
  const month = displayMonth;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstWeekday = new Date(year, month, 1).getDay(); // 0 = Sun

  // Build event map from real inquiry dates — no hash guessing.
  const events: Record<number, { id: string; title: string; tone: "ink" | "green" | "amber" | "red" }[]> = {};
  inquiries.forEach((inq) => {
    if (!inq.date) return;
    const days = parseInquiryDays(inq.date, month);
    if (days.length === 0) return;
    const tone =
      inq.stage === "booked" || inq.stage === "approved" ? "green"
      : inq.stage === "rejected" || inq.stage === "expired" ? "red"
      : inq.stage === "submitted" ? "amber"
      : "ink";
    days.forEach((d) => {
      events[d] = events[d] ?? [];
      events[d].push({
        id: inq.id,
        title: `${inq.clientName} — ${inq.brief.slice(0, 20)}`,
        tone,
      });
    });
  });

  const monthLabel = new Date(year, month, 1).toLocaleString("en-US", { month: "long", year: "numeric" });
  const isCurrentMonth = year === today.getFullYear() && month === today.getMonth();
  const goToPrev = () => {
    if (month === 0) { setDisplayMonth(11); setDisplayYear((y) => y - 1); }
    else setDisplayMonth((m) => m - 1);
  };
  const goToNext = () => {
    if (month === 11) { setDisplayMonth(0); setDisplayYear((y) => y + 1); }
    else setDisplayMonth((m) => m + 1);
  };
  const goToToday = () => { setDisplayYear(today.getFullYear()); setDisplayMonth(today.getMonth()); };

  return (
    <>
      <PageHeader
        eyebrow="Calendar"
        title="Roster calendar"
        subtitle="Confirmed bookings, holds, and blocked dates across all your talent. Click a day to drill in."
        actions={
          <SecondaryButton onClick={() => openDrawer("new-booking")}>
            New booking
          </SecondaryButton>
        }
      />
      <div
        style={{
          background: "#fff",
          border: `1px solid ${COLORS.borderSoft}`,
          borderRadius: 12,
          overflow: "hidden",
          fontFamily: FONTS.body,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "12px 14px",
            borderBottom: `1px solid ${COLORS.borderSoft}`,
          }}
        >
          <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: COLORS.ink }}>{monthLabel}</div>
            {/* Timezone display (#11) */}
            <div
              title="All times are local to the talent's shoot location. Adjust in Settings → Time zones."
              style={{
                fontSize: 10.5,
                fontWeight: 500,
                color: COLORS.inkMuted,
                background: COLORS.surfaceAlt,
                padding: "2px 6px",
                borderRadius: 5,
                cursor: "default",
              }}
            >
              {Intl.DateTimeFormat().resolvedOptions().timeZone.replace("_", " ")} ·{" "}
              {new Intl.DateTimeFormat("en-US", { timeZoneName: "short" })
                .formatToParts(new Date())
                .find((p) => p.type === "timeZoneName")?.value ?? "local"}
            </div>
          </div>
          <div style={{ display: "flex", gap: 4 }}>
            <CalendarNavBtn label="prev" onClick={goToPrev} />
            <CalendarNavBtn label="Today" onClick={goToToday} disabled={isCurrentMonth} />
            <CalendarNavBtn label="next" onClick={goToNext} />
          </div>
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(7, 1fr)",
            background: "rgba(11,11,13,0.02)",
            borderBottom: `1px solid ${COLORS.borderSoft}`,
          }}
        >
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
            <div
              key={d}
              style={{
                padding: "8px 10px",
                fontSize: 11,
                fontWeight: 600,
                letterSpacing: 0.5,
                textTransform: "uppercase",
                color: COLORS.inkMuted,
              }}
            >
              {d}
            </div>
          ))}
        </div>
        <div
          role="grid"
          aria-label={`Calendar — ${monthLabel}`}
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(7, 1fr)",
            gridAutoRows: "minmax(96px, auto)",
          }}
        >
          {Array.from({ length: firstWeekday }).map((_, i) => (
            <div key={`pad-${i}`} role="gridcell" aria-hidden style={{ background: "rgba(11,11,13,0.015)" }} />
          ))}
          {Array.from({ length: daysInMonth }).map((_, i) => {
            const day = i + 1;
            const dayEvents = events[day] ?? [];
            const isToday = day === today.getDate();
            const isoDate = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
            const ariaLabel = `${monthLabel.split(" ")[0]} ${day}${dayEvents.length > 0 ? `, ${dayEvents.length} ${dayEvents.length === 1 ? "event" : "events"}` : ""}${isToday ? " (today)" : ""}`;
            return (
              <div
                key={day}
                role="gridcell"
                aria-label={ariaLabel}
                tabIndex={0}
                onClick={() => openDrawer("day-detail", { date: isoDate })}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openDrawer("day-detail", { date: isoDate }); } }}
                style={{
                  padding: "8px 10px",
                  borderTop: `1px solid ${COLORS.borderSoft}`,
                  borderLeft: i % 7 === 0 ? "none" : `1px solid ${COLORS.borderSoft}`,
                  display: "flex",
                  flexDirection: "column",
                  gap: 4,
                  cursor: "pointer",
                  transition: "background .1s",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(11,11,13,0.025)")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
              >
                <div
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    width: isToday ? 22 : "auto",
                    height: isToday ? 22 : "auto",
                    background: isToday ? COLORS.accent : "transparent",
                    borderRadius: isToday ? 999 : 0,
                    fontSize: 12,
                    fontWeight: isToday ? 700 : 500,
                    color: isToday ? "#fff" : COLORS.ink,
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {day}
                </div>
                {dayEvents.slice(0, 2).map((e, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={(ev) => { ev.stopPropagation(); openDrawer("inquiry-workspace", { inquiryId: e.id }); }}
                    style={{
                      fontSize: 10.5,
                      color: e.tone === "green" ? COLORS.green : e.tone === "amber" ? COLORS.amber : e.tone === "red" ? "#c0392b" : COLORS.ink,
                      background:
                        e.tone === "green"  ? "rgba(46,125,91,0.09)"
                        : e.tone === "amber" ? "rgba(184,134,11,0.10)"
                        : e.tone === "red"   ? "rgba(192,57,43,0.08)"
                        : "rgba(11,11,13,0.05)",
                      padding: "2px 6px",
                      borderRadius: 5,
                      border: "none",
                      fontWeight: 500,
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      cursor: "pointer",
                      fontFamily: FONTS.body,
                      textAlign: "left",
                      width: "100%",
                    }}
                  >
                    {e.title}
                  </button>
                ))}
                {dayEvents.length > 2 && (
                  <span style={{ fontSize: 10, color: COLORS.accent, fontWeight: 600 }}>
                    +{dayEvents.length - 2} more
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}

function CalendarNavBtn({ label, onClick, disabled }: { label: string; onClick?: () => void; disabled?: boolean }) {
  const ariaLabel = label === "prev" ? "Previous month" : label === "next" ? "Next month" : label;
  const content =
    label === "prev" ? (
      <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
        <path d="M15 6l-6 6 6 6" />
      </svg>
    ) : label === "next" ? (
      <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
        <path d="M9 6l6 6-6 6" />
      </svg>
    ) : (
      label
    );
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      onClick={onClick}
      disabled={disabled}
      style={{
        padding: label === "Today" ? "5px 10px" : "5px 8px",
        background: "transparent",
        border: `1px solid ${COLORS.borderSoft}`,
        borderRadius: 6,
        cursor: disabled ? "default" : "pointer",
        fontFamily: FONTS.body,
        fontSize: 12,
        color: disabled ? COLORS.inkDim : COLORS.inkMuted,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        transition: "border-color .12s, color .12s",
        opacity: disabled ? 0.5 : 1,
      }}
      onMouseEnter={(e) => { if (!disabled) { e.currentTarget.style.borderColor = COLORS.border; e.currentTarget.style.color = COLORS.ink; } }}
      onMouseLeave={(e) => { if (!disabled) { e.currentTarget.style.borderColor = COLORS.borderSoft; e.currentTarget.style.color = COLORS.inkMuted; } }}
    >
      {content}
    </button>
  );
}

// ════════════════════════════════════════════════════════════════════
// WORK
// ════════════════════════════════════════════════════════════════════

function WorkPage() {
  const { state, openDrawer, openUpgrade, toast } = useProto();
  const inquiries = getInquiries(state.plan);
  const canEdit = meetsRole(state.role, "coordinator");
  const isFree = state.plan === "free";

  /**
   * Pipeline list source filter. Mirrors RichInquiry.source.kind — "all"
   * passes through, anything else narrows to that origin kind.
   */
  type SourceKind = "all" | "direct" | "hub" | "manual" | "marketplace";
  const [sourceFilter, setSourceFilter] = useState<SourceKind>("all");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<"newest" | "oldest" | "client" | "amount">("newest");

  const matchRich = (iq: { client: string; brief: string }) =>
    RICH_INQUIRIES.find(
      (r) => r.clientName === iq.client && r.brief === iq.brief,
    ) ?? RICH_INQUIRIES.find((r) => r.clientName === iq.client);

  const filteredInquiries = inquiries
    .filter((iq) => sourceFilter === "all" || matchRich(iq)?.source.kind === sourceFilter)
    .filter((iq) => {
      if (!search.trim()) return true;
      const q = search.trim().toLowerCase();
      return iq.client.toLowerCase().includes(q) || iq.brief.toLowerCase().includes(q);
    })
    .sort((a, b) => {
      if (sort === "client") return a.client.localeCompare(b.client);
      if (sort === "amount") {
        const an = parseInt((a.amount ?? "0").replace(/[^\d]/g, "")) || 0;
        const bn = parseInt((b.amount ?? "0").replace(/[^\d]/g, "")) || 0;
        return bn - an;
      }
      // mock: stable order; "oldest" reverses insertion order
      return sort === "oldest" ? 1 : -1;
    });

  const exportCsv = () => {
    downloadCsv(
      `pipeline-${new Date().toISOString().slice(0, 10)}.csv`,
      filteredInquiries.map((iq) => ({
        client: iq.client,
        brief: iq.brief,
        talent: iq.talent ?? "",
        stage: iq.stage,
        amount: iq.amount ?? "",
        source: matchRich(iq)?.source.kind ?? "",
      })),
    );
    toast(`Exported ${filteredInquiries.length} rows`);
  };

  const drafts = inquiries.filter((i) => i.stage === "draft" || i.stage === "hold");
  const awaiting = inquiries.filter((i) => i.stage === "awaiting-client");
  const confirmed = inquiries.filter((i) => i.stage === "confirmed");

  return (
    <>
      <PageHeader
        eyebrow="Workflow"
        title="In-flight work"
        subtitle="Every open inquiry grouped by where it's stuck — from first brief to confirmed booking."
        actions={
          <>
            <GhostButton size="sm" onClick={exportCsv}>Export CSV</GhostButton>
            {!canEdit && <ReadOnlyChip />}
            {canEdit && (
              <PrimaryButton onClick={() => openDrawer("new-inquiry")}>
                New inquiry
              </PrimaryButton>
            )}
          </>
        }
      />

      <Grid cols="3">
        <StatusCard
          label="Drafts & holds"
          value={drafts.length}
          caption="not yet sent"
          tone="amber"
          onClick={() => openDrawer("drafts-holds")}
        />
        <StatusCard
          label="Awaiting client"
          value={awaiting.length}
          caption="offers sent"
          tone="amber"
          onClick={() => openDrawer("awaiting-client")}
        />
        <StatusCard
          label="Confirmed"
          value={confirmed.length}
          caption="this week"
          tone="green"
          onClick={() => openDrawer("confirmed-bookings")}
        />
      </Grid>

      <div style={{ height: 28 }} />

      {/* Pipeline list */}
      <section>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 12,
          }}
        >
          <div>
            <h2
              style={{
                fontFamily: FONTS.display,
                fontSize: 20,
                fontWeight: 500,
                color: COLORS.ink,
                margin: 0,
                letterSpacing: -0.2,
              }}
            >
              Active pipeline
            </h2>
            {(search.trim() || sourceFilter !== "all" || sort !== "newest") && (
              <div style={{ fontFamily: FONTS.body, fontSize: 12, color: COLORS.inkMuted, marginTop: 2 }}>
                {filteredInquiries.length} {filteredInquiries.length === 1 ? "result" : "results"}
                {search.trim() && ` for "${search.trim()}"`}
              </div>
            )}
          </div>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <input
              type="text"
              aria-label="Search pipeline by client or brief"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search client or brief…"
              style={{
                padding: "7px 10px",
                fontFamily: FONTS.body,
                fontSize: 12.5,
                color: COLORS.ink,
                background: "#fff",
                border: `1px solid ${COLORS.border}`,
                borderRadius: 7,
                outline: "none",
                width: 180,
              }}
            />
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as typeof sort)}
              aria-label="Sort"
              style={{
                padding: "7px 10px",
                fontFamily: FONTS.body,
                fontSize: 12.5,
                color: COLORS.ink,
                background: "#fff",
                border: `1px solid ${COLORS.border}`,
                borderRadius: 7,
                cursor: "pointer",
              }}
            >
              <option value="newest">Newest</option>
              <option value="oldest">Oldest</option>
              <option value="client">Client</option>
              <option value="amount">Amount</option>
            </select>
            <SourceFilterChips value={sourceFilter} onChange={setSourceFilter} />
            {(search.trim() || sort !== "newest" || sourceFilter !== "all") && (
              <button
                type="button"
                onClick={() => { setSearch(""); setSort("newest"); setSourceFilter("all"); }}
                style={{
                  padding: "4px 10px",
                  background: "transparent",
                  color: COLORS.inkMuted,
                  border: `1px solid ${COLORS.border}`,
                  borderRadius: 999,
                  cursor: "pointer",
                  fontFamily: FONTS.body,
                  fontSize: 11.5,
                  fontWeight: 500,
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                }}
              >
                <span aria-hidden>×</span> Clear
              </button>
            )}
            <GhostButton onClick={() => openDrawer("filter-config")}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                <Icon name="filter" size={12} stroke={1.7} />
                Filter
              </span>
            </GhostButton>
          </div>
        </div>
        <div
          style={{
            background: "#fff",
            borderRadius: 12,
            border: `1px solid ${COLORS.borderSoft}`,
            overflow: "hidden",
          }}
        >
          {filteredInquiries.length === 0 && (
            <EmptyState
              icon="mail"
              title={search.trim() ? `No results for "${search.trim()}"` : "No inquiries match"}
              body={search.trim() ? "Try a different search term or clear the query." : "When a brief comes in via this channel, it'll show up here. You can also log one manually."}
              primaryLabel={search.trim() ? "Clear search" : "New inquiry"}
              onPrimary={() => { if (search.trim()) setSearch(""); else openDrawer("new-inquiry"); }}
            />
          )}
          {filteredInquiries.length > 0 && (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "minmax(0,1.4fr) minmax(0,2fr) 110px 110px 70px",
                gap: 14,
                padding: "9px 18px",
                background: "rgba(11,11,13,0.02)",
                borderBottom: `1px solid ${COLORS.borderSoft}`,
                fontFamily: FONTS.body,
                fontSize: 10.5,
                fontWeight: 600,
                letterSpacing: 1,
                textTransform: "uppercase",
                color: COLORS.inkMuted,
              }}
            >
              <span>Client · brief</span>
              <span>Talent</span>
              <span>Stage</span>
              <span>Amount</span>
              <span />
            </div>
          )}
          {filteredInquiries.map((iq, idx) => {
            const rich = matchRich(iq);
            return (
            <button
              key={iq.id}
              onClick={() => {
                if (rich) {
                  openDrawer("inquiry-workspace", { inquiryId: rich.id, pov: "admin" });
                } else {
                  openDrawer("inquiry-peek", { id: iq.id });
                }
              }}
              style={{
                display: "grid",
                gridTemplateColumns: "minmax(0,1.4fr) minmax(0,2fr) 110px 110px 70px",
                alignItems: "center",
                gap: 14,
                padding: "13px 18px",
                background: "transparent",
                border: "none",
                borderTop: idx > 0 ? `1px solid ${COLORS.borderSoft}` : "none",
                cursor: "pointer",
                fontFamily: FONTS.body,
                textAlign: "left",
                width: "100%",
                transition: "background .1s",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(11,11,13,0.025)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
            >
              <div style={{ minWidth: 0 }}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    flexWrap: "wrap",
                  }}
                >
                  <span
                    style={{
                      fontSize: 13.5,
                      fontWeight: 600,
                      color: COLORS.ink,
                      letterSpacing: -0.05,
                    }}
                  >
                    {iq.client}
                  </span>
                  {rich && <ClientTrustChip level={rich.clientTrust} compact />}
                  {rich && <SourceChip source={rich.source} />}
                </div>
                <div style={{ fontSize: 11.5, color: COLORS.inkMuted, marginTop: 1 }}>
                  {iq.brief}
                </div>
              </div>
              <div style={{ fontSize: 12, color: COLORS.inkMuted, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {iq.talent.join(", ")}
              </div>
              <div>
                <StageBadge stage={iq.stage} />
              </div>
              <div style={{ fontSize: 12, color: COLORS.inkMuted }}>
                {iq.amount ?? "—"}
              </div>
              <div style={{ display: "flex", justifyContent: "flex-end" }}>
                <Icon name="chevron-right" size={14} color={COLORS.inkDim} />
              </div>
            </button>
            );
          })}
        </div>
      </section>

      {isFree && (
        <MoreWithSection plan="studio">
          <CompactLockedCard
            title="Private inquiry inbox"
            requiredPlan="studio"
            onClick={() =>
              openUpgrade({
                feature: "Private inquiries",
                why: "Take inquiries on your own domain — keep your client list private.",
                requiredPlan: "studio",
              })
            }
          />
          <CompactLockedCard
            title="Custom email templates"
            requiredPlan="studio"
            onClick={() =>
              openUpgrade({
                feature: "Email templates",
                why: "Send branded offers and updates from your own email-from address.",
                requiredPlan: "studio",
              })
            }
          />
        </MoreWithSection>
      )}
      {canEdit && (
        <FloatingFab
          label="New inquiry"
          onClick={() => openDrawer("new-inquiry")}
        />
      )}
    </>
  );
}

/**
 * Origin chip rendered next to the client name on a pipeline row. Uses
 * `describeSource` so the visible text always reflects what's in state —
 * e.g. "via acme-models.com", "via Tulala Hub", "added by email".
 * Kept tiny and outline-styled so it never competes with stage colour.
 */
function SourceChip({ source }: { source: InquirySource }) {
  const d = describeSource(source);
  return (
    <span
      title={d.long}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        padding: "1px 7px",
        background: "transparent",
        color: COLORS.inkMuted,
        border: `1px solid ${COLORS.borderSoft}`,
        fontFamily: FONTS.body,
        fontSize: 10.5,
        fontWeight: 500,
        letterSpacing: 0.2,
        borderRadius: 999,
        whiteSpace: "nowrap",
      }}
    >
      {d.short}
    </span>
  );
}

/**
 * Compact source-filter row above the pipeline. Lives inline rather than
 * in a drawer because filtering by origin is a primary slicing axis for
 * the coordinator (a hub-forwarded inquiry behaves differently).
 */
function SourceFilterChips({
  value,
  onChange,
}: {
  value: "all" | "direct" | "hub" | "manual" | "marketplace";
  onChange: (v: "all" | "direct" | "hub" | "manual" | "marketplace") => void;
}) {
  const opts: { v: typeof value; label: string }[] = [
    { v: "all", label: "All sources" },
    { v: "direct", label: "Direct" },
    { v: "hub", label: "Hub" },
    { v: "manual", label: "Manual" },
    { v: "marketplace", label: "Marketplace" },
  ];
  return (
    <div
      style={{
        display: "inline-flex",
        background: "rgba(11,11,13,0.04)",
        borderRadius: 999,
        padding: 2,
        gap: 0,
      }}
    >
      {opts.map((o) => {
        const active = value === o.v;
        return (
          <button
            key={o.v}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(o.v)}
            style={{
              border: "none",
              background: active ? "#fff" : "transparent",
              color: active ? COLORS.ink : COLORS.inkMuted,
              fontFamily: FONTS.body,
              fontSize: 11.5,
              fontWeight: active ? 600 : 500,
              padding: "4px 10px",
              borderRadius: 999,
              cursor: "pointer",
              whiteSpace: "nowrap",
              boxShadow: active ? "0 1px 2px rgba(11,11,13,0.06)" : "none",
              transition: "background .12s, color .12s",
            }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Pipeline-stage badge. Translates stage id → label + tone, then delegates
 * to the StatusPill primitive.
 */
function StageBadge({ stage }: { stage: string }) {
  const map: Record<string, { label: string; tone: "ink" | "amber" | "green" | "dim" | "red" }> = {
    draft: { label: "Draft", tone: "dim" },
    hold: { label: "On hold", tone: "amber" },
    "awaiting-client": { label: "Awaiting client", tone: "amber" },
    confirmed: { label: "Confirmed", tone: "green" },
    archived: { label: "Archived", tone: "dim" },
  };
  const m = map[stage] ?? { label: stage, tone: "dim" as const };
  return <StatusPill tone={m.tone} label={m.label} />;
}

/**
 * "Today on Free" — the value-not-walls panel. Replaces the old "here's
 * what's locked" framing with an honest list of what works on Free, plus
 * concrete usage caps shown as soft progress bars (not blockers). When a
 * cap nears 80% we surface a one-line upgrade nudge inline.
 *
 * Why: the prior architecture made Free feel like a sandbox with all the
 * doors locked. The actual model is "your agency is live, with caps." We
 * now lead with that.
 */
function FreeValuePanel() {
  const { setPage, openDrawer } = useProto();
  return (
    <div
      style={{
        background: "#fff",
        border: `1px solid ${COLORS.borderSoft}`,
        borderRadius: 12,
        padding: "18px 20px",
        fontFamily: FONTS.body,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          marginBottom: 14,
        }}
      >
        <div>
          <div
            style={{
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: 0.6,
              textTransform: "uppercase",
              color: COLORS.inkMuted,
              marginBottom: 4,
            }}
          >
            Today on Free
          </div>
          <div
            style={{
              fontFamily: FONTS.display,
              fontSize: 18,
              fontWeight: 500,
              letterSpacing: -0.1,
              color: COLORS.ink,
            }}
          >
            What works right now
          </div>
        </div>
        <GhostButton onClick={() => openDrawer("plan-compare")}>
          Compare plans →
        </GhostButton>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
        {FREE_PLAN_VALUE.map((v, idx) => {
          const pct = v.used ? Math.min(100, Math.round((v.used.current / v.used.cap) * 100)) : 0;
          const near = v.used ? pct >= 80 : false;
          return (
            <div
              key={v.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 14,
                padding: "12px 0",
                borderTop: idx === 0 ? "none" : `1px solid ${COLORS.borderSoft}`,
              }}
            >
              <span
                style={{
                  width: 18,
                  height: 18,
                  borderRadius: 999,
                  background: COLORS.green,
                  color: "#fff",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                <Icon name="check" size={11} stroke={2.5} color="#fff" />
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.ink }}>
                  {v.label}
                </div>
                <div style={{ fontSize: 11.5, color: COLORS.inkMuted, marginTop: 1 }}>
                  {v.detail}
                </div>
              </div>
              {v.used && (
                <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
                  <span
                    style={{
                      fontFamily: FONTS.mono,
                      fontSize: 11,
                      color: near ? COLORS.amber : COLORS.inkMuted,
                      letterSpacing: 0.2,
                    }}
                  >
                    {v.used.current} / {v.used.cap} {v.used.unit}
                  </span>
                  <div
                    style={{
                      width: 60,
                      height: 4,
                      background: "rgba(11,11,13,0.06)",
                      borderRadius: 999,
                      overflow: "hidden",
                    }}
                  >
                    <div
                      style={{
                        width: `${pct}%`,
                        height: "100%",
                        background: near ? COLORS.amber : COLORS.ink,
                      }}
                    />
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          marginTop: 14,
          paddingTop: 14,
          borderTop: `1px solid ${COLORS.borderSoft}`,
        }}
      >
        <span style={{ fontSize: 12, color: COLORS.inkMuted, flex: 1 }}>
          Caps are soft. We'll nudge before you run out — never block mid-conversation.
        </span>
        <SecondaryButton onClick={() => setPage("talent")}>Open roster</SecondaryButton>
        <PrimaryButton onClick={() => setPage("work")}>See pipeline</PrimaryButton>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════
// TALENT
// ════════════════════════════════════════════════════════════════════

/** Next plan up that lifts the roster cap. Network has no further upgrade. */
function nextPlanForRoster(plan: Plan): Plan | null {
  if (plan === "free") return "studio";
  if (plan === "studio") return "agency";
  if (plan === "agency") return "network";
  return null;
}

function TalentPage() {
  const { state, openDrawer, openUpgrade, toast } = useProto();
  const roster = getRoster(state.plan);
  const canEdit = meetsRole(state.role, "editor");
  const isFree = state.plan === "free";

  const [search, setSearch] = useState("");
  const [stateFilter, setStateFilter] = useState<"all" | "published" | "draft" | "invited" | "awaiting-approval">("all");
  const [sort, setSort] = useState<"name" | "newest" | "state">("name");

  const filteredRoster = roster
    .filter((p) => stateFilter === "all" || p.state === stateFilter)
    .filter((p) => {
      if (!search.trim()) return true;
      const q = search.trim().toLowerCase();
      return (
        p.name.toLowerCase().includes(q) ||
        (p.city ?? "").toLowerCase().includes(q) ||
        (p.height ?? "").toLowerCase().includes(q)
      );
    })
    .sort((a, b) => {
      if (sort === "name") return a.name.localeCompare(b.name);
      if (sort === "state") return a.state.localeCompare(b.state);
      return 0; // newest = source order
    });

  const counts = {
    published: roster.filter((r) => r.state === "published").length,
    draft: roster.filter((r) => r.state === "draft").length,
    invited: roster.filter((r) => r.state === "invited").length,
    awaiting: roster.filter((r) => r.state === "awaiting-approval").length,
  };

  const exportCsv = () => {
    downloadCsv(
      `roster-${new Date().toISOString().slice(0, 10)}.csv`,
      filteredRoster.map((p) => ({
        name: p.name,
        state: p.state,
        height: p.height ?? "",
        city: p.city ?? "",
        representation: p.representation ?? "",
      })),
    );
    toast(`Exported ${filteredRoster.length} rows`);
  };

  // Roster cap is per-plan; only relevant for non-network tenants on the agency surface.
  const rosterCap =
    state.entityType === "agency"
      ? state.plan === "free"
        ? 5
        : state.plan === "studio"
          ? 50
          : state.plan === "agency"
            ? 200
            : null
      : null;

  const entityMeta = ENTITY_TYPE_META[state.entityType];
  return (
    <>
      <PageHeader
        eyebrow={state.entityType === "hub" ? "Network" : "Talent"}
        title={entityMeta.rosterLabel}
        subtitle={
          state.entityType === "hub"
            ? "Independent members listed in your network. Each one moves through invited → onboarded → live → featured."
            : "Profiles you represent. Each one moves through draft → invited → published → claimed."
        }
        actions={
          <>
            <GhostButton size="sm" onClick={exportCsv}>Export CSV</GhostButton>
            {!canEdit && <ReadOnlyChip />}
            {canEdit && (
              <>
                {/* Bulk import (#21) */}
                <GhostButton
                  size="sm"
                  onClick={() => toast("Bulk import CSV — upload a .csv with name, email, city, height columns.")}
                >
                  Import CSV
                </GhostButton>
                <PrimaryButton onClick={() => openDrawer("new-talent")}>
                  {state.entityType === "hub" ? "Invite member" : "Add talent"}
                </PrimaryButton>
              </>
            )}
          </>
        }
      />

      {state.alsoTalent && (
        <div
          style={{
            background: "#fff",
            border: `1px solid ${COLORS.borderSoft}`,
            borderRadius: 12,
            padding: "12px 16px",
            display: "flex",
            alignItems: "center",
            gap: 12,
            marginBottom: 16,
          }}
        >
          <Avatar initials="OT" size={32} tone="ink" />
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: FONTS.body, fontSize: 13, color: COLORS.ink, fontWeight: 600 }}>
              You're also on this roster
            </div>
            <div style={{ fontFamily: FONTS.body, fontSize: 12, color: COLORS.inkMuted, marginTop: 1 }}>
              You can edit your own profile from the avatar menu — what bookers see is what shows in your public listing.
            </div>
          </div>
          <SecondaryButton size="sm" onClick={() => openDrawer("my-profile")}>
            Edit my profile
          </SecondaryButton>
        </div>
      )}

      <Grid cols="4">
        <StatusCard label="Published" value={counts.published} tone="green" />
        <StatusCard label="Awaiting approval" value={counts.awaiting} tone="amber" />
        <StatusCard label="Invited" value={counts.invited} tone="amber" />
        <StatusCard label="Drafts" value={counts.draft} tone="dim" />
      </Grid>

      <div style={{ height: 24 }} />

      {rosterCap !== null && nextPlanForRoster(state.plan) && (
        <CapNudge
          label="talents"
          current={roster.length}
          cap={rosterCap}
          onUpgrade={() => {
            const next = nextPlanForRoster(state.plan)!;
            openUpgrade({
              feature: `${PLAN_META[next].label} — room to grow`,
              outcome:
                roster.length >= rosterCap
                  ? "You're at the limit. Upgrade and add the next talent immediately."
                  : "Stay ahead of the cap so you never have to turn talent away.",
              requiredPlan: next,
              currentUsage: { label: "Talents on your roster", current: roster.length, cap: rosterCap },
              unlocks:
                next === "studio"
                  ? ["Up to 50 talents", "Custom domain", "Owned client list", "Private inquiries"]
                  : next === "agency"
                    ? ["Up to 200 talents", "Branded site design", "Custom fields", "Team & roles up to 25"]
                    : ["Unlimited talents", "Multi-brand workspaces", "Cross-roster pool", "Hub-level analytics"],
            });
          }}
        />
      )}

      {/* Roster grid */}
      <section>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 12,
          }}
        >
          <h2
            style={{
              fontFamily: FONTS.display,
              fontSize: 20,
              fontWeight: 500,
              color: COLORS.ink,
              margin: 0,
              letterSpacing: -0.2,
            }}
          >
            All talent
          </h2>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <input
              type="text"
              aria-label="Search roster by name or city"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name / city…"
              style={{
                padding: "7px 10px",
                fontFamily: FONTS.body,
                fontSize: 12.5,
                color: COLORS.ink,
                background: "#fff",
                border: `1px solid ${COLORS.border}`,
                borderRadius: 7,
                outline: "none",
                width: 180,
              }}
            />
            <select
              value={stateFilter}
              onChange={(e) => setStateFilter(e.target.value as typeof stateFilter)}
              aria-label="Filter by state"
              style={selectStyle}
            >
              <option value="all">All states</option>
              <option value="published">Published</option>
              <option value="draft">Draft</option>
              <option value="invited">Invited</option>
              <option value="awaiting-approval">Awaiting approval</option>
            </select>
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as typeof sort)}
              aria-label="Sort"
              style={selectStyle}
            >
              <option value="name">Name</option>
              <option value="newest">Newest</option>
              <option value="state">State</option>
            </select>
            {(search.trim() || stateFilter !== "all" || sort !== "name") && (
              <button
                type="button"
                onClick={() => { setSearch(""); setStateFilter("all"); setSort("name"); }}
                style={{
                  padding: "4px 10px",
                  background: "transparent",
                  color: COLORS.inkMuted,
                  border: `1px solid ${COLORS.border}`,
                  borderRadius: 999,
                  cursor: "pointer",
                  fontFamily: FONTS.body,
                  fontSize: 11.5,
                  fontWeight: 500,
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                }}
              >
                <span aria-hidden>×</span> Clear
              </button>
            )}
            {state.plan === "agency" && (
              <GhostButton onClick={() => openDrawer("taxonomy")}>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                  <Icon name="settings" size={12} stroke={1.7} />
                  Taxonomy
                </span>
              </GhostButton>
            )}
          </div>
        </div>
        {filteredRoster.length === 0 ? (
          <EmptyState
            icon="user"
            title={search.trim() ? `No results for "${search.trim()}"` : "No talent matches"}
            body={search.trim() ? "Try a different name or city, or clear the search." : "Try a different search or clear the state filter."}
            primaryLabel="Clear filters"
            onPrimary={() => {
              setSearch("");
              setStateFilter("all");
              setSort("name");
            }}
          />
        ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
            gap: 12,
          }}
        >
          {filteredRoster.map((profile) => (
            <button
              key={profile.id}
              onClick={() => openDrawer("talent-profile", { id: profile.id })}
              style={{
                background: "#fff",
                border: `1px solid ${COLORS.borderSoft}`,
                borderRadius: 12,
                padding: 14,
                cursor: "pointer",
                display: "flex",
                flexDirection: "column",
                gap: 10,
                textAlign: "left",
                fontFamily: FONTS.body,
                transition: "border-color .12s, box-shadow .12s",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = "rgba(11,11,13,0.18)";
                e.currentTarget.style.boxShadow = "0 6px 20px -10px rgba(11,11,13,0.18)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = COLORS.borderSoft;
                e.currentTarget.style.boxShadow = "none";
              }}
            >
              <div
                style={{
                  aspectRatio: "3 / 4",
                  background: COLORS.surfaceAlt,
                  borderRadius: 8,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  position: "relative",
                  overflow: "hidden",
                }}
              >
                <Avatar
                  initials={profile.name.split(" ").map((w: string) => w[0]).join("").slice(0, 2).toUpperCase()}
                  hashSeed={profile.name}
                  size={72}
                  tone="auto"
                />
                <div style={{ position: "absolute", bottom: 8, left: 8 }}>
                  <StateChip state={profile.state} label={TALENT_STATE_LABEL[profile.state]} />
                </div>
              </div>
              <div>
                <div
                  style={{
                    fontFamily: FONTS.display,
                    fontSize: 16,
                    fontWeight: 500,
                    color: COLORS.ink,
                    letterSpacing: -0.1,
                  }}
                >
                  {profile.name}
                </div>
                <div style={{ fontSize: 11.5, color: COLORS.inkMuted, marginTop: 2 }}>
                  {profile.height} <Bullet /> {profile.city}
                </div>
              </div>
            </button>
          ))}
        </div>
        )}
      </section>

      {isFree && (
        <MoreWithSection plan="agency">
          <CompactLockedCard
            title="Custom roster fields"
            requiredPlan="agency"
            onClick={() =>
              openUpgrade({
                feature: "Field catalog",
                why: "Add the fields your agency actually books on — measurements, contracts, niches.",
                requiredPlan: "agency",
                unlocks: ["Custom fields", "Required vs optional", "Per-roster taxonomy"],
              })
            }
          />
          <CompactLockedCard
            title="Bulk publish"
            requiredPlan="agency"
            onClick={() =>
              openUpgrade({
                feature: "Bulk operations",
                why: "Publish, invite or archive multiple profiles at once.",
                requiredPlan: "agency",
              })
            }
          />
          <CompactLockedCard
            title="Approval workflow"
            requiredPlan="agency"
            onClick={() =>
              openUpgrade({
                feature: "Approval workflow",
                why: "Editors draft, admins approve. Required for teams of 3+.",
                requiredPlan: "agency",
              })
            }
          />
        </MoreWithSection>
      )}

      {state.plan === "agency" && (
        <MoreWithSection plan="network">
          <CompactLockedCard
            title="Cross-roster pool"
            requiredPlan="network"
            onClick={() =>
              openUpgrade({
                feature: "Cross-roster pool",
                why: "Share talent across multiple brands. Useful when you run more than one agency identity.",
                requiredPlan: "network",
              })
            }
          />
        </MoreWithSection>
      )}
      {/* FAB — add talent, mobile only (#4) */}
      {canEdit && (
        <FloatingFab
          label={state.entityType === "hub" ? "Invite member" : "Add talent"}
          onClick={() => openDrawer("new-talent")}
        />
      )}
    </>
  );
}

// ════════════════════════════════════════════════════════════════════
// CLIENTS
// ════════════════════════════════════════════════════════════════════

function ClientsPage() {
  const { state, openDrawer, openUpgrade, toast } = useProto();
  const clients = getClients(state.plan);
  const canEdit = meetsRole(state.role, "coordinator");
  const isFree = state.plan === "free";
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "dormant">("all");
  const [sort, setSort] = useState<"name" | "bookings" | "status">("name");
  const [confirmArchive, setConfirmArchive] = useState<{ id: string; name: string } | null>(null);

  const filteredClients = clients
    .filter((c) => statusFilter === "all" || c.status === statusFilter)
    .filter((c) => {
      if (!search.trim()) return true;
      const q = search.trim().toLowerCase();
      return (
        c.name.toLowerCase().includes(q) ||
        (c.contact ?? "").toLowerCase().includes(q)
      );
    })
    .sort((a, b) => {
      if (sort === "name") return a.name.localeCompare(b.name);
      if (sort === "bookings") return b.bookingsYTD - a.bookingsYTD;
      if (sort === "status") return a.status.localeCompare(b.status);
      return 0;
    });

  const exportClientsCsv = () => {
    downloadCsv(
      `clients-${new Date().toISOString().slice(0, 10)}.csv`,
      filteredClients.map((c) => ({
        name: c.name,
        contact: c.contact ?? "",
        bookingsYTD: c.bookingsYTD,
        status: c.status,
        trust: c.trust ?? "",
      })),
    );
    toast(`Exported ${filteredClients.length} rows`);
  };

  if (isFree) {
    return (
      <>
        <PageHeader
          eyebrow="Clients"
          title="Build your client list"
          subtitle="On Free, inquiries arrive through the public Tulala directory. Move to Studio to take inquiries on your own domain and own your client list."
        />
        <Grid cols="2">
          <PrimaryCard
            title="One inquiry so far"
            description="A test inquiry from a friend referral. No client relationship yet."
            icon={<Icon name="mail" size={14} stroke={1.7} />}
            affordance="See inquiry"
            onClick={() => openDrawer("inquiry-peek", { id: "iq1" })}
          />
          <LockedCard
            title="Owned client list"
            description="With Studio, every inquiry on your domain becomes a client you own. We never share your client list with anyone — including Tulala discovery."
            requiredPlan="studio"
            onClick={() =>
              openUpgrade({
                feature: "Owned client list",
                why: "On Free, the public directory introduces you to clients. On Studio, those clients are yours.",
                requiredPlan: "studio",
                unlocks: ["Private client database", "Booking history per client", "Custom relationship fields"],
              })
            }
          />
        </Grid>
        <MoreWithSection plan="agency">
          <CompactLockedCard
            title="Per-client booking history"
            requiredPlan="agency"
            onClick={() =>
              openUpgrade({
                feature: "Client history",
                why: "Track every booking, brief and contact across years.",
                requiredPlan: "agency",
              })
            }
          />
          <CompactLockedCard
            title="Custom client fields"
            requiredPlan="agency"
            onClick={() =>
              openUpgrade({
                feature: "Client field catalog",
                why: "Add fields that match how your team actually segments clients.",
                requiredPlan: "agency",
              })
            }
          />
        </MoreWithSection>
      </>
    );
  }

  return (
    <>
      <PageHeader
        eyebrow="Clients"
        title="Client relationships"
        subtitle={`${clients.length} clients you've worked with. Each one carries booking history and notes.`}
        actions={
          <>
            <GhostButton size="sm" onClick={exportClientsCsv}>Export CSV</GhostButton>
            {canEdit ? (
              <PrimaryButton onClick={() => openDrawer("client-profile", { id: "new" })}>
                Add client
              </PrimaryButton>
            ) : (
              <ReadOnlyChip />
            )}
          </>
        }
      />

      <div
        style={{
          display: "flex",
          gap: 8,
          marginBottom: 12,
          flexWrap: "wrap",
        }}
      >
        <input
          type="text"
          aria-label="Search clients by name or contact"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name or contact…"
          style={{
            flex: 1,
            minWidth: 200,
            padding: "9px 12px",
            fontFamily: FONTS.body,
            fontSize: 13,
            color: COLORS.ink,
            background: "#fff",
            border: `1px solid ${COLORS.border}`,
            borderRadius: 8,
            outline: "none",
          }}
        />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
          aria-label="Status"
          style={selectStyle}
        >
          <option value="all">All statuses</option>
          <option value="active">Active</option>
          <option value="dormant">Dormant</option>
        </select>
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as typeof sort)}
          aria-label="Sort"
          style={selectStyle}
        >
          <option value="name">Name</option>
          <option value="bookings">Bookings</option>
          <option value="status">Status</option>
        </select>
        {(search.trim() || statusFilter !== "all" || sort !== "name") && (
          <button
            type="button"
            onClick={() => { setSearch(""); setStatusFilter("all"); setSort("name"); }}
            style={{
              padding: "7px 10px",
              background: "transparent",
              color: COLORS.inkMuted,
              border: `1px solid ${COLORS.border}`,
              borderRadius: 999,
              cursor: "pointer",
              fontFamily: FONTS.body,
              fontSize: 11.5,
              fontWeight: 500,
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
            }}
          >
            <span aria-hidden>×</span> Clear
          </button>
        )}
      </div>

      <div
        style={{
          background: "#fff",
          borderRadius: 12,
          border: `1px solid ${COLORS.borderSoft}`,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(0,1.5fr) minmax(0,1.2fr) 80px 100px 60px",
            gap: 14,
            padding: "9px 18px",
            background: COLORS.surfaceAlt,
            borderBottom: `1px solid ${COLORS.borderSoft}`,
            fontFamily: FONTS.body,
            fontSize: 10.5,
            fontWeight: 600,
            letterSpacing: 1,
            textTransform: "uppercase",
            color: COLORS.inkMuted,
          }}
        >
          <span>Client</span>
          <span>Bookings</span>
          <span>Status</span>
          <span>Trust</span>
          <span />
        </div>
        {filteredClients.length === 0 && (
          <EmptyState
            icon="user"
            title="No clients match"
            body="Try a different search or clear the status filter."
            primaryLabel="Clear filters"
            onPrimary={() => {
              setSearch("");
              setStatusFilter("all");
            }}
            compact
          />
        )}
        {filteredClients.map((client, idx) => (
          <SwipeableRow
            key={client.id}
            rightActions={[{
              label: "Archive",
              tone: "red",
              onClick: () => setConfirmArchive({ id: client.id, name: client.name }),
            }]}
          >
          <button
            type="button"
            onClick={() => openDrawer("client-profile", { id: client.id })}
            style={{
              display: "grid",
              gridTemplateColumns: "minmax(0,1.5fr) minmax(0,1.2fr) 80px 100px 60px",
              alignItems: "center",
              gap: 14,
              padding: "14px 18px",
              background: "transparent",
              border: "none",
              borderTop: idx > 0 ? `1px solid ${COLORS.borderSoft}` : "none",
              cursor: "pointer",
              fontFamily: FONTS.body,
              textAlign: "left",
              width: "100%",
              transition: "background .1s",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(11,11,13,0.025)")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
              <Avatar initials={client.name.split(" ").map((w: string) => w[0]).join("").slice(0, 2).toUpperCase()} size={32} tone="auto" hashSeed={client.name} />
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13.5, fontWeight: 600, color: COLORS.ink }}>{client.name}</div>
                <div style={{ fontSize: 11.5, color: COLORS.inkMuted, marginTop: 1 }}>{client.contact}</div>
              </div>
            </div>
            <div style={{ fontSize: 12, color: COLORS.inkMuted }}>
              {client.bookingsYTD} bookings YTD
            </div>
            <div>
              <StatusBadge tone={client.status === "active" ? "green" : "dim"} label={client.status} />
            </div>
            <div>
              {client.trust ? (
                <ClientTrustChip level={client.trust} compact />
              ) : (
                <span style={{ fontSize: 11, color: COLORS.inkDim }}>—</span>
              )}
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <Icon name="chevron-right" size={14} color={COLORS.inkDim} />
            </div>
          </button>
          </SwipeableRow>
        ))}
      </div>

      {state.plan === "studio" && (
        <MoreWithSection plan="agency">
          <CompactLockedCard
            title="Custom client fields"
            requiredPlan="agency"
            onClick={() =>
              openUpgrade({
                feature: "Client field catalog",
                why: "Add the fields your team segments clients by — region, brand tier, preferred talent.",
                requiredPlan: "agency",
              })
            }
          />
          <CompactLockedCard
            title="Booking history reports"
            requiredPlan="agency"
            onClick={() =>
              openUpgrade({
                feature: "Reports",
                why: "Export per-client booking volume and revenue.",
                requiredPlan: "agency",
              })
            }
          />
        </MoreWithSection>
      )}

      {/* FAB — add client, mobile only (#4) */}
      {canEdit && (
        <FloatingFab
          label="Add client"
          onClick={() => openDrawer("client-profile", { id: "new" })}
        />
      )}

      {/* Confirm modal — archive client (#8) */}
      <ConfirmModal
        open={confirmArchive !== null}
        title="Archive client"
        message={`Archive ${confirmArchive?.name ?? "this client"}? Their booking history is preserved — you can unarchive any time.`}
        confirmLabel="Archive"
        onConfirm={() => {
          toast(`${confirmArchive?.name ?? "Client"} archived`);
          setConfirmArchive(null);
        }}
        onCancel={() => setConfirmArchive(null)}
      />
    </>
  );
}

/**
 * Thin wrapper kept for call-site clarity. Delegates to the primitive
 * StatusPill — capitalize=true matches the prior raw-status display.
 */
function StatusBadge({
  tone,
  label,
}: {
  tone: "ink" | "amber" | "green" | "dim";
  label: string;
}) {
  return <StatusPill tone={tone} label={label} capitalize />;
}

// ════════════════════════════════════════════════════════════════════
// SITE
// ════════════════════════════════════════════════════════════════════

function SitePage() {
  const { state, setPage, openDrawer, openUpgrade } = useProto();
  const canEdit = meetsRole(state.role, "admin");

  return (
    <>
      <PageHeader
        eyebrow="Public Site"
        title="Site & roster"
        subtitle="Roster, site pages, and embeds — in one place."
        actions={
          <>
            {!canEdit && <ReadOnlyChip />}
            <SecondaryButton size="sm" onClick={() => openDrawer("seo")}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                <Icon name="external" size={12} stroke={1.7} />
                Open subdomain
              </span>
            </SecondaryButton>
          </>
        }
      />

      {/* Setup walkthrough banner */}
      <SiteSetupBanner />

      <div style={{ height: 18 }} />

      {/* EVERY PLAN */}
      <TierSection
        tone="ink"
        label="EVERY PLAN"
        title="Your core workspace"
        subtitle="Free, Studio, Agency, Network — all plans share this."
      >
        <PrimaryCard
          title={ENTITY_TYPE_META[state.entityType].rosterLabel}
          description={
            state.entityType === "hub"
              ? "Members · listings · features."
              : "Talents · drafts · approvals."
          }
          icon={<Icon name="team" size={14} stroke={1.7} />}
          affordance={state.entityType === "hub" ? "Open network" : "Open roster"}
          onClick={() => setPage("talent")}
        />
        <PrimaryCard
          title="Directory settings"
          description="Grid · dedicated pages · 34 fields."
          icon={<Icon name="settings" size={14} stroke={1.7} />}
          affordance="Configure"
          onClick={() => openDrawer("storefront-visibility")}
        />
        <PrimaryCard
          title="Inquiries"
          description="Open · in progress · won."
          icon={<Icon name="mail" size={14} stroke={1.7} />}
          affordance="Open work"
          onClick={() => setPage("work")}
        />
        <PrimaryCard
          title="Branding"
          description="Logo · fonts · accent color"
          icon={<Icon name="palette" size={14} stroke={1.7} />}
          affordance="Edit branding"
          onClick={() => openDrawer("branding")}
        />
        <PrimaryCard
          title="Activity"
          description="Recent edits, publishes, and bookings."
          icon={<Icon name="bolt" size={14} stroke={1.7} />}
          affordance="See activity"
          onClick={() => openDrawer("team-activity")}
        />
      </TierSection>

      {/* STUDIO */}
      <TierSection
        tone="indigo"
        label="STUDIO"
        title="Embed anywhere"
        subtitle="Drop your roster into WordPress, Webflow, Shopify, or your custom site."
      >
        <TierCard
          title="Widgets"
          description="Active embeds · views."
          icon="globe"
          requiredPlan="studio"
          currentPlan={state.plan}
          onClick={() => openDrawer("widgets")}
          onUpgrade={() =>
            openUpgrade({
              feature: "Widgets",
              why: "Drop your live roster into any site — WordPress, Webflow, Shopify, or hand-coded.",
              requiredPlan: "studio",
              unlocks: ["Embed widget", "View tracking", "Multiple presets"],
            })
          }
        />
        <TierCard
          title="API keys"
          description="Active keys · last used."
          icon="settings"
          requiredPlan="studio"
          currentPlan={state.plan}
          onClick={() => openDrawer("api-keys")}
          onUpgrade={() =>
            openUpgrade({
              feature: "API access",
              why: "Read your roster from your own app — power talent pages, search, and pipelines.",
              requiredPlan: "studio",
              unlocks: ["Read-only API", "Webhooks", "Per-key scopes"],
            })
          }
        />
        <TierCard
          title="Custom domain & home"
          description={meetsPlan(state.plan, "studio") ? `Live at ${TENANT.customDomain}` : `Currently at ${TENANT.domain}`}
          icon="globe"
          requiredPlan="studio"
          currentPlan={state.plan}
          onClick={() => openDrawer("domain")}
          onUpgrade={() =>
            openUpgrade({
              feature: "Custom domain",
              why: "Run your storefront at your own brand's domain — not a Tulala subdomain.",
              requiredPlan: "studio",
              unlocks: ["Custom domain", "Verified email-from", "Auto SSL"],
            })
          }
          meta={meetsPlan(state.plan, "studio") ? <><StatDot tone="green" /> Verified</> : undefined}
        />
      </TierSection>

      {/* AGENCY */}
      <TierSection
        tone="amber"
        label="AGENCY"
        title="Full branded site"
        subtitle="Your site, your domain, your brand. Pages, posts, nav, theme, SEO."
      >
        <TierCard
          title="Homepage"
          description={meetsPlan(state.plan, "agency") ? "Draft pending" : "First-impression hero"}
          icon="bolt"
          requiredPlan="agency"
          currentPlan={state.plan}
          onClick={() => openDrawer("homepage")}
          onUpgrade={() =>
            openUpgrade({
              feature: "Branded homepage",
              why: "Take full control of the first thing your visitors see.",
              requiredPlan: "agency",
            })
          }
        />
        <TierCard
          title="Pages"
          description={`${SITE_PAGES.filter(p=>p.status==="published").length} pages · ${SITE_PAGES.filter(p=>p.status==="draft").length} drafts`}
          icon="globe"
          requiredPlan="agency"
          currentPlan={state.plan}
          onClick={() => openDrawer("pages")}
          onUpgrade={() =>
            openUpgrade({
              feature: "Pages",
              why: "Add About, Press, FAQ, Contact — anything beyond the roster.",
              requiredPlan: "agency",
            })
          }
        />
        <TierCard
          title="Posts"
          description="News, editorial, brand stories"
          icon="mail"
          requiredPlan="agency"
          currentPlan={state.plan}
          onClick={() => openDrawer("posts")}
          onUpgrade={() =>
            openUpgrade({
              feature: "Posts",
              why: "Publish news, editorial features, behind-the-scenes — keep your brand alive.",
              requiredPlan: "agency",
            })
          }
        />
        <TierCard
          title="Navigation & footer"
          description="Header 5 · Footer 3 cols"
          icon="settings"
          requiredPlan="agency"
          currentPlan={state.plan}
          onClick={() => openDrawer("navigation")}
          onUpgrade={() =>
            openUpgrade({
              feature: "Custom navigation",
              why: "Define your own header and footer beyond the default roster page.",
              requiredPlan: "agency",
            })
          }
        />
        <TierCard
          title="Theme & foundations"
          description="Editorial Noir"
          icon="palette"
          requiredPlan="agency"
          currentPlan={state.plan}
          onClick={() => openDrawer("theme-foundations")}
          onUpgrade={() =>
            openUpgrade({
              feature: "Theme & foundations",
              why: "Take full control of typography, color, density, and layout.",
              requiredPlan: "agency",
              unlocks: ["Theme presets", "Color tokens", "Type scale", "Density"],
            })
          }
        />
        <TierCard
          title="SEO & defaults"
          description="Meta · Sitemap · 2 redirects"
          icon="search"
          requiredPlan="agency"
          currentPlan={state.plan}
          onClick={() => openDrawer("seo")}
          onUpgrade={() =>
            openUpgrade({
              feature: "SEO & defaults",
              why: "Own your meta tags, social cards, sitemap and redirect rules.",
              requiredPlan: "agency",
            })
          }
        />
      </TierSection>

      {/* NETWORK */}
      <TierSection
        tone="green"
        label="NETWORK"
        title="Multi-agency · hub"
        subtitle="Operate multiple agencies and push talent to cross-agency discovery."
        rightSlot={
          <button
            type="button"
            onClick={() => openUpgrade({
              feature: "Network plan",
              why: "Run multiple agency identities under one roof. Move roster across brands without losing history.",
              requiredPlan: "network",
            })}
            style={{
              fontFamily: FONTS.body,
              fontSize: 12,
              color: COLORS.inkMuted,
              background: "transparent",
              border: "none",
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              gap: 5,
              padding: 0,
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = COLORS.ink)}
            onMouseLeave={(e) => (e.currentTarget.style.color = COLORS.inkMuted)}
          >
            Contact sales <Icon name="arrow-right" size={11} />
          </button>
        }
      >
        <TierCard
          title="Hub publishing"
          description="Cross-agency discovery"
          icon="globe"
          requiredPlan="network"
          currentPlan={state.plan}
          onClick={() => openDrawer("hub-distribution")}
          onUpgrade={() =>
            openUpgrade({
              feature: "Hub publishing",
              why: "Push talent to discovery across all your agency brands at once.",
              requiredPlan: "network",
            })
          }
        />
        <TierCard
          title="Multi-agency manager"
          description="Operate multiple brands"
          icon="team"
          requiredPlan="network"
          currentPlan={state.plan}
          onClick={() => openDrawer("hub-distribution")}
          onUpgrade={() =>
            openUpgrade({
              feature: "Multi-agency",
              why: "Run several agencies as one operation — shared talent pool, separate brand identities.",
              requiredPlan: "network",
              unlocks: ["Sub-brands", "Cross-roster pool", "Hub-level dashboards"],
            })
          }
        />
      </TierSection>
    </>
  );
}

// Site setup walkthrough banner — full-width prominent card
function SiteSetupBanner() {
  const { openDrawer } = useProto();
  return (
    <div
      style={{
        background: COLORS.surfaceAlt,
        border: `1px solid rgba(15,79,62,0.22)`,
        borderRadius: 14,
        padding: 22,
        display: "flex",
        alignItems: "center",
        gap: 18,
      }}
    >
      <div
        style={{
          width: 44,
          height: 44,
          borderRadius: 11,
          background: "rgba(15,79,62,0.16)",
          color: COLORS.accentDeep,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        <Icon name="sparkle" size={20} stroke={1.8} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ marginBottom: 4 }}>
          <CapsLabel color={COLORS.accentDeep} style={{ letterSpacing: 1.6 }}>
            Site setup · the unified walkthrough
          </CapsLabel>
        </div>
        <h2
          style={{
            fontFamily: FONTS.display,
            fontSize: 22,
            fontWeight: 500,
            letterSpacing: -0.3,
            color: COLORS.ink,
            margin: 0,
            lineHeight: 1.25,
          }}
        >
          Get your site live in six steps
        </h2>
        <p
          style={{
            fontFamily: FONTS.body,
            fontSize: 13,
            color: COLORS.inkMuted,
            margin: "4px 0 0",
            lineHeight: 1.55,
            maxWidth: 720,
          }}
        >
          Homepage, pages, posts, navigation, theme, SEO — every Agency card walked through with real status and one click to apply.
        </p>
      </div>
      <PrimaryButton onClick={() => openDrawer("site-setup")}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          Open setup
          <Icon name="arrow-right" size={13} stroke={1.8} />
        </span>
      </PrimaryButton>
    </div>
  );
}

// TierSection — section header chip + grid
function TierSection({
  tone,
  label,
  title,
  subtitle,
  rightSlot,
  children,
}: {
  tone: "ink" | "indigo" | "amber" | "green";
  label: string;
  title: string;
  subtitle?: string;
  rightSlot?: ReactNode;
  children: ReactNode;
}) {
  const palette: Record<typeof tone, { bg: string; fg: string; dot: string }> = {
    ink: { bg: "rgba(11,11,13,0.05)", fg: COLORS.ink, dot: COLORS.ink },
    indigo: { bg: "rgba(78,90,180,0.10)", fg: "#3D478A", dot: "#5C6BD0" },
    amber: { bg: "rgba(82,96,109,0.12)", fg: "#3A4651", dot: COLORS.amber },
    green: { bg: "rgba(46,125,91,0.12)", fg: "#1F5C42", dot: COLORS.green },
  };
  const p = palette[tone];
  return (
    <section style={{ marginBottom: 28 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 14,
          marginBottom: 14,
          flexWrap: "wrap",
        }}
      >
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            padding: "4px 10px",
            background: p.bg,
            color: p.fg,
            fontFamily: FONTS.body,
            fontSize: 10.5,
            fontWeight: 700,
            letterSpacing: 1.4,
            textTransform: "uppercase",
            borderRadius: 999,
          }}
        >
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: p.dot }} />
          {label}
        </span>
        <h2
          style={{
            fontFamily: FONTS.display,
            fontSize: 19,
            fontWeight: 500,
            letterSpacing: -0.2,
            color: COLORS.ink,
            margin: 0,
          }}
        >
          {title}
        </h2>
        {subtitle && (
          <span
            style={{
              fontFamily: FONTS.body,
              fontSize: 12.5,
              color: COLORS.inkMuted,
              flex: 1,
              minWidth: 0,
            }}
          >
            {subtitle}
          </span>
        )}
        {rightSlot}
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
          gap: 12,
        }}
      >
        {children}
      </div>
    </section>
  );
}

// TierCard — renders Primary or Locked depending on whether plan unlocks it
function TierCard({
  title,
  description,
  icon,
  requiredPlan,
  currentPlan,
  onClick,
  onUpgrade,
  meta,
}: {
  title: string;
  description?: string;
  icon: "globe" | "settings" | "team" | "palette" | "credit" | "calendar" | "mail" | "search" | "bolt" | "user";
  requiredPlan: Plan;
  currentPlan: Plan;
  onClick: () => void;
  onUpgrade: () => void;
  meta?: ReactNode;
}) {
  const unlocked = meetsPlan(currentPlan, requiredPlan);
  if (unlocked) {
    return (
      <PrimaryCard
        title={title}
        description={description}
        icon={<Icon name={icon} size={14} stroke={1.7} />}
        affordance="Open"
        onClick={onClick}
        meta={meta}
      />
    );
  }
  return (
    <LockedCard
      title={title}
      description={description}
      requiredPlan={requiredPlan}
      onClick={onUpgrade}
    />
  );
}

function PlanLadderStrip() {
  const { state, setPlan, openUpgrade } = useProto();
  const items: { plan: Plan; promise: string }[] = [
    { plan: "free", promise: "Public storefront on Tulala discovery" },
    { plan: "studio", promise: "Custom domain + private inquiries" },
    { plan: "agency", promise: "Branded design + custom fields + team" },
    { plan: "network", promise: "Multi-brand hub + cross-roster pool" },
  ];
  return (
    <div
      style={{
        background: "#fff",
        border: `1px solid ${COLORS.borderSoft}`,
        borderRadius: 12,
        padding: 4,
        display: "grid",
        gridTemplateColumns: "repeat(4, 1fr)",
        gap: 4,
      }}
    >
      {items.map((item) => {
        const isCurrent = state.plan === item.plan;
        const isReached = meetsPlan(state.plan, item.plan);
        return (
          <button
            key={item.plan}
            type="button"
            disabled={isReached && !isCurrent}
            aria-disabled={isReached && !isCurrent}
            onClick={() => {
              if (isReached) return;
              openUpgrade({
                feature: `${PLAN_META[item.plan].label} plan`,
                why: PLAN_META[item.plan].theme,
                requiredPlan: item.plan,
              });
            }}
            style={{
              padding: "12px 14px",
              borderRadius: 9,
              background: isCurrent ? COLORS.ink : "transparent",
              color: isCurrent ? "#fff" : COLORS.ink,
              border: "none",
              cursor: isReached ? "default" : "pointer",
              textAlign: "left",
              fontFamily: FONTS.body,
              opacity: isReached && !isCurrent ? 0.6 : 1,
              transition: "background .15s",
            }}
            onMouseEnter={(e) => {
              if (!isReached) e.currentTarget.style.background = "rgba(11,11,13,0.04)";
            }}
            onMouseLeave={(e) => {
              if (!isReached && !isCurrent) e.currentTarget.style.background = "transparent";
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 4 }}>
              <span
                style={{
                  fontSize: 10.5,
                  fontWeight: 700,
                  letterSpacing: 1.2,
                  textTransform: "uppercase",
                  color: isCurrent ? "rgba(255,255,255,0.7)" : COLORS.inkDim,
                }}
              >
                {PLAN_META[item.plan].label}
              </span>
              {isCurrent && (
                <span
                  style={{
                    fontSize: 9.5,
                    fontWeight: 600,
                    background: "rgba(255,255,255,0.18)",
                    color: "#fff",
                    padding: "1px 6px",
                    borderRadius: 4,
                    letterSpacing: 0.6,
                    textTransform: "uppercase",
                  }}
                >
                  Current
                </span>
              )}
              {!isReached && <Icon name="lock" size={10} stroke={1.7} color={COLORS.inkDim} />}
            </div>
            <div
              style={{
                fontSize: 12,
                lineHeight: 1.4,
                color: isCurrent ? "rgba(255,255,255,0.78)" : COLORS.inkMuted,
              }}
            >
              {item.promise}
            </div>
          </button>
        );
      })}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════
// BILLING / PAYMENTS
// ════════════════════════════════════════════════════════════════════
//
// Workspace-level billing surface. Surfaces:
//   1. Current plan + platform fee economics (from PLAN_FEE_META)
//   2. Default payout receiver (workspace-level connection state)
//   3. Recent payment activity (WORKSPACE_PAYMENTS rows)
//   4. (Free plan) upgrade nudge — payments require Studio+ to operate
//
// The data layer lives in _state.tsx. This page is presentation only.

function BillingPage() {
  const { state, openDrawer, openUpgrade } = useProto();
  const isOwner = state.role === "owner";
  const isAdmin = meetsRole(state.role, "admin");
  const isFree = state.plan === "free";
  const payout = getWorkspacePayout(state.plan);
  const fee = PLAN_FEE_META[state.plan];

  return (
    <>
      <PageHeader
        eyebrow="Billing"
        title="Payments & payouts"
        subtitle="Platform fee, payout routing, and recent payment activity."
        actions={
          isOwner ? (
            <PrimaryButton onClick={() => openDrawer("plan-billing")}>
              Manage plan
            </PrimaryButton>
          ) : null
        }
      />

      {/* Top row — fee economics + default receiver */}
      <Grid cols="2">
        <PrimaryCard
          title={`Platform fee · ${fee.label}`}
          description={fee.controlsHint}
          icon={<Icon name="credit" size={14} stroke={1.7} />}
          badge={<PlanChip plan={state.plan} variant="solid" />}
          affordance={isOwner ? "Compare plan fees" : "View"}
          onClick={() => openDrawer("plan-billing")}
        />

        {!isFree && isAdmin ? (
          <PrimaryCard
            title="Default payout receiver"
            description={`${payout.defaultReceiver.displayName}${payout.defaultReceiver.legalName ? ` · ${payout.defaultReceiver.legalName}` : ""}`}
            icon={<Icon name="team" size={14} stroke={1.7} />}
            badge={<PayoutStatusChip status={payout.defaultReceiver.status} />}
            affordance="Manage receiver"
            onClick={() => openDrawer("payments-setup")}
          />
        ) : isFree ? (
          <LockedCard
            title="Default payout receiver"
            description="Free workspaces don't run payments through Tulala. Studio unlocks card acceptance + payout routing."
            requiredPlan="studio"
            onClick={() =>
              openUpgrade({
                feature: "Payments",
                why: "Accept client card payments and route net payout to one verified receiver per booking.",
                requiredPlan: "studio",
                unlocks: [
                  "Card acceptance (Visa / Mastercard / Amex)",
                  "Connected payout receiver",
                  "Lower platform fee",
                  "Per-booking receipts",
                ],
              })
            }
          />
        ) : (
          <SecondaryCard
            title="Default payout receiver"
            description={`${payout.defaultReceiver.displayName} · ${PAYOUT_STATUS_META[payout.defaultReceiver.status].label}`}
            meta={<ReadOnlyChip />}
            affordance="View"
            onClick={() => openDrawer("payments-setup")}
          />
        )}
      </Grid>

      {/* Volume + pending */}
      {!isFree && (
        <Grid cols="3">
          <SecondaryCard
            title="30-day volume"
            description={payout.recentVolume30d}
            affordance="See activity"
            onClick={() => { document.querySelector("[data-billing-activity]")?.scrollIntoView({ behavior: "smooth", block: "start" }); }}
          />
          <SecondaryCard
            title="Pending payouts"
            description={payout.pendingPayouts}
            affordance="See activity"
            onClick={() => { document.querySelector("[data-billing-activity]")?.scrollIntoView({ behavior: "smooth", block: "start" }); }}
          />
          <SecondaryCard
            title="Card acceptance"
            description={payout.acceptCards ? "Visa · Mastercard · Amex enabled" : "Not enabled"}
            affordance="Configure"
            onClick={() => openDrawer("payments-setup")}
          />
        </Grid>
      )}

      <div data-billing-activity><Divider label="Recent activity" /></div>

      {isFree ? (
        <SecondaryCard
          title="No payment activity yet"
          description="Payments turn on at Studio. Free workspaces can still take inquiries — they just settle off-platform."
          affordance="See plans"
          onClick={() =>
            openUpgrade({
              feature: "Payments",
              why: "Studio adds card acceptance + connected payout receiver.",
              requiredPlan: "studio",
            })
          }
        />
      ) : (
        <BillingActivityTable />
      )}
    </>
  );
}

/**
 * Recent workspace payment activity — one row per booking. Mirrors
 * WORKSPACE_PAYMENTS but renders an interactive list with a chip per
 * row and a click-to-open-drawer affordance.
 */
function BillingActivityTable() {
  const { openDrawer } = useProto();
  return (
    <div
      style={{
        background: "#fff",
        border: `1px solid ${COLORS.borderSoft}`,
        borderRadius: 12,
        overflow: "hidden",
      }}
    >
      {/* Header row */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1.4fr 1.6fr 1fr 1fr 1.2fr 1fr 0.6fr",
          padding: "10px 16px",
          background: COLORS.surfaceAlt,
          borderBottom: `1px solid ${COLORS.borderSoft}`,
          fontFamily: FONTS.body,
          fontSize: 11,
          letterSpacing: 0.4,
          textTransform: "uppercase",
          color: COLORS.inkMuted,
          fontWeight: 600,
        }}
      >
        <span>Booking</span>
        <span>Client · brief</span>
        <span style={{ textAlign: "right" }}>Total</span>
        <span style={{ textAlign: "right" }}>Net payout</span>
        <span>Receiver</span>
        <span>Status</span>
        <span style={{ textAlign: "right" }}>Date</span>
      </div>
      {WORKSPACE_PAYMENTS.map((row) => {
        const [hovered, setHovered] = useState(false);
        return (
          <button
            key={row.id}
            type="button"
            onClick={() => openDrawer("payment-detail", { id: row.id })}
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
            style={{
              display: "grid",
              gridTemplateColumns: "1.4fr 1.6fr 1fr 1fr 1.2fr 1fr 0.6fr",
              alignItems: "center",
              gap: 0,
              padding: "12px 16px",
              background: hovered ? "rgba(11,11,13,0.025)" : "transparent",
              border: "none",
              borderTop: `1px solid ${COLORS.borderSoft}`,
              width: "100%",
              textAlign: "left",
              cursor: "pointer",
              fontFamily: FONTS.body,
              fontSize: 13,
              color: COLORS.ink,
              transition: "background .1s",
            }}
          >
            <div style={{ fontWeight: 600 }}>{row.ref}</div>
            <div>
              <div style={{ color: COLORS.ink }}>{row.client}</div>
              <div style={{ fontSize: 11.5, color: COLORS.inkMuted }}>{row.brief}</div>
            </div>
            <div style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{row.total}</div>
            <div style={{ textAlign: "right", fontVariantNumeric: "tabular-nums", color: COLORS.inkMuted }}>
              {row.netPayout}
              <div style={{ fontSize: 11, color: COLORS.inkDim }}>fee {row.fee}</div>
            </div>
            <div style={{ color: COLORS.inkMuted }}>{row.receiverName}</div>
            <div>
              <PaymentStatusChip status={row.status} />
            </div>
            <div style={{ textAlign: "right", fontSize: 12 }}>
              {hovered ? (
                <span style={{ color: COLORS.accent, fontWeight: 600, fontSize: 11 }}>Details →</span>
              ) : (
                <span style={{ color: COLORS.inkMuted }}>{row.date}</span>
              )}
            </div>
          </button>
        );
      })}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════
// WORKSPACE (settings)
// ════════════════════════════════════════════════════════════════════

function WorkspacePageView() {
  const { state, openDrawer, openUpgrade } = useProto();
  const isOwner = state.role === "owner";
  const isAdmin = meetsRole(state.role, "admin");
  const isFree = state.plan === "free";
  // Auto-save indicator (#6) — simulates a settings save 1.2s after mount
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  useEffect(() => {
    const t = setTimeout(() => setSavedAt(new Date()), 1200);
    return () => clearTimeout(t);
  }, []);

  return (
    <>
      <PageHeader
        eyebrow="Settings"
        title="Workspace settings"
        subtitle="Plan, team, branding, identity — the controls that shape who you are inside Tulala."
        actions={<AutoSaveIndicator savedAt={savedAt} />}
      />

      <Grid cols="2">
        {isOwner ? (
          <PrimaryCard
            title="Plan & billing"
            description={`Currently on ${PLAN_META[state.plan].label}. ${PLAN_META[state.plan].theme}.`}
            icon={<Icon name="credit" size={14} stroke={1.7} />}
            badge={<PlanChip plan={state.plan} variant="solid" />}
            affordance="Manage plan"
            onClick={() => openDrawer("plan-billing")}
          />
        ) : (
          <PrimaryCard
            title="Plan & billing"
            description={`Currently on ${PLAN_META[state.plan].label}. Only owners can change billing.`}
            icon={<Icon name="credit" size={14} stroke={1.7} />}
            badge={<PlanChip plan={state.plan} variant="outline" />}
            meta={<ReadOnlyChip />}
            affordance="View"
            onClick={() => openDrawer("plan-billing")}
          />
        )}

        {isAdmin && !isFree ? (
          <PrimaryCard
            title="Team"
            description={`${getTeam(state.plan).length} members. Roles: viewer / editor / coordinator / admin / owner.`}
            icon={<Icon name="team" size={14} stroke={1.7} />}
            affordance="Manage team"
            onClick={() => openDrawer("team")}
          />
        ) : isFree ? (
          <LockedCard
            title="Team"
            description="Free is single-user. Agency unlocks teammates with role-based access."
            requiredPlan="agency"
            onClick={() =>
              openUpgrade({
                feature: "Team & roles",
                why: "Invite teammates with viewer / editor / coordinator / admin / owner roles.",
                requiredPlan: "agency",
                unlocks: ["Up to 25 seats", "Role-based access", "Approval workflow"],
              })
            }
          />
        ) : (
          <PrimaryCard
            title="Team"
            description={`${getTeam(state.plan).length} members.`}
            icon={<Icon name="team" size={14} stroke={1.7} />}
            meta={<ReadOnlyChip />}
            affordance="View"
            onClick={() => openDrawer("team")}
          />
        )}

        {isAdmin && meetsPlan(state.plan, "agency") ? (
          <PrimaryCard
            title="Branding"
            description="Logo, voice, brand colors. What clients see across emails and storefront."
            icon={<Icon name="palette" size={14} stroke={1.7} />}
            affordance="Open branding"
            onClick={() => openDrawer("branding")}
          />
        ) : (
          <LockedCard
            title="Branding"
            description="Studio uses default branding. Agency unlocks full brand identity control."
            requiredPlan="agency"
            onClick={() =>
              openUpgrade({
                feature: "Branding",
                why: "Bring your full visual identity — logo, color, typography, voice — to client touchpoints.",
                requiredPlan: "agency",
                unlocks: ["Logo & favicon", "Color tokens", "Email signature", "Voice & tone"],
              })
            }
          />
        )}

        <SecondaryCard
          title="Identity"
          description="Workspace name, slug, contact email."
          affordance="Edit identity"
          onClick={() => openDrawer("identity")}
        />
      </Grid>

      <Divider label="Operational" />

      <Grid cols="3">
        <SecondaryCard
          title="Workspace settings"
          description="Timezone, locale, default currency."
          affordance="Configure"
          onClick={() => openDrawer("workspace-settings")}
        />
        {meetsPlan(state.plan, "agency") ? (
          <SecondaryCard
            title="Field catalog"
            description="Custom fields for talent, clients, bookings."
            affordance="Manage fields"
            onClick={() => openDrawer("field-catalog")}
          />
        ) : (
          <LockedCard
            title="Field catalog"
            description="Custom fields for talent, clients, bookings."
            requiredPlan="agency"
            onClick={() =>
              openUpgrade({
                feature: "Field catalog",
                why: "Add the fields your agency actually books on.",
                requiredPlan: "agency",
              })
            }
          />
        )}
        {meetsPlan(state.plan, "agency") ? (
          <SecondaryCard
            title="Taxonomy"
            description="Tags, niches, segments for filtering."
            affordance="Manage taxonomy"
            onClick={() => openDrawer("taxonomy")}
          />
        ) : (
          <LockedCard
            title="Taxonomy"
            description="Tags, niches, segments for filtering."
            requiredPlan="agency"
            onClick={() =>
              openUpgrade({
                feature: "Taxonomy",
                why: "Define your own tags and categories for talent and clients.",
                requiredPlan: "agency",
              })
            }
          />
        )}
      </Grid>

      {isOwner && (
        <>
          <Divider label="Sensitive" />
          <SecondaryCard
            title="Danger zone"
            description="Delete workspace, transfer ownership, export everything."
            affordance="Open"
            onClick={() => openDrawer("danger-zone")}
          />
        </>
      )}

      {state.plan === "free" && (
        <MoreWithSection plan="studio">
          <CompactLockedCard
            title="Custom domain"
            requiredPlan="studio"
            onClick={() =>
              openUpgrade({
                feature: "Custom domain",
                why: "Run your storefront at your own domain.",
                requiredPlan: "studio",
              })
            }
          />
          <CompactLockedCard
            title="Email-from address"
            requiredPlan="studio"
            onClick={() =>
              openUpgrade({
                feature: "Email-from",
                why: "Send client offers from your own verified email.",
                requiredPlan: "studio",
              })
            }
          />
        </MoreWithSection>
      )}
    </>
  );
}

// ════════════════════════════════════════════════════════════════════
// Surface router
// ════════════════════════════════════════════════════════════════════

export function SurfaceRouter() {
  const { state } = useProto();
  // Wrap each surface in a <main> landmark so screen readers can jump
  // directly past the dark prototype ControlBar (which is treated as a
  // toolbar/header in the page composition). Each surface has only one
  // <main> at a time — surfaces are mutually exclusive.
  const inner = (() => {
    switch (state.surface) {
      case "workspace":
        // WorkspaceShell wraps with HybridShell internally so the
        // persistent identity bar renders above the inner shell.
        return <WorkspaceShell />;
      case "talent":
        // Wrap talent here at the router level — avoids a circular
        // import that would happen if _talent.tsx pulled HybridShell
        // from _pages.tsx (since _pages.tsx imports TalentSurface).
        return (
          <HybridShell>
            <TalentSurface />
          </HybridShell>
        );
      case "client":
        return <ClientSurface />;
      case "platform":
        return <PlatformSurface />;
    }
  })();
  return (
    <main id="tulala-main" aria-label={`${state.surface} surface`} style={{ display: "contents" }}>
      {inner}
    </main>
  );
}

// ════════════════════════════════════════════════════════════════════
// Mobile bottom tab bar
// ════════════════════════════════════════════════════════════════════
/**
 * Native-app-style bottom tab bar — only visible at mobile widths via
 * page.tsx CSS. Mirrors a curated 5-tab subset of the active surface's
 * pages. The "More" tab opens a sheet listing remaining pages.
 *
 * On wider viewports the bar is `display: none` so desktop UX is
 * untouched (page nav still lives in the topbar there).
 */
const MOBILE_TAB_LIMIT = 5;

export function MobileBottomNav() {
  const {
    state,
    setPage,
    setTalentPage,
    setClientPage,
    setPlatformPage,
  } = useProto();
  const [moreOpen, setMoreOpen] = useState(false);

  const tabs = (() => {
    if (state.surface === "workspace") {
      return WORKSPACE_PAGES.map((p) => ({
        id: p,
        label: p === "talent" ? ENTITY_TYPE_META[state.entityType].rosterLabel : PAGE_META[p].label,
        active: state.page === p,
        run: () => setPage(p as WorkspacePage),
        icon: WORKSPACE_TAB_ICON[p as WorkspacePage] ?? "info",
      }));
    }
    if (state.surface === "talent") {
      // Per-tab unread badges — derived from real NOTIFICATIONS data.
      const TALENT_TAB_BADGE: Partial<Record<TalentPage, number>> = {
        messages: TALENT_NOTIFICATION_COUNT || undefined,
      };
      return TALENT_PAGES.map((p) => ({
        id: p,
        label: TALENT_PAGE_META[p].label,
        active: state.talentPage === p,
        run: () => setTalentPage(p as TalentPage),
        icon: TALENT_TAB_ICON[p as TalentPage] ?? "info",
        badge: TALENT_TAB_BADGE[p as TalentPage],
      }));
    }
    if (state.surface === "client") {
      return CLIENT_PAGES.map((p) => ({
        id: p,
        label: CLIENT_PAGE_META[p].label,
        active: state.clientPage === p,
        run: () => setClientPage(p as ClientPage),
        icon: CLIENT_TAB_ICON[p as ClientPage] ?? "info",
      }));
    }
    return PLATFORM_PAGES.map((p) => ({
      id: p,
      label: PLATFORM_PAGE_META[p].label,
      active: state.platformPage === p,
      run: () => setPlatformPage(p as PlatformPage),
      icon: "info" as const,
    }));
  })();

  const visible = tabs.slice(0, MOBILE_TAB_LIMIT - 1);
  const overflow = tabs.slice(MOBILE_TAB_LIMIT - 1);
  const hasOverflow = overflow.length > 0;
  const moreActive = overflow.some((t) => t.active);

  return (
    <>
      <nav
        data-tulala-mobile-bottom-nav
        aria-label={`${state.surface} sections`}
        style={{
          position: "fixed",
          left: 0,
          right: 0,
          bottom: 0,
          background: "#fff",
          borderTop: `1px solid ${COLORS.borderSoft}`,
          zIndex: Z.topbar,
          display: "none",
          paddingBottom: "env(safe-area-inset-bottom, 0px)",
          fontFamily: FONTS.body,
        }}
      >
        <div style={{ display: "flex", alignItems: "stretch", height: 56 }}>
          {visible.map((t) => (
            <BottomTab key={t.id} {...t} />
          ))}
          {hasOverflow && (
            <BottomTab
              id="more"
              label="More"
              icon="info"
              active={moreActive}
              run={() => setMoreOpen(true)}
            />
          )}
        </div>
      </nav>
      {moreOpen && (
        <div
          onClick={() => setMoreOpen(false)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(11,11,13,0.36)",
            zIndex: Z.modalBackdrop,
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "center",
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-label="More sections"
            style={{
              width: "100%",
              background: "#fff",
              borderRadius: "16px 16px 0 0",
              padding: "8px 0 max(env(safe-area-inset-bottom, 0px), 12px)",
              boxShadow: "0 -10px 30px rgba(11,11,13,0.18)",
              fontFamily: FONTS.body,
            }}
          >
            <div
              style={{
                width: 36,
                height: 4,
                borderRadius: 999,
                background: "rgba(11,11,13,0.18)",
                margin: "8px auto 12px",
              }}
            />
            {overflow.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => {
                  t.run();
                  setMoreOpen(false);
                }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  width: "100%",
                  padding: "14px 18px",
                  background: t.active ? COLORS.accentSoft : "transparent",
                  border: "none",
                  cursor: "pointer",
                  fontFamily: FONTS.body,
                  fontSize: 15,
                  fontWeight: 500,
                  color: t.active ? COLORS.accentDeep : COLORS.ink,
                  textAlign: "left",
                }}
              >
                <Icon name={t.icon} size={16} stroke={1.7} color={t.active ? COLORS.accent : COLORS.inkMuted} />
                {t.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

function BottomTab({
  label,
  icon,
  active,
  run,
  badge,
}: {
  id: string;
  label: string;
  icon: "info" | "sparkle" | "plus" | "search" | "mail" | "calendar" | "user" | "team" | "bolt" | "credit" | "x" | "chevron-right" | "chevron-down";
  active: boolean;
  run: () => void;
  badge?: number;
}) {
  return (
    <button
      type="button"
      onClick={run}
      className="tulala-bottom-tab"
      aria-current={active ? "page" : undefined}
      style={{
        flex: 1,
        // Active: soft accent wash covers the whole tab (icon + label) —
        //   no more "icon-only" half-button feel.
        // Inactive: transparent base; hover/press adds a subtle wash so
        //   it visibly behaves like a button.
        background: active ? COLORS.accentSoft : "transparent",
        border: "none",
        borderRadius: 14,
        cursor: "pointer",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 3,
        padding: "9px 6px 8px",
        margin: "5px 3px",
        color: active ? COLORS.accentDeep : COLORS.inkMuted,
        fontFamily: FONTS.body,
        fontSize: 11,
        fontWeight: active ? 600 : 500,
        letterSpacing: 0.05,
        position: "relative",
        transition: "background .15s ease, color .15s ease",
      }}
    >
      <span
        aria-hidden
        style={{
          position: "relative",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Icon
          name={icon}
          size={20}
          stroke={active ? 2 : 1.7}
          color={active ? COLORS.accent : COLORS.inkMuted}
        />
        {badge && badge > 0 && (
          <span
            aria-hidden
            style={{
              position: "absolute",
              top: -4,
              right: -7,
              minWidth: 16,
              height: 16,
              padding: "0 4px",
              borderRadius: 999,
              background: COLORS.coral,
              color: "#fff",
              fontSize: 9.5,
              fontWeight: 700,
              lineHeight: 1,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              fontVariantNumeric: "tabular-nums",
              boxShadow: "0 0 0 1.5px #fff",
            }}
          >
            {badge > 9 ? "9+" : badge}
          </span>
        )}
      </span>
      <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 76 }}>
        {label}
      </span>
    </button>
  );
}

const WORKSPACE_TAB_ICON: Partial<Record<WorkspacePage, "info" | "sparkle" | "plus" | "search" | "mail" | "calendar" | "user" | "team" | "bolt" | "credit">> = {
  overview: "bolt",
  inbox: "mail",
  calendar: "calendar",
  work: "info",
  talent: "team",
  clients: "user",
  site: "sparkle",
  billing: "credit",
  workspace: "info",
};

const TALENT_TAB_ICON: Partial<Record<TalentPage, "info" | "sparkle" | "plus" | "search" | "mail" | "calendar" | "user" | "team" | "bolt" | "credit">> = {
  today: "bolt",
  messages: "mail",
  profile: "user",
  inbox: "mail",
  calendar: "calendar",
  activity: "sparkle",
  reach: "search",
  settings: "info",
};

const CLIENT_TAB_ICON: Partial<Record<ClientPage, "info" | "sparkle" | "plus" | "search" | "mail" | "calendar" | "user" | "team" | "bolt" | "credit">> = {
  today: "bolt",
  discover: "search",
  shortlists: "team",
  inquiries: "mail",
  bookings: "calendar",
  settings: "info",
};
