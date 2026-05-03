"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode, type CSSProperties } from "react";
import {
  CLIENT_PAGES,
  CLIENT_PAGE_META,
  COLORS,
  ENTITY_TYPE_META,
  ENTITY_TYPES,
  FONTS,
  TRANSITION,
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
  TAXONOMY,
  PENDING_TALENT,
  MY_TALENT_PROFILE,
  MY_CLIENT_BRAND,
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
  type RichInquiry,
  type Role,
  type Surface,
  type TalentPage,
  type TalentProfile,
  type TaxonomyParentId,
  type WorkspacePage,
  WEBSITE_STATE,
  type WebsiteAnalytics,
  type WebsitePeriodMetrics,
  type WebsitePageRow,
  FAB_PALETTE_OPEN_EVENT,
  FAB_PALETTE_CHANGED_EVENT,
  type FabPaletteChangedDetail,
} from "./_state";
import {
  Affordance,
  Avatar,
  Bullet,
  Card,
  CapNudge,
  CapsLabel,
  ClientTrustBadge,
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
  StatusStrip,
  PlanLockPill,
  TrustBadgeGroup,
  ProfileClaimStatusChip,
  ProfilePhotoBadgeOverlay,
  StatusPill,
  PlanChip,
  Popover,
  PayoutStatusChip,
  PaymentStatusChip,
  SwipeableRow,
  BulkSelectBar,
  BulkRowCheckbox,
  useKeyboardListNav,
  useRovingTabindex,
  scrollBehavior,
  FloatingFab,
  ConfirmModal,
  AutoSaveIndicator,
  RetryCard,
  ActivityFeedItem,
  PageSkeleton,
  RowSkeleton,
} from "./_primitives";
import { SavedViewsBar, LoadMore, QuickReplyButtons, downloadCsv, WorkspaceActivationBanner, DemoDataBanner } from "./_wave2";
import { pinNextConversation as pinNextConversationP } from "./_messages";
import { NotificationsBell } from "./_notifications-hub";
// WS-13.1 — lazy-load non-workspace surfaces so the workspace JS bundle
// doesn't ship talent / client / platform code unless the user actually
// switches surface. Each surface is ~3–6 MB of inline styles + logic.
import dynamic from "next/dynamic";
const TalentSurface = dynamic(() => import("./_talent").then((m) => ({ default: m.TalentSurface })), { ssr: false });
const ClientSurface = dynamic(() => import("./_client").then((m) => ({ default: m.ClientSurface })), { ssr: false });
const PlatformSurface = dynamic(() => import("./_platform").then((m) => ({ default: m.PlatformSurface })), { ssr: false });
import {
  ShortcutHelpOverlay,
  useKeyboardLayer,
  BulkActionBar,
  WorkspaceBody,
  InquiryStatusChip,
} from "./_workspace";
import { ParticipantsStack, type Participant } from "./_talent";
// MessagesShell is lazy-loaded with ssr:false because it imports
// ConversationThread from _talent.tsx, which transitively pulls in
// react-virtuoso — not SSR-safe. Lazy import keeps the prototype
// SSR-renderable while the messages shell is client-only.
const MessagesShell = dynamic(() => import("./_messages").then(m => m.MessagesShell), { ssr: false });

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
    setClientProfile,
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
        background: COLORS.fill,
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
        <>
          <SegmentedControl
            label="Page"
            value={state.clientPage}
            options={CLIENT_PAGES.map((p) => ({ value: p, label: CLIENT_PAGE_META[p].label }))}
            onChange={(v) => setClientPage(v as ClientPage)}
          />
          <SegmentedControl
            label="Profile"
            value={state.clientProfile}
            options={[
              { value: "martina", label: "Martina (business)" },
              { value: "gringo",  label: "The Gringo (person)" },
            ]}
            onChange={(v) => setClientProfile(v as "martina" | "gringo")}
          />
        </>
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
                transition: `background ${TRANSITION.micro}, color ${TRANSITION.micro}`,
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
        transition: `background ${TRANSITION.micro}, color ${TRANSITION.micro}`,
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

// WS-3.2 — icon map updated for 6-page nav. Now mirrors PAGE_META.icon
// (kept local for the IconName cast). Legacy aliases still present so
// any path that references them doesn't blow up at runtime.
const PAGE_ICON: Record<string, "bolt" | "mail" | "calendar" | "team" | "user" | "settings" | "globe" | "credit" | "arrow-right"> = {
  // ── canonical 6 ──
  overview:  "bolt",
  messages:  "mail",
  calendar:  "calendar",
  roster:    "team",
  clients:   "user",
  settings:  "settings",
  // ── legacy aliases ──
  inbox:     "mail",
  work:      "arrow-right",
  talent:    "team",
  site:      "globe",
  billing:   "credit",
  workspace: "settings",
};

// ════════════════════════════════════════════════════════════════════
// Workspace topbar (product chrome)
// ════════════════════════════════════════════════════════════════════

export function WorkspaceTopbar({ onOpenSearch }: { onOpenSearch?: () => void }) {
  const { state, setPage, setWorkspaceLayout, pendingTalent, verificationRequests } = useProto();
  const pendingVerifications = verificationRequests.filter(r =>
    r.status === "submitted" || r.status === "in_review" || r.status === "pending_user_action"
  ).length;
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
          [data-tulala-app-topbar-right] [aria-label="Workspace settings"],
          [data-tulala-app-topbar-right] [aria-label="Switch to sidebar layout"] {
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
        <nav ref={topbarNavRef} data-tulala-app-topbar-nav aria-label="Workspace sections" style={{ display: "flex", alignItems: "center", gap: 2, flex: 1, overflow: "auto" }}>
          {WORKSPACE_PAGES.map((p) => {
            const active = state.page === p;
            // 2026 redesign — surface pending-approval count on the Roster tab
            // so the signal is visible from anywhere in the workspace, not
            // just from the Roster page itself. Roster tab now splits the
            // signal: pending self-registrations (amber) and pending IG/
            // Tulala verifications (indigo) render as separate sub-dots so
            // admins can tell at a glance which queue needs attention.
            const showRosterBadges = p === "roster" && (pendingTalent.length + pendingVerifications) > 0;
            const pageBadge = p === "roster" ? (pendingTalent.length + pendingVerifications) : 0;
            return (
              <button
                key={p}
                onClick={() => setPage(p)}
                title={PAGE_META[p].description}
                aria-label={PAGE_META[p].description ? `${PAGE_META[p].label} — ${PAGE_META[p].description}` : PAGE_META[p].label}
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
                {p === "roster" ? ENTITY_TYPE_META[state.entityType].rosterLabel : PAGE_META[p].label}
                {showRosterBadges ? (
                  <span aria-label={`${pendingTalent.length} pending approvals · ${pendingVerifications} pending verifications`}
                    title={`${pendingTalent.length} pending approval${pendingTalent.length === 1 ? "" : "s"} · ${pendingVerifications} pending verification${pendingVerifications === 1 ? "" : "s"}`}
                    style={{ display: "inline-flex", alignItems: "center", gap: 3 }}>
                    {pendingTalent.length > 0 && (
                      <span style={{
                        display: "inline-flex", alignItems: "center", justifyContent: "center",
                        minWidth: 16, height: 16, padding: "0 5px", borderRadius: 999,
                        background: COLORS.amber, color: "#fff",
                        fontSize: 10, fontWeight: 700, lineHeight: 1,
                      }}>{pendingTalent.length}</span>
                    )}
                    {pendingVerifications > 0 && (
                      <span style={{
                        display: "inline-flex", alignItems: "center", justifyContent: "center",
                        minWidth: 16, height: 16, padding: "0 5px", borderRadius: 999,
                        background: COLORS.indigo, color: "#fff",
                        fontSize: 10, fontWeight: 700, lineHeight: 1,
                      }}>{pendingVerifications}</span>
                    )}
                  </span>
                ) : pageBadge > 0 && (
                  <span
                    aria-label={`${pageBadge} pending`}
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

        {/* WS-7.1 Search / Cmd-K trigger */}
        {onOpenSearch && (
          <button
            type="button"
            onClick={onOpenSearch}
            aria-label="Search (⌘K)"
            data-tulala-topbar-search
            style={{
              display:     "flex",
              alignItems:  "center",
              gap:         7,
              padding:     "5px 10px 5px 8px",
              border:      `1px solid ${COLORS.borderSoft}`,
              borderRadius: 7,
              background:  COLORS.surfaceAlt,
              cursor:      "pointer",
              color:       COLORS.inkMuted,
              fontFamily:  FONTS.body,
              fontSize:    12,
              transition:  `border-color ${TRANSITION.micro}`,
            }}
            onMouseEnter={(e) => (e.currentTarget.style.borderColor = COLORS.border)}
            onMouseLeave={(e) => (e.currentTarget.style.borderColor = COLORS.borderSoft)}
          >
            <Icon name="search" size={12} stroke={2} />
            <span>Search</span>
            <kbd style={{
              fontSize:     10,
              marginLeft:   2,
              padding:      "1px 5px",
              background:   "#fff",
              border:       `1px solid ${COLORS.border}`,
              borderRadius: 4,
              fontFamily:   FONTS.mono,
              color:        COLORS.inkDim,
            }}>
              ⌘K
            </kbd>
          </button>
        )}

        {/* Right side — search chip + settings + sidebar layout toggle.
            "+ New" + AI assistant unified into BottomActionFab (bottom-right). */}
        <div data-tulala-app-topbar-right style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {/* #2 — Global search chip. Opens the existing CommandPalette
              (⌘K) so power-users can find anything instantly. */}
          {onOpenSearch && (
            <button type="button" onClick={onOpenSearch}
              aria-label="Search anything (⌘K)"
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
              <span>Search</span>
              <span style={{
                marginLeft: 4, padding: "1px 5px", borderRadius: 4,
                background: "rgba(11,11,13,0.06)",
                fontSize: 9.5, fontFamily: FONTS.mono, color: COLORS.inkMuted,
              }}>⌘K</span>
            </button>
          )}
          <Popover content="Workspace settings">
            <button
              type="button"
              onClick={() => setPage("workspace")}
              aria-label="Workspace settings"
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
  const { state } = useProto();
  return [
    {
      id: "new-inquiry", label: "New inquiry", emoji: "📨",
      sub: "Capture a lead from a client",
      drawer: "new-inquiry", shortcut: "G I",
      canDo: meetsRole(state.role, "coordinator") || state.plan === "free",
    },
    {
      id: "new-booking", label: "New booking", emoji: "📅",
      sub: "Confirmed job — skip the inquiry",
      drawer: "new-booking", shortcut: "G B",
      canDo: meetsRole(state.role, "coordinator"),
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
      canDo: meetsRole(state.role, "coordinator") && state.plan !== "free",
    },
    {
      id: "invite-team", label: "Invite teammate", emoji: "👥",
      sub: "Add a coordinator or editor",
      drawer: "team", shortcut: "G U",
      canDo: meetsRole(state.role, "admin"),
    },
    {
      id: "snippets", label: "New snippet", emoji: "💬",
      sub: "Reusable reply for the message composer",
      drawer: "inbox-snippets", shortcut: "G S",
      canDo: meetsRole(state.role, "coordinator"),
    },
    {
      id: "share-card", label: "Share talent", emoji: "🔗",
      sub: "Send a client-facing standalone link",
      drawer: "talent-share-card", shortcut: "G H",
      canDo: meetsRole(state.role, "coordinator"),
    },
  ];
}

/**
 * Hook for the mobile FAB. Returns the canonical create-actions filtered
 * to what this user can do. Use as: `actions={useQuickCreateActionsFiltered()}`.
 */
function useQuickCreateActionsFiltered(): import("./_primitives").FabAction[] {
  const { openDrawer } = useProto();
  return useQuickCreateItems()
    .filter(it => it.canDo)
    .map(it => ({
      id: it.id,
      label: it.label,
      sub: it.sub,
      emoji: it.emoji,
      onClick: () => openDrawer(it.drawer as Parameters<typeof openDrawer>[0], it.drawerPayload),
    }));
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
  const { state, openDrawer, flipMode, toast, setClientPage } = useProto();
  const { surface, alsoTalent, role, plan, entityType } = state;

  // Identity bar renders for the three end-user surfaces (workspace +
  // talent + client). Platform HQ has its own dark chrome and skips it.
  if (surface === "platform") return null;

  const inWorkspace = surface === "workspace";
  const inClient    = surface === "client";
  // Resolve client profile from the URL/state-driven id. Two profiles
  // for QA: Martina Beach Club (business) and The Gringo (personal).
  // Inline-defined to dodge HMR cache issues with the fresh export.
  const CP = {
    martina: { name: "Martina Beach Club", initials: "MB", industry: "Hospitality · beach club", contactName: "Martina González", photoUrl: "https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=400&q=80", isBusiness: true },
    gringo:  { name: "The Gringo",         initials: "TG", industry: "Personal client",          contactName: "The Gringo",        photoUrl: "https://i.pravatar.cc/300?img=33", isBusiness: false },
  } as const;
  const activeClientProfile = CP[state.clientProfile] ?? CP.martina;
  const userName = inClient ? activeClientProfile.contactName : MY_TALENT_PROFILE.name;
  const userInitials = inClient ? activeClientProfile.initials : MY_TALENT_PROFILE.initials;
  const userPhotoUrl = inClient ? activeClientProfile.photoUrl : undefined;

  // Acting-as context flips with surface:
  const actingLabel = inWorkspace ? TENANT.name
    : inClient ? activeClientProfile.name
    : MY_TALENT_PROFILE.primaryAgency;
  // Subtext stays terse — the plan tier now has its own badge inline,
  // so this just clarifies the role + entity context.
  const actingSubLabel = inWorkspace
    ? `${role.charAt(0).toUpperCase() + role.slice(1)} · ${entityType}`
    : inClient ? (activeClientProfile.isBusiness ? "Business client" : "Personal client")
    : "Primary agency";
  const actingDetail = inWorkspace
    ? `${fmtMoney(4200)} pending · 3 confirmed`
    : inClient ? activeClientProfile.industry
    : `3 confirmed · ${fmtMoney(4200)} YTD`;
  const onActingClick = () =>
    inWorkspace ? openDrawer("tenant-switcher")
    : inClient ? openDrawer("client-brand-switcher")
    : openDrawer("talent-agency-relationship");

  // The notifications + help drawers differ per surface.
  const notificationsDrawerId = inWorkspace ? "notifications"
    : inClient ? "client-today-pulse"
    : "talent-notifications";
  const notificationsUnread = inWorkspace ? WORKSPACE_UNREAD
    : inClient ? 0
    : TALENT_UNREAD;

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
          <Avatar initials={userInitials} size={26} tone="ink" hashSeed={userName} photoUrl={userPhotoUrl} />
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
          {/* Hamburger icon — universal "menu" affordance. Replaces the
              ambiguous chevron-down so the avatar reads as a tappable
              menu trigger, not just identity. */}
          <span aria-hidden style={{ display: "inline-flex", alignItems: "center", color: COLORS.inkMuted, marginLeft: 1 }}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M2 4h10M2 7h10M2 10h10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
            </svg>
          </span>
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
            transition: `background ${TRANSITION.micro}`,
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
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              fontFamily: FONTS.body,
              fontSize: 13,
              fontWeight: 500,
              color: COLORS.ink,
              letterSpacing: -0.05,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
              lineHeight: 1.15,
            }}>
              <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{actingLabel}</span>
              {inWorkspace && (
                <span
                  data-tulala-plan-tier-badge
                  data-plan={plan}
                  style={{ flexShrink: 0, display: "inline-flex" }}
                >
                  <PlanChip plan={plan} variant="outline" />
                </span>
              )}
            </span>
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
              transition: `transform ${TRANSITION.layout}`,
            }}
          >
            <Icon name="chevron-down" size={10} color={COLORS.inkDim} />
          </span>
        </button>

        <div style={{ flex: 1 }} />

        {/* Mode toggle — only for hybrid users (talent who also have a
            workspace). Hidden on the client surface — clients are
            single-mode and don't have a talent/workspace dual identity. */}
        {alsoTalent && !inClient && <ModeTogglePill surface={surface} flipMode={flipMode} />}

        {/* Global utilities — single source for both modes.
            Workspace + talent surfaces use the new NotificationsBell
            popover hub. Client keeps its dedicated /notifications page. */}
        {inClient ? (
          <IdentityBarIconButton
            aria-label={`Notifications · ${notificationsUnread} unread`}
            onClick={() => setClientPage("notifications")}
            badge={notificationsUnread}
          >
            <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
              <path d="M6 8a6 6 0 1 1 12 0c0 7 3 8 3 8H3s3-1 3-8" />
              <path d="M10 21a2 2 0 0 0 4 0" />
            </svg>
          </IdentityBarIconButton>
        ) : (
          <NotificationsBell />
        )}

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
          onClick={() => toast("Signed out")}
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
  const { toast, state, openDrawer } = useProto();
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
        aria-label={`Open account menu — signed in as ${userName}`}
        aria-haspopup="menu"
        aria-expanded={open}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 8,
          // Always-on subtle pill so the trigger reads as a button, not
          // just an avatar. Stronger when open / hovered. Border makes
          // it visually distinct from a static avatar.
          background: open ? "rgba(11,11,13,0.08)" : "rgba(11,11,13,0.035)",
          border: `1px solid ${open ? "rgba(11,11,13,0.12)" : "rgba(11,11,13,0.07)"}`,
          cursor: "pointer",
          padding: "3px 8px 3px 3px",
          borderRadius: 999,
          fontFamily: FONTS.body,
          transition: `background ${TRANSITION.micro}, border-color ${TRANSITION.micro}`,
        }}
        onMouseEnter={(e) => {
          if (!open) {
            e.currentTarget.style.background = "rgba(11,11,13,0.06)";
            e.currentTarget.style.borderColor = "rgba(11,11,13,0.10)";
          }
        }}
        onMouseLeave={(e) => {
          if (!open) {
            e.currentTarget.style.background = "rgba(11,11,13,0.035)";
            e.currentTarget.style.borderColor = "rgba(11,11,13,0.07)";
          }
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
            onClick={() => { setOpen(false); openDrawer("my-profile"); }}
          />
          <AccountMenuItem
            label="Account settings"
            sub="Email, password, security"
            onClick={() => { setOpen(false); openDrawer("workspace-settings"); }}
          />
          <AccountMenuItem
            label="Notifications"
            sub="Email, push, digest preferences"
            onClick={() => { setOpen(false); openDrawer("notifications-prefs"); }}
          />
          <AccountMenuItem
            label="Language"
            sub="EN · ES"
            onClick={() => { setOpen(false); toast("Coming soon"); }}
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
              onClick={() => { setOpen(false); toast("Signed out"); }}
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
        transition: `background ${TRANSITION.micro}`,
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
              toast(`Language set to ${code === "EN" ? "English" : "Español"}`);
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
              transition: `background ${TRANSITION.micro}, color ${TRANSITION.micro}`,
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
        background: active ? COLORS.fill : "transparent",
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
        if (!active) {
          e.currentTarget.style.color = COLORS.ink;
          // WS-13.5 — warm the dynamic module cache so the flip animation
          // starts instantly rather than waiting for the network.
          if (label === "Talent") void import("./_talent");
        }
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
        transition: `border-color ${TRANSITION.micro}, color ${TRANSITION.micro}`,
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
  const { state, setPage, openDrawer } = useProto();
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
        <div style={{ background: COLORS.surface, minHeight: "calc(100vh - 56px - 56px - 50px)" }}>
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
  const { state, setPage, openDrawer, setWorkspaceLayout } = useProto();
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
            transition: `border-color ${TRANSITION.micro}, color ${TRANSITION.micro}`,
          }}
          onMouseEnter={(e) => { e.currentTarget.style.borderColor = COLORS.border; e.currentTarget.style.color = COLORS.ink; }}
          onMouseLeave={(e) => { e.currentTarget.style.borderColor = COLORS.borderSoft; e.currentTarget.style.color = COLORS.inkMuted; }}
        >
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

// ════════════════════════════════════════════════════════════════════
// Page header shared
// ════════════════════════════════════════════════════════════════════

/**
 * Premium stat strip — replaces the 4-up StatusCard grid that was
 * eating ~440px showing 4 numbers. Single white card with 4 inline
 * tappable cells, separated by hairlines. Each cell has a tone dot,
 * compact label, big tabular number. Mobile collapses to 2x2.
 */
function WorkspaceStatStrip({ items }: {
  items: { label: string; value: number; tone: string; onClick: () => void }[];
}) {
  return (
    <div data-tulala-stat-strip style={{
      background: "#fff", borderRadius: 12,
      border: `1px solid ${COLORS.borderSoft}`,
      boxShadow: "0 1px 2px rgba(11,11,13,0.03)",
      display: "grid",
      gridTemplateColumns: `repeat(${items.length}, 1fr)`,
      overflow: "hidden",
    }}>
      <style>{`
        @media (max-width: 640px) {
          [data-tulala-stat-strip] { grid-template-columns: 1fr 1fr !important; }
          [data-tulala-stat-strip] > button { border-bottom: 1px solid ${COLORS.borderSoft} !important; }
          [data-tulala-stat-strip] > button:nth-last-child(-n+2) { border-bottom: none !important; }
          [data-tulala-stat-strip] > button:nth-child(2n) { border-right: none !important; }
        }
      `}</style>
      {items.map((it, i) => (
        <button key={it.label} type="button" onClick={it.onClick} style={{
          background: "transparent", border: "none", cursor: "pointer",
          padding: "12px 14px", textAlign: "left",
          borderRight: i < items.length - 1 ? `1px solid ${COLORS.borderSoft}` : "none",
          fontFamily: FONTS.body,
        }}
          onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(11,11,13,0.025)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
            <span aria-hidden style={{ width: 5, height: 5, borderRadius: "50%", background: it.tone }} />
            <span style={{ fontSize: 11, color: COLORS.inkMuted, fontWeight: 500 }}>{it.label}</span>
          </div>
          <div style={{
            fontFamily: FONTS.display, fontSize: 22, fontWeight: 700,
            color: COLORS.ink, lineHeight: 1, fontVariantNumeric: "tabular-nums",
          }}>{it.value}</div>
        </button>
      ))}
    </div>
  );
}

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
    <style>{`
      @media (max-width: 680px) {
        [data-tulala-page-back] { display: flex !important; }
        /* Mobile page-header compaction (system-wide).
           Goal: header = navigation/context, never a hero section.
             - title shrinks to 19px (was 30px)
             - eyebrow hidden (it almost always repeats the title)
             - subtitle hidden (rarely earns its space on mobile)
             - bottom margin 10px (was 24px)
           This propagates to every PageHeader caller automatically. */
        [data-tulala-page-header] [data-tulala-h1] {
          font-size: 19px !important;
          line-height: 1.2 !important;
          letter-spacing: -0.25px !important;
          font-weight: 700 !important;
        }
        [data-tulala-page-header] {
          margin-bottom: 10px !important;
          gap: 8px !important;
          align-items: baseline !important;
        }
        [data-tulala-page-header] [data-tulala-page-eyebrow] { display: none !important; }
        [data-tulala-page-header] p { display: none !important; }
        [data-tulala-page-header-actions] {
          flex-shrink: 0 !important;
        }
      }
    `}</style>
    <div
      data-tulala-page-header
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 16,
        marginBottom: 14,
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        {/* Legacy back button (rare — kept for screens that pass onBack) */}
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
          <div data-tulala-page-eyebrow style={{ marginBottom: 6 }}>
            <CapsLabel>{eyebrow}</CapsLabel>
          </div>
        )}
        <h1
          data-tulala-h1
          style={{
            fontFamily: FONTS.display,
            fontSize: 24,
            fontWeight: 600,
            letterSpacing: -0.4,
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
              fontSize: 13,
              color: COLORS.inkMuted,
              margin: "4px 0 0",
              lineHeight: 1.5,
              maxWidth: 640,
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
  const { state, openDrawer, openUpgrade, completeTask, toast, setPage } = useProto();
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
        title={`${greeting()}, ${MY_TALENT_PROFILE.name.split(" ")[0]}`}
        subtitle={new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
        actions={
          canEdit && (
            <PrimaryButton onClick={() => openDrawer("new-inquiry")}>
              New inquiry
            </PrimaryButton>
          )
        }
      />

      {/* WS-9.1 — Workspace activation v2: progress + smart prompts */}
      <WorkspaceActivationBanner />
      {/* WS-9.4 — Demo data toggle for evaluators */}
      <DemoDataBanner />

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

      {/* Stat strip — replaces the old 4-up StatusCard grid that ate
          ~440px of vertical space showing 4 numbers. Premium pattern:
          one compact card with 4 inline metrics, each tappable, no
          card-frame chrome around individual values. */}
      <WorkspaceStatStrip
        items={[
          { label: "Needs you", value: awaiting.length + draftCount, tone: COLORS.coral, onClick: () => openDrawer("today-pulse") },
          { label: "Active", value: richInqs.filter((i) => i.stage !== "rejected" && i.stage !== "expired").length, tone: COLORS.indigo, onClick: () => openDrawer("pipeline") },
          { label: "Confirmed", value: confirmedThisWeek.length, tone: COLORS.success, onClick: () => openDrawer("confirmed-bookings") },
          { label: "Views 7d", value: MOCK_STOREFRONT_STATS.views7d, tone: COLORS.inkMuted, onClick: () => openDrawer("storefront-visibility") },
        ]}
      />

      <div style={{ height: 16 }} />

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
        <SecondaryCard
          title="Approval queue"
          description="Briefs, offers, and documents waiting for sign-off."
          affordance="Review"
          onClick={() => openDrawer("approval-flow")}
        />
      </Grid>

      {/* Analytics — premium section header (sentence-case, compact) */}
      <div style={{ marginTop: 22 }}>
        <div style={{
          display: "flex", alignItems: "center", gap: 8, padding: "0 4px 10px",
        }}>
          <span aria-hidden style={{ width: 5, height: 5, borderRadius: "50%", background: COLORS.indigo }} />
          <h2 style={{
            fontFamily: FONTS.body, fontSize: 13, fontWeight: 600,
            color: COLORS.ink, margin: 0, letterSpacing: -0.1,
          }}>Analytics</h2>
        </div>
        <Grid cols="4">
          <SecondaryCard
            title="Revenue"
            description="MRR, ARR, monthly trend and category breakdown."
            affordance="Open"
            onClick={() => openDrawer("workspace-revenue")}
          />
          <SecondaryCard
            title="Conversion funnel"
            description="Inquiry → offer → booking. Drop-off by stage."
            affordance="Open"
            onClick={() => openDrawer("conversion-funnel")}
          />
          <SecondaryCard
            title="Top performers"
            description="Talent and client rankings by YTD revenue."
            affordance="Open"
            onClick={() => openDrawer("top-performers")}
          />
          <SecondaryCard
            title="Team workload"
            description="Active load, messages, and reply time per coordinator."
            affordance="Open"
            onClick={() => openDrawer("coordinator-workload")}
          />
        </Grid>
      </div>

      {/* WS-20 — Operations entry points */}
      <div style={{ marginTop: 20 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 10,
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
            Operations
          </h2>
        </div>
        <Grid cols="3">
          <SecondaryCard
            title="My queue"
            description="Your assigned inquiries sorted by SLA urgency."
            affordance="Open"
            onClick={() => openDrawer("my-queue")}
          />
          <SecondaryCard
            title="SLA timers"
            description="Response deadlines across all active inquiries."
            affordance="Open"
            onClick={() => openDrawer("sla-timers")}
          />
          <SecondaryCard
            title="Automation rules"
            description="Trigger-action rules that run automatically."
            affordance="Open"
            onClick={() => openDrawer("rules-builder")}
          />
          <SecondaryCard
            title="Saved replies"
            description="Reusable message templates with variable substitution."
            affordance="Open"
            onClick={() => openDrawer("saved-replies")}
          />
          <SecondaryCard
            title="Vacation handover"
            description="Reassign your workload while you're away."
            affordance="Open"
            onClick={() => openDrawer("vacation-handover")}
          />
          <SecondaryCard
            title="On-call rotation"
            description="Weekly schedule and escalation ladder."
            affordance="Open"
            onClick={() => openDrawer("on-call-rotation")}
          />
        </Grid>
      </div>

      {/* Pointers to the new Operations + Production pages */}
      <div style={{ marginTop: 28, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <button
          type="button"
          onClick={() => setPage("operations")}
          style={{
            display: "flex", alignItems: "center", gap: 14,
            padding: "16px 18px", textAlign: "left", cursor: "pointer",
            background: COLORS.surface, border: `1px solid ${COLORS.border}`, borderRadius: RADIUS.md,
            fontFamily: FONTS.body, transition: TRANSITION.sm,
          }}
        >
          <div style={{ width: 40, height: 40, borderRadius: RADIUS.md, background: COLORS.indigoSoft, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <Icon name="bolt" size={18} color={COLORS.indigo} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: COLORS.ink }}>Operations</div>
            <div style={{ fontSize: 12, color: COLORS.inkMuted, marginTop: 2 }}>Analytics, queues, automations, comms.</div>
          </div>
          <Icon name="arrow-right" size={14} color={COLORS.inkMuted} />
        </button>
        <button
          type="button"
          onClick={() => setPage("production")}
          style={{
            display: "flex", alignItems: "center", gap: 14,
            padding: "16px 18px", textAlign: "left", cursor: "pointer",
            background: COLORS.surface, border: `1px solid ${COLORS.border}`, borderRadius: RADIUS.md,
            fontFamily: FONTS.body, transition: TRANSITION.sm,
          }}
        >
          <div style={{ width: 40, height: 40, borderRadius: RADIUS.md, background: COLORS.accentSoft, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <Icon name="team" size={18} color={COLORS.accent} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: COLORS.ink }}>Production</div>
            <div style={{ fontSize: 12, color: COLORS.inkMuted, marginTop: 2 }}>Casting, crew, on-set, rights & safety.</div>
          </div>
          <Icon name="arrow-right" size={14} color={COLORS.inkMuted} />
        </button>
      </div>

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
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <button
              type="button"
              onClick={() => openDrawer("ai-weekly-digest")}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                padding: "4px 9px",
                background: COLORS.royalSoft,
                border: `1px solid rgba(95,75,139,0.2)`,
                borderRadius: RADIUS.sm,
                fontFamily: FONTS.body,
                fontSize: 11.5,
                fontWeight: 600,
                color: COLORS.royal,
                cursor: "pointer",
              }}
            >
              <Icon name="sparkle" size={11} color={COLORS.royal} stroke={1.8} />
              Weekly digest
            </button>
            <GhostButton size="sm" onClick={() => openDrawer("team-activity")}>View all</GhostButton>
          </div>
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
  const { state, setPage, openDrawer, openUpgrade, completeTask, toast, effectiveRoster } = useProto();

  // Live signals that prove a step is "really done" — overrides the
  // user-confirmed Set. Order: real state first, manual confirmation
  // second. This way a returning user with 3 talents already on roster
  // sees "Add your first talent" pre-checked, even if they never clicked
  // the row in this prototype session.
  //
  // `effectiveRoster` is `bridgeRoster ?? getRoster(plan)` — Phase 1
  // real-data bridge (set by `?dataSource=live` server pre-fetch). When
  // the bridge is null (default mock mode) it transparently falls back
  // to the per-plan mock arrays; when present it overrides them.
  const liveRoster = effectiveRoster;
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
              background: COLORS.fill,
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
                      toast(`"${task.label}" marked done`);
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
                    transition: `border-color ${TRANSITION.micro}`,
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
// ════════════════════════════════════════════════════════════════════
// WORKSPACE MESSAGES — WhatsApp-style 3-pane (list + inline conversation)
// ════════════════════════════════════════════════════════════════════
// Aligns with TalentMessagesPage. List on the left, full inquiry workspace
// (private/group tabs + rail) inline on the right. No drawer-on-click.
//
// Mobile: single-pane stack (list ↔ thread) — toggled via [data-mobile-pane].

function WorkspaceMessagesPage() {
  return <MessagesShell pov="admin" />;
}

function UnifiedInboxPage() {
  const { openDrawer, setPage, toast } = useProto();
  // Route inquiry clicks through the new MessagesShell instead of the
  // legacy drawer.
  const goToInquiryMessages = (inquiryId: string) => {
    pinNextConversationP(inquiryId);
    setPage("messages");
  };
  // Use RICH_INQUIRIES so we have nextActionBy / unread / lastActivityHrs.
  const inquiries = RICH_INQUIRIES;
  // WS-3.3 — "by-stage" adds pipeline columns view within Messages
  const [filter, setFilter] = useState<"needs-me" | "all" | "unread" | "by-stage">("needs-me");
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
        title="Inbox"
        subtitle="Threads, mentions & notifications — sorted by what needs you."
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
              toast(`Marked ${selected.size} ${selected.size === 1 ? "item" : "items"} read`);
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
              toast(`Archived ${selected.size} ${selected.size === 1 ? "item" : "items"}`);
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
            { id: "all",      label: `All · ${inquiries.filter((i) => isOpen(i.stage)).length}` },
            { id: "unread",   label: `Unread · ${inquiries.filter((i) => isOpen(i.stage) && i.unreadGroup > 0).length}` },
            { id: "by-stage", label: "By stage" },
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
                background: active ? COLORS.fill : "rgba(11,11,13,0.04)",
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

      {/* WS-3.3 — "By stage" pipeline columns view */}
      {filter === "by-stage" ? (
        <InboxPipelineView
          inquiries={RICH_INQUIRIES.filter((i) => isOpen(i.stage))}
          onOpen={(id) => openDrawer("inquiry-workspace", { inquiryId: id })}
        />
      ) : rows.length === 0 ? (
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
                    onClick: () => toast(`Snoozed ${inq.clientName} for 4h`),
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
                  onClick={() => goToInquiryMessages(inq.id)}
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
                          {inq.unreadGroup} group
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
                          onAccept={() => toast("Offer accepted")}
                          onCounter={() => {
                            goToInquiryMessages(inq.id);
                          }}
                          onDecline={() => toast("Offer declined")}
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
      {filter !== "by-stage" && (
        <LoadMore
          total={matched.length}
          shown={rows.length}
          onMore={() => setPagesShown((p) => p + 1)}
        />
      )}
      {/* FAB — full quick-create menu (mobile only) */}
      <FabWithQuickCreate label="Create new" />
    </>
  );
}

/**
 * Mobile FAB that opens the canonical quick-create sheet. Use this
 * instead of <FloatingFab onClick={...}> on any page that wants the
 * full "+ New" experience on small screens.
 */
function FabWithQuickCreate({ label = "Create new" }: { label?: string }) {
  const actions = useQuickCreateActionsFiltered();
  if (actions.length === 0) return null;
  return <FloatingFab label={label} actions={actions} />;
}

// ─── WS-3.3 InboxPipelineView ────────────────────────────────────────────────

const PIPELINE_STAGES: Array<{ id: RichInquiry["stage"]; label: string; color: string }> = [
  { id: "submitted",     label: "Submitted",     color: "#6366F1" },
  { id: "coordination",  label: "Coordinating",  color: "#3B82F6" },
  { id: "offer_pending", label: "Offer pending",  color: "#F59E0B" },
  { id: "approved",      label: "Approved",      color: "#10B981" },
  { id: "booked",        label: "Booked",        color: "#059669" },
];

function InboxPipelineView({
  inquiries,
  onOpen,
}: {
  inquiries: RichInquiry[];
  onOpen: (id: string) => void;
}) {
  return (
    <div
      style={{
        display: "flex",
        gap: 10,
        overflowX: "auto",
        paddingBottom: 12,
      }}
    >
      {PIPELINE_STAGES.map((col) => {
        const colInqs = inquiries.filter((i) => i.stage === col.id);
        return (
          <div
            key={col.id}
            style={{
              minWidth: 200, width: 220, flexShrink: 0,
              background: COLORS.surfaceAlt, borderRadius: RADIUS.lg,
              border: `1px solid ${COLORS.border}`, overflow: "hidden",
            }}
          >
            {/* Column header */}
            <div style={{
              display: "flex", alignItems: "center", gap: 6,
              padding: "10px 12px",
              borderBottom: `1px solid ${COLORS.border}`,
              background: "#fff",
            }}>
              <div style={{ width: 8, height: 8, borderRadius: "50%", background: col.color, flexShrink: 0 }} />
              <span style={{ fontSize: 12, fontWeight: 700, color: COLORS.ink, fontFamily: FONTS.body }}>{col.label}</span>
              <span style={{
                marginLeft: "auto", fontSize: 11, fontWeight: 700, color: "#fff",
                background: col.color, borderRadius: 999,
                padding: "1px 6px", fontFamily: FONTS.body,
              }}>{colInqs.length}</span>
            </div>

            {/* Cards */}
            <div style={{ display: "flex", flexDirection: "column", gap: 6, padding: 8 }}>
              {colInqs.length === 0 ? (
                <div style={{ padding: "12px 8px", textAlign: "center", fontSize: 11.5, color: COLORS.inkDim, fontFamily: FONTS.body }}>
                  All clear
                </div>
              ) : (
                colInqs.map((inq) => (
                  <button
                    key={inq.id}
                    type="button"
                    onClick={() => onOpen(inq.id)}
                    style={{
                      display: "block", width: "100%", textAlign: "left",
                      padding: "10px 12px",
                      background: "#fff", border: `1px solid ${COLORS.borderSoft}`,
                      borderRadius: RADIUS.md, cursor: "pointer",
                      fontFamily: FONTS.body,
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.borderColor = COLORS.accent)}
                    onMouseLeave={(e) => (e.currentTarget.style.borderColor = COLORS.borderSoft)}
                  >
                    <div style={{ fontSize: 12.5, fontWeight: 600, color: COLORS.ink, marginBottom: 2 }}>
                      {inq.clientName}
                    </div>
                    <div style={{ fontSize: 11, color: COLORS.inkMuted, marginBottom: 4, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {inq.brief}
                    </div>
                    {inq.unreadGroup > 0 && (
                      <span style={{
                        fontSize: 10, fontWeight: 700, color: "#fff",
                        background: COLORS.accent, borderRadius: 999, padding: "1px 5px",
                      }}>
                        {inq.unreadGroup} new
                      </span>
                    )}
                  </button>
                ))
              )}
            </div>
          </div>
        );
      })}
    </div>
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
  const { openDrawer, setPage } = useProto();
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

  // Month-aggregate counts for the StatusStrip.
  const allMonthEvents = Object.values(events).flat();
  const monthCounts = {
    confirmed: allMonthEvents.filter((e) => e.tone === "green").length,
    submitted: allMonthEvents.filter((e) => e.tone === "amber").length,
    inProgress: allMonthEvents.filter((e) => e.tone === "ink").length,
    expired: allMonthEvents.filter((e) => e.tone === "red").length,
  };

  return (
    <>
      <PageHeader
        title="Calendar"
        actions={
          <SecondaryButton onClick={() => openDrawer("new-booking")}>
            New booking
          </SecondaryButton>
        }
      />

      <StatusStrip
        ariaLabel={`${monthLabel} overview`}
        items={[
          { id: "confirmed",  label: "Confirmed",   value: monthCounts.confirmed,  tone: "green" },
          { id: "submitted",  label: "Submitted",   value: monthCounts.submitted,  tone: "amber" },
          { id: "inProgress", label: "In progress", value: monthCounts.inProgress, tone: "ink" },
          { id: "expired",    label: "Expired",     value: monthCounts.expired,    tone: "red" },
        ]}
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
                  transition: `background ${TRANSITION.micro}`,
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
                    onClick={(ev) => { ev.stopPropagation(); pinNextConversationP(e.id); setPage("messages"); }}
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
        transition: `border-color ${TRANSITION.micro}, color ${TRANSITION.micro}`,
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
  const { state, openDrawer, setPage, openUpgrade, toast } = useProto();
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
    toast(`Exported ${filteredInquiries.length} rows to CSV`);
  };

  const drafts = inquiries.filter((i) => i.stage === "draft" || i.stage === "hold");
  const awaiting = inquiries.filter((i) => i.stage === "awaiting-client");
  const confirmed = inquiries.filter((i) => i.stage === "confirmed");

  return (
    <>
      <PageHeader
        title="Workflow"
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

      <StatusStrip
        ariaLabel="Pipeline overview"
        items={[
          { id: "drafts",    label: "Drafts & holds", value: drafts.length,    tone: "amber",  onClick: () => openDrawer("drafts-holds") },
          { id: "awaiting",  label: "Awaiting client", value: awaiting.length, tone: "amber",  onClick: () => openDrawer("awaiting-client") },
          { id: "confirmed", label: "Confirmed",      value: confirmed.length, tone: "green",  onClick: () => openDrawer("confirmed-bookings") },
        ]}
      />

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
                  pinNextConversationP(rich.id);
                  setPage("messages");
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
                transition: `background ${TRANSITION.micro}`,
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
      {canEdit && <FabWithQuickCreate />}
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
              transition: `background ${TRANSITION.micro}, color ${TRANSITION.micro}`,
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
                        background: near ? COLORS.amber : COLORS.fill,
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

// ════════════════════════════════════════════════════════════════════
// ROSTER (talent page) — 2026 redesign
// ── Replaces the legacy 4-up StatusCard + box-grid layout ─────────────
//   • Single-line status strip (clickable filter)
//   • Premium hairline cards w/ real photos, type chip, completeness
//   • Grid + List view toggle
//   • Inline filter chips (Status × Type) + search + sort with direction
//   • Pending-approvals strip when self-registrations are queued
//   • Bulk-select sticky action bar
//   • Cards open the new TalentProfileShellDrawer (not legacy drawer)
// ════════════════════════════════════════════════════════════════════

function TalentPage() {
  const { state, openDrawer, openUpgrade, toast, pendingTalent, effectiveRoster } = useProto();
  // Phase 1 real-data bridge: when `?dataSource=live` is set on the URL,
  // the server pre-fetches Impronta's roster and `effectiveRoster` is
  // those rows. When absent, this falls back to `getRoster(plan)` per
  // the existing mock behaviour — same shape, same code path.
  const roster = effectiveRoster;
  const canEdit = meetsRole(state.role, "editor");
  const isFree = state.plan === "free";

  const [search, setSearch] = useState("");
  const [stateFilter, setStateFilter] = useState<"all" | "published" | "draft" | "invited" | "awaiting-approval">("all");
  const [typeFilter, setTypeFilter] = useState<TaxonomyParentId | "all">("all");
  const [sort, setSort] = useState<"name" | "completeness" | "newest">("name");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [view, setView] = useState<"grid" | "list">("grid");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [moreOpen, setMoreOpen] = useState(false);

  // Resolve a parent-type filter to its children (for filtering by primaryType id).
  const typeFilterChildren = typeFilter === "all"
    ? null
    : new Set(TAXONOMY.find(p => p.id === typeFilter)?.children.map(c => c.id) ?? []);

  const filteredRoster = roster
    .filter((p) => stateFilter === "all" || p.state === stateFilter)
    .filter((p) => !typeFilterChildren || (p.primaryType !== undefined && typeFilterChildren.has(p.primaryType)))
    .filter((p) => {
      if (!search.trim()) return true;
      const q = search.trim().toLowerCase();
      return (
        p.name.toLowerCase().includes(q) ||
        (p.city ?? "").toLowerCase().includes(q) ||
        (p.primaryType ?? "").toLowerCase().includes(q)
      );
    })
    .sort((a, b) => {
      let r = 0;
      if (sort === "name") r = a.name.localeCompare(b.name);
      else if (sort === "completeness") r = (b.completeness ?? 0) - (a.completeness ?? 0);
      // newest = source order = 0
      return sortDir === "asc" ? r : -r;
    });

  const counts = {
    published: roster.filter((r) => r.state === "published").length,
    draft: roster.filter((r) => r.state === "draft").length,
    invited: roster.filter((r) => r.state === "invited").length,
    awaiting: roster.filter((r) => r.state === "awaiting-approval").length,
  };

  // Talent-type parents that actually exist in the roster — drives the
  // type filter chips (no point showing "Chefs" if there are 0 chefs).
  const usedTypes = Array.from(new Set(
    roster
      .map((r) => {
        if (!r.primaryType) return null;
        for (const p of TAXONOMY) {
          if (p.children.some((c) => c.id === r.primaryType)) return p.id;
        }
        return null;
      })
      .filter((x): x is TaxonomyParentId => x !== null)
  ));

  const pendingCount = pendingTalent.length;

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
    toast(`Exported ${filteredRoster.length} rows to CSV`);
  };

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

  // Bulk select helpers
  const toggleSelect = (id: string) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  const clearSelected = () => setSelected(new Set());
  const selectAll = () => setSelected(new Set(filteredRoster.map((p) => p.id)));

  // Card click → open the new profile shell with seed data
  const openProfile = (p: TalentProfile) => {
    openDrawer("talent-profile-shell", {
      mode: "edit-admin",
      seed: {
        stageName: p.name,
        primaryType: p.primaryType,
        homeBase: p.city,
      },
    });
  };

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
            {!canEdit && <ReadOnlyChip />}
            {canEdit && (
              <>
                <RosterMoreMenu
                  open={moreOpen}
                  onToggle={() => setMoreOpen((o) => !o)}
                  onClose={() => setMoreOpen(false)}
                  onExport={exportCsv}
                  onImport={() => {
                    setMoreOpen(false);
                    toast("Bulk import CSV — upload a .csv with name, email, city, height columns.");
                  }}
                  onTypes={() => {
                    setMoreOpen(false);
                    openDrawer("talent-types");
                  }}
                />
                <GhostButton onClick={() => openDrawer("invite-flow")}>Invite</GhostButton>
                <PrimaryButton onClick={() => openDrawer("new-talent")}>
                  {state.entityType === "hub" ? "Invite member" : "Add talent"}
                </PrimaryButton>
              </>
            )}
          </>
        }
      />

      {/* Pending approvals strip — only when there are self-registrations to review */}
      {canEdit && pendingCount > 0 && (
        <PendingApprovalsStrip
          count={pendingCount}
          onReview={() => openDrawer("talent-approvals")}
        />
      )}

      {/* Self-on-roster — refined to match new aesthetic */}
      {state.alsoTalent && (
        <SelfOnRosterRow onEdit={() => openDrawer("my-profile")} />
      )}

      {/* Cap nudge — kept as a thin top strip when relevant */}
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

      {/* Status strip — single line replaces 4-up StatusCard. Each segment
          is a clickable filter (toggle on/off). */}
      <RosterStatusStrip
        counts={counts}
        active={stateFilter}
        onFilter={(f) => setStateFilter(f === stateFilter ? "all" : f)}
      />

      {/* Filter bar — search + type chips + sort + view toggle */}
      <RosterFilterBar
        search={search}
        onSearch={setSearch}
        typeFilter={typeFilter}
        onTypeFilter={setTypeFilter}
        usedTypes={usedTypes}
        sort={sort}
        sortDir={sortDir}
        onSort={(s) => {
          if (s === sort) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
          else { setSort(s); setSortDir("asc"); }
        }}
        view={view}
        onView={setView}
        canBulk={canEdit}
        selectedCount={selected.size}
        onSelectAll={selectAll}
        onClearSelection={clearSelected}
        resultCount={filteredRoster.length}
        totalCount={roster.length}
      />

      {/* Body — grid / list / empty */}
      {filteredRoster.length === 0 ? (
        <RosterEmptyState
          searching={!!search.trim()}
          query={search.trim()}
          onClear={() => {
            setSearch("");
            setStateFilter("all");
            setTypeFilter("all");
          }}
          onAdd={canEdit ? () => openDrawer("new-talent") : undefined}
        />
      ) : view === "grid" ? (
        <RosterGrid
          items={filteredRoster}
          selected={selected}
          onSelect={canEdit ? toggleSelect : undefined}
          onOpen={openProfile}
        />
      ) : (
        <RosterList
          items={filteredRoster}
          selected={selected}
          onSelect={canEdit ? toggleSelect : undefined}
          onOpen={openProfile}
        />
      )}

      {/* Bulk action bar — sticky bottom when selection > 0 */}
      {selected.size > 0 && canEdit && (
        <RosterBulkActionBar
          count={selected.size}
          onClear={clearSelected}
          onPublish={() => { toast(`Published ${selected.size} profiles`); clearSelected(); }}
          onArchive={() => { toast(`Archived ${selected.size} profiles`); clearSelected(); }}
          onMessage={() => toast("Opening message thread for selection")}
        />
      )}

      {/* Mobile FAB — full quick-create menu */}
      {canEdit && <FabWithQuickCreate />}
    </>
  );
}

// ── Pending approvals strip ─────────────────────────────────────────
function PendingApprovalsStrip({ count, onReview }: { count: number; onReview: () => void }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "10px 14px",
        marginBottom: 14,
        borderRadius: 12,
        background: COLORS.amberSoft,
        border: `1px solid rgba(82,96,109,0.18)`,
        fontFamily: FONTS.body,
      }}
    >
      <span
        style={{
          width: 32,
          height: 32,
          borderRadius: "50%",
          background: "#fff",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
          fontSize: 14,
        }}
      >
        🔍
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.amberDeep }}>
          {count} self-registration{count === 1 ? "" : "s"} waiting for review
        </div>
        <div style={{ fontSize: 11.5, color: COLORS.inkMuted, marginTop: 1 }}>
          Approve, request changes, or reject. Average review time: under 24h.
        </div>
      </div>
      <button
        type="button"
        onClick={onReview}
        style={{
          padding: "7px 14px",
          borderRadius: 999,
          border: "none",
          background: COLORS.amberDeep,
          color: "#fff",
          fontFamily: FONTS.body,
          fontSize: 12.5,
          fontWeight: 600,
          cursor: "pointer",
          whiteSpace: "nowrap",
        }}
      >
        Review →
      </button>
    </div>
  );
}

// ── Self-on-roster row — refined hairline strip ─────────────────────
function SelfOnRosterRow({ onEdit }: { onEdit: () => void }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "8px 14px",
        marginBottom: 14,
        borderRadius: 999,
        background: "rgba(11,11,13,0.03)",
        border: `1px solid ${COLORS.borderSoft}`,
        fontFamily: FONTS.body,
      }}
    >
      <span style={{ fontSize: 13 }}>👤</span>
      <div style={{ flex: 1, minWidth: 0, fontSize: 12, color: COLORS.inkMuted }}>
        You're on this roster too — your public listing is what bookers see.
      </div>
      <button
        type="button"
        onClick={onEdit}
        style={{
          padding: 0,
          background: "transparent",
          border: "none",
          color: COLORS.ink,
          fontSize: 12,
          fontWeight: 600,
          cursor: "pointer",
          fontFamily: FONTS.body,
        }}
      >
        Edit my profile →
      </button>
    </div>
  );
}

// ── Roster status strip ─────────────────────────────────────────────
function RosterStatusStrip({
  counts,
  active,
  onFilter,
}: {
  counts: { published: number; draft: number; invited: number; awaiting: number };
  active: "all" | "published" | "draft" | "invited" | "awaiting-approval";
  onFilter: (f: "published" | "draft" | "invited" | "awaiting-approval") => void;
}) {
  const items: { id: "published" | "awaiting-approval" | "invited" | "draft"; label: string; count: number; tone: string }[] = [
    { id: "published",         label: "Published",  count: counts.published, tone: COLORS.green },
    { id: "awaiting-approval", label: "Pending",    count: counts.awaiting,  tone: COLORS.amber },
    { id: "invited",           label: "Invited",    count: counts.invited,   tone: COLORS.indigoDeep },
    { id: "draft",             label: "Draft",      count: counts.draft,     tone: COLORS.inkMuted },
  ];
  return (
    <div
      data-tulala-roster-status
      style={{
        display: "flex",
        alignItems: "stretch",
        gap: 0,
        padding: 4,
        borderRadius: 12,
        background: "#fff",
        border: `1px solid ${COLORS.borderSoft}`,
        boxShadow: "0 1px 2px rgba(11,11,13,0.03)",
        marginBottom: 14,
        fontFamily: FONTS.body,
        overflowX: "auto",
        scrollbarWidth: "none",
      }}
    >
      {items.map((it, i) => {
        const isActive = active === it.id;
        return (
          <button
            key={it.id}
            type="button"
            onClick={() => onFilter(it.id)}
            disabled={it.count === 0}
            style={{
              flex: 1,
              minWidth: 96,
              padding: "10px 14px",
              border: "none",
              background: isActive ? "rgba(15,79,62,0.06)" : "transparent",
              borderRadius: 8,
              cursor: it.count === 0 ? "default" : "pointer",
              opacity: it.count === 0 ? 0.5 : 1,
              textAlign: "left",
              borderRight: i < items.length - 1 ? `1px solid ${COLORS.borderSoft}` : "none",
              fontFamily: FONTS.body,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
              <span
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: "50%",
                  background: it.tone,
                }}
              />
              <span style={{ fontSize: 11, color: COLORS.inkMuted, fontWeight: 500 }}>{it.label}</span>
            </div>
            <div
              style={{
                fontFamily: FONTS.display,
                fontSize: 22,
                fontWeight: 500,
                color: isActive ? COLORS.accentDeep : COLORS.ink,
                letterSpacing: -0.4,
                lineHeight: 1,
              }}
            >
              {it.count}
            </div>
          </button>
        );
      })}
    </div>
  );
}

// ── Roster filter bar ───────────────────────────────────────────────
function RosterFilterBar({
  search, onSearch,
  typeFilter, onTypeFilter, usedTypes,
  sort, sortDir, onSort,
  view, onView,
  canBulk, selectedCount, onSelectAll, onClearSelection,
  resultCount, totalCount,
}: {
  search: string;
  onSearch: (s: string) => void;
  typeFilter: TaxonomyParentId | "all";
  onTypeFilter: (f: TaxonomyParentId | "all") => void;
  usedTypes: TaxonomyParentId[];
  sort: "name" | "completeness" | "newest";
  sortDir: "asc" | "desc";
  onSort: (s: "name" | "completeness" | "newest") => void;
  view: "grid" | "list";
  onView: (v: "grid" | "list") => void;
  canBulk: boolean;
  selectedCount: number;
  onSelectAll: () => void;
  onClearSelection: () => void;
  resultCount: number;
  totalCount: number;
}) {
  return (
    <div
      data-tulala-roster-filterbar
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        flexWrap: "wrap",
        marginBottom: 14,
        fontFamily: FONTS.body,
      }}
    >
      <style>{`
        @media (max-width: 720px) {
          [data-tulala-roster-filterbar] { gap: 6px; }
          [data-tulala-roster-filterbar] [data-rfb-search] { width: 100% !important; order: -1; }
        }
      `}</style>
      {/* Search */}
      <div data-rfb-search style={{ position: "relative", width: 240 }}>
        <span
          aria-hidden
          style={{
            position: "absolute",
            top: "50%",
            left: 12,
            transform: "translateY(-50%)",
            color: COLORS.inkMuted,
            fontSize: 13,
            pointerEvents: "none",
          }}
        >
          ⌕
        </span>
        <input
          type="text"
          aria-label="Search roster"
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          placeholder="Search by name, type, city…"
          style={{
            width: "100%",
            boxSizing: "border-box",
            padding: "8px 10px 8px 32px",
            fontFamily: FONTS.body,
            fontSize: 12.5,
            color: COLORS.ink,
            background: "#fff",
            border: `1px solid ${COLORS.borderSoft}`,
            borderRadius: 999,
            outline: "none",
          }}
          onFocus={(e) => (e.currentTarget.style.borderColor = COLORS.border)}
          onBlur={(e) => (e.currentTarget.style.borderColor = COLORS.borderSoft)}
        />
      </div>

      {/* Type chips — only if roster has typed talent */}
      {usedTypes.length > 0 && (
        <div style={{ display: "flex", gap: 4, alignItems: "center", flexWrap: "wrap" }}>
          <FilterChip
            label="All types"
            active={typeFilter === "all"}
            onClick={() => onTypeFilter("all")}
          />
          {usedTypes.map((t) => {
            const meta = TAXONOMY.find((p) => p.id === t)!;
            return (
              <FilterChip
                key={t}
                label={meta.label}
                emoji={meta.emoji}
                active={typeFilter === t}
                onClick={() => onTypeFilter(t)}
              />
            );
          })}
        </div>
      )}

      <div style={{ flex: 1 }} />

      {/* Result count */}
      <div style={{ fontSize: 11.5, color: COLORS.inkMuted, fontWeight: 500 }}>
        {resultCount === totalCount ? `${totalCount} talent` : `${resultCount} of ${totalCount}`}
      </div>

      {/* Sort */}
      <SortButton sort={sort} sortDir={sortDir} onSort={onSort} />

      {/* View toggle */}
      <ViewToggle view={view} onView={onView} />

      {/* Bulk select count (only when active) */}
      {canBulk && selectedCount > 0 && (
        <button
          type="button"
          onClick={onClearSelection}
          style={{
            padding: "5px 10px",
            background: "rgba(15,79,62,0.08)",
            border: `1px solid ${COLORS.accent}`,
            color: COLORS.accentDeep,
            borderRadius: 999,
            cursor: "pointer",
            fontFamily: FONTS.body,
            fontSize: 11.5,
            fontWeight: 600,
          }}
        >
          {selectedCount} selected · clear
        </button>
      )}
      {canBulk && selectedCount === 0 && (
        <button
          type="button"
          onClick={onSelectAll}
          aria-label="Select all"
          style={{
            padding: "5px 10px",
            background: "transparent",
            border: `1px solid ${COLORS.borderSoft}`,
            color: COLORS.inkMuted,
            borderRadius: 999,
            cursor: "pointer",
            fontFamily: FONTS.body,
            fontSize: 11.5,
            fontWeight: 500,
          }}
        >
          Select all
        </button>
      )}
    </div>
  );
}

function FilterChip({
  label,
  emoji,
  active,
  onClick,
}: {
  label: string;
  emoji?: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        padding: "5px 11px",
        borderRadius: 999,
        border: `1px solid ${active ? COLORS.accent : COLORS.borderSoft}`,
        background: active ? "rgba(15,79,62,0.08)" : "#fff",
        color: active ? COLORS.accentDeep : COLORS.ink,
        cursor: "pointer",
        fontFamily: FONTS.body,
        fontSize: 11.5,
        fontWeight: active ? 600 : 500,
        whiteSpace: "nowrap",
      }}
    >
      {emoji && <span aria-hidden style={{ fontSize: 12 }}>{emoji}</span>}
      {label}
    </button>
  );
}

function SortButton({
  sort,
  sortDir,
  onSort,
}: {
  sort: "name" | "completeness" | "newest";
  sortDir: "asc" | "desc";
  onSort: (s: "name" | "completeness" | "newest") => void;
}) {
  const [open, setOpen] = useState(false);
  const sortLabel = {
    name: "Name",
    completeness: "Completeness",
    newest: "Newest",
  }[sort];
  const arrow = sort === "newest" ? "" : sortDir === "asc" ? " ↑" : " ↓";
  return (
    <div style={{ position: "relative" }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        style={{
          padding: "5px 11px",
          background: "#fff",
          border: `1px solid ${COLORS.borderSoft}`,
          color: COLORS.ink,
          borderRadius: 999,
          cursor: "pointer",
          fontFamily: FONTS.body,
          fontSize: 11.5,
          fontWeight: 500,
          whiteSpace: "nowrap",
        }}
      >
        Sort: <strong>{sortLabel}{arrow}</strong>
      </button>
      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 50 }} />
          <div
            style={{
              position: "absolute",
              top: "calc(100% + 4px)",
              right: 0,
              zIndex: 51,
              background: "#fff",
              border: `1px solid ${COLORS.borderSoft}`,
              borderRadius: 10,
              boxShadow: "0 10px 30px -8px rgba(11,11,13,0.18)",
              minWidth: 160,
              padding: 4,
              fontFamily: FONTS.body,
            }}
          >
            {(["name", "completeness", "newest"] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => {
                  onSort(s);
                  setOpen(false);
                }}
                style={{
                  width: "100%",
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "8px 10px",
                  borderRadius: 6,
                  border: "none",
                  background: s === sort ? "rgba(11,11,13,0.04)" : "transparent",
                  cursor: "pointer",
                  textAlign: "left",
                  fontSize: 12.5,
                  fontWeight: 500,
                  color: COLORS.ink,
                }}
              >
                {s === "name" ? "Name" : s === "completeness" ? "Completeness" : "Newest"}
                {s === sort && <span style={{ marginLeft: "auto", color: COLORS.inkMuted, fontSize: 11 }}>{sortDir === "asc" ? "↑" : "↓"}</span>}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function ViewToggle({ view, onView }: { view: "grid" | "list"; onView: (v: "grid" | "list") => void }) {
  return (
    <div
      style={{
        display: "inline-flex",
        padding: 2,
        background: "rgba(11,11,13,0.04)",
        borderRadius: 999,
        flexShrink: 0,
      }}
    >
      {(["grid", "list"] as const).map((v) => (
        <button
          key={v}
          type="button"
          onClick={() => onView(v)}
          aria-label={`${v} view`}
          aria-pressed={view === v}
          style={{
            width: 28,
            height: 24,
            borderRadius: 999,
            border: "none",
            background: view === v ? "#fff" : "transparent",
            color: view === v ? COLORS.ink : COLORS.inkMuted,
            cursor: "pointer",
            fontSize: 11,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            boxShadow: view === v ? "0 1px 2px rgba(11,11,13,0.08)" : "none",
          }}
        >
          {v === "grid" ? (
            <svg width="11" height="11" viewBox="0 0 16 16" fill="none">
              <rect x="2" y="2" width="5" height="5" rx="1" fill="currentColor" />
              <rect x="9" y="2" width="5" height="5" rx="1" fill="currentColor" />
              <rect x="2" y="9" width="5" height="5" rx="1" fill="currentColor" />
              <rect x="9" y="9" width="5" height="5" rx="1" fill="currentColor" />
            </svg>
          ) : (
            <svg width="11" height="11" viewBox="0 0 16 16" fill="none">
              <rect x="2" y="3" width="12" height="2" rx="1" fill="currentColor" />
              <rect x="2" y="7" width="12" height="2" rx="1" fill="currentColor" />
              <rect x="2" y="11" width="12" height="2" rx="1" fill="currentColor" />
            </svg>
          )}
        </button>
      ))}
    </div>
  );
}

// ── Roster more menu (... button for Export / Import / Manage types) ─
function RosterMoreMenu({
  open,
  onToggle,
  onClose,
  onExport,
  onImport,
  onTypes,
}: {
  open: boolean;
  onToggle: () => void;
  onClose: () => void;
  onExport: () => void;
  onImport: () => void;
  onTypes: () => void;
}) {
  return (
    <div style={{ position: "relative" }}>
      <button
        type="button"
        onClick={onToggle}
        aria-label="More actions"
        style={{
          width: 32,
          height: 32,
          borderRadius: 999,
          background: "#fff",
          border: `1px solid ${COLORS.borderSoft}`,
          color: COLORS.ink,
          cursor: "pointer",
          fontSize: 14,
          lineHeight: 1,
          fontWeight: 600,
        }}
      >
        ⋯
      </button>
      {open && (
        <>
          <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 50 }} />
          <div
            style={{
              position: "absolute",
              top: "calc(100% + 6px)",
              right: 0,
              zIndex: 51,
              background: "#fff",
              border: `1px solid ${COLORS.borderSoft}`,
              borderRadius: 10,
              boxShadow: "0 12px 36px -8px rgba(11,11,13,0.20)",
              minWidth: 200,
              padding: 4,
              fontFamily: FONTS.body,
            }}
          >
            {[
              { id: "export", label: "Export CSV",    onClick: onExport },
              { id: "import", label: "Import CSV",    onClick: onImport },
              { id: "types",  label: "Talent types…", onClick: onTypes },
            ].map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={item.onClick}
                style={{
                  width: "100%",
                  textAlign: "left",
                  padding: "8px 12px",
                  borderRadius: 6,
                  border: "none",
                  background: "transparent",
                  cursor: "pointer",
                  fontSize: 12.5,
                  fontWeight: 500,
                  color: COLORS.ink,
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(11,11,13,0.04)")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
              >
                {item.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ── Roster grid ─────────────────────────────────────────────────────
function RosterGrid({
  items,
  selected,
  onSelect,
  onOpen,
}: {
  items: TalentProfile[];
  selected: Set<string>;
  onSelect?: (id: string) => void;
  onOpen: (p: TalentProfile) => void;
}) {
  return (
    <div
      data-tulala-roster-grid
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
        gap: 12,
      }}
    >
      <style>{`
        @media (max-width: 600px) {
          [data-tulala-roster-grid] { grid-template-columns: repeat(2, 1fr) !important; gap: 10px !important; }
        }
        @media (min-width: 1500px) {
          /* Cap card density on wide screens — 7+ cards per row gets claustrophobic. */
          [data-tulala-roster-grid] {
            grid-template-columns: repeat(6, minmax(0, 1fr)) !important;
            max-width: 1340px;
          }
        }
      `}</style>
      {items.map((p) => (
        <RosterCard
          key={p.id}
          profile={p}
          selected={selected.has(p.id)}
          onSelect={onSelect}
          onOpen={onOpen}
        />
      ))}
    </div>
  );
}

// ── Roster card (premium 2026 design) ───────────────────────────────
function RosterCard({
  profile,
  selected,
  onSelect,
  onOpen,
}: {
  profile: TalentProfile;
  selected: boolean;
  onSelect?: (id: string) => void;
  onOpen: (p: TalentProfile) => void;
}) {
  const [hover, setHover] = useState(false);

  // Resolve primary type → label + parent emoji + first specialty.
  // The triplet is what makes the card scan-able: emoji = visual anchor,
  // label = "what they do", specialty = "what flavor of that".
  const typeMeta = (() => {
    if (!profile.primaryType) return null;
    for (const parent of TAXONOMY) {
      const c = parent.children.find((x) => x.id === profile.primaryType);
      if (c) return {
        label: c.label,
        emoji: parent.emoji,
        specialty: c.specialties?.[0] ?? null,
      };
    }
    return null;
  })();
  const typeLabel = typeMeta?.label ?? null;

  // State dot tone
  const stateTone = ({
    published: COLORS.green,
    draft: COLORS.inkMuted,
    invited: COLORS.indigoDeep,
    "awaiting-approval": COLORS.amber,
    claimed: COLORS.ink,
  } as const)[profile.state];

  // Availability dot
  const availDot = profile.availability === "available"
    ? COLORS.green
    : profile.availability === "busy"
      ? COLORS.amber
      : "rgba(11,11,13,0.18)";

  return (
    <div
      onClick={() => onOpen(profile)}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen(profile);
        }
      }}
      style={{
        position: "relative",
        background: "#fff",
        border: `1px solid ${selected ? COLORS.accent : COLORS.borderSoft}`,
        borderRadius: 14,
        padding: 0,
        cursor: "pointer",
        textAlign: "left",
        fontFamily: FONTS.body,
        overflow: "hidden",
        transition: "border-color 0.15s, box-shadow 0.15s, transform 0.15s",
        boxShadow: hover ? "0 6px 20px -10px rgba(11,11,13,0.18)" : "0 1px 2px rgba(11,11,13,0.03)",
      }}
    >
      {/* Photo */}
      <div
        style={{
          position: "relative",
          aspectRatio: "4 / 5",
          background: profile.thumb
            ? `url(${profile.thumb}) center/cover`
            : COLORS.surfaceAlt,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {/* Initials fallback when no photo. Hash-tinted for variation. */}
        {!profile.thumb && (
          <div
            aria-hidden
            style={{
              fontFamily: FONTS.display,
              fontSize: 36,
              fontWeight: 500,
              color: COLORS.inkMuted,
              letterSpacing: -1,
              userSelect: "none",
            }}
          >
            {profile.name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase()}
          </div>
        )}
        {/* Modern verified-icon overlay — IG / Tulala / Agency. */}
        <RosterPhotoBadgeOverlay talentId={profile.id} />
        {/* Selection checkbox — appears on hover or if selected */}
        {onSelect && (hover || selected) && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onSelect(profile.id);
            }}
            aria-label={selected ? "Deselect" : "Select"}
            style={{
              position: "absolute",
              top: 8,
              left: 8,
              width: 22,
              height: 22,
              borderRadius: 6,
              border: `1.5px solid ${selected ? COLORS.accent : "rgba(255,255,255,0.9)"}`,
              background: selected ? COLORS.accent : "rgba(11,11,13,0.4)",
              cursor: "pointer",
              padding: 0,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              backdropFilter: "blur(6px)",
            }}
          >
            {selected && (
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            )}
          </button>
        )}

        {/* Availability + state dots, top-right */}
        <div
          style={{
            position: "absolute",
            top: 8,
            right: 8,
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
            padding: "3px 8px",
            borderRadius: 999,
            background: "rgba(255,255,255,0.92)",
            backdropFilter: "blur(6px)",
            boxShadow: "0 1px 4px rgba(11,11,13,0.10)",
            fontSize: 10,
            fontWeight: 600,
            color: COLORS.ink,
          }}
        >
          <span style={{ width: 5, height: 5, borderRadius: "50%", background: stateTone }} />
          <span style={{ textTransform: "capitalize" }}>
            {profile.state === "awaiting-approval" ? "pending" : profile.state}
          </span>
        </div>

        {/* Completeness pill bottom-left for non-published profiles */}
        {profile.state !== "published" && profile.completeness !== undefined && (
          <div
            style={{
              position: "absolute",
              bottom: 8,
              left: 8,
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              padding: "3px 8px",
              borderRadius: 999,
              background: "rgba(11,11,13,0.55)",
              color: "#fff",
              fontSize: 10,
              fontWeight: 600,
              backdropFilter: "blur(6px)",
            }}
          >
            {profile.completeness}%
          </div>
        )}

        {/* Availability dot bottom-right (published only) */}
        {profile.state === "published" && profile.availability && (
          <div
            style={{
              position: "absolute",
              bottom: 8,
              right: 8,
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              padding: "3px 8px",
              borderRadius: 999,
              background: "rgba(255,255,255,0.92)",
              backdropFilter: "blur(6px)",
              boxShadow: "0 1px 4px rgba(11,11,13,0.10)",
              fontSize: 10,
              fontWeight: 600,
              color: COLORS.ink,
              textTransform: "capitalize",
            }}
          >
            <span style={{ width: 5, height: 5, borderRadius: "50%", background: availDot }} />
            {profile.availability}
          </div>
        )}
      </div>

      {/* Card body — name + type + city, hairlined */}
      <div style={{ padding: "10px 12px 12px" }}>
        <div
          style={{
            fontSize: 13.5,
            fontWeight: 600,
            color: COLORS.ink,
            letterSpacing: -0.1,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {profile.name}
        </div>
        <div
          style={{
            fontSize: 11.5,
            color: typeLabel ? COLORS.accentDeep : COLORS.inkMuted,
            fontWeight: typeLabel ? 600 : 500,
            marginTop: 2,
            display: "flex",
            alignItems: "center",
            gap: 4,
            whiteSpace: "nowrap",
            overflow: "hidden",
          }}
        >
          {typeMeta && (
            <span aria-hidden style={{ fontSize: 12, flexShrink: 0, opacity: 0.85 }}>
              {typeMeta.emoji}
            </span>
          )}
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", minWidth: 0 }}>
            {typeMeta?.label ?? "No type set"}
            {typeMeta?.specialty && (
              <span style={{ color: COLORS.inkMuted, fontWeight: 500 }}>
                {" · "}{typeMeta.specialty}
              </span>
            )}
          </span>
        </div>
        {profile.city && (
          <div
            style={{
              fontSize: 11,
              color: COLORS.inkMuted,
              marginTop: 1,
            }}
          >
            📍 {profile.city}
            {profile.lastActive && profile.lastActive !== "—" && ` · active ${profile.lastActive}`}
          </div>
        )}
        {/* Trust & claim indicators — visible on every Roster card. */}
        <div style={{ marginTop: 6, display: "flex", flexWrap: "wrap", gap: 4 }}>
          <RosterTrustCell talentId={profile.id} />
        </div>
      </div>
    </div>
  );
}

/** Resolves trust state for a talent and renders compact admin-surface badges. */
function RosterTrustCell({ talentId }: { talentId: string }) {
  const { getTrustSummary } = useProto();
  const trust = getTrustSummary("talent_profile", talentId);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
      <TrustBadgeGroup trust={trust} surface="admin_roster" size="sm" max={4} />
      {trust.claimStatus === "disputed" && (
        <span title="Talent disputed this profile claim — admin review needed."
          style={{
            display: "inline-flex", alignItems: "center", gap: 4,
            padding: "3px 8px", borderRadius: 999,
            background: "rgba(200,40,40,0.10)", color: "#C82828",
            fontSize: 10, fontWeight: 700, letterSpacing: 0.4, textTransform: "uppercase",
          }}>
          ⚠ Disputed
        </span>
      )}
      {trust.claimStatus === "invite_sent" && (
        <span title="Claim invite sent — talent has not yet accepted."
          style={{
            display: "inline-flex", alignItems: "center", gap: 4,
            padding: "3px 8px", borderRadius: 999,
            background: "rgba(82,96,109,0.10)", color: "#3A4651",
            fontSize: 10, fontWeight: 700, letterSpacing: 0.4, textTransform: "uppercase",
          }}>
          Invite sent
        </span>
      )}
    </div>
  );
}

/** Modern verified-icon overlay on the talent's photo corner. */
function RosterPhotoBadgeOverlay({ talentId }: { talentId: string }) {
  const { getTrustSummary } = useProto();
  const trust = getTrustSummary("talent_profile", talentId);
  return <ProfilePhotoBadgeOverlay trust={trust} size="md" max={2} position="bottom-right" />;
}

// ── Roster list view ────────────────────────────────────────────────
function RosterList({
  items,
  selected,
  onSelect,
  onOpen,
}: {
  items: TalentProfile[];
  selected: Set<string>;
  onSelect?: (id: string) => void;
  onOpen: (p: TalentProfile) => void;
}) {
  return (
    <div
      data-tulala-roster-list
      style={{
        background: "#fff",
        border: `1px solid ${COLORS.borderSoft}`,
        borderRadius: 12,
        overflow: "hidden",
        fontFamily: FONTS.body,
      }}
    >
      <style>{`
        @media (max-width: 720px) {
          [data-tulala-roster-list] [data-rl-header],
          [data-tulala-roster-list] [data-rl-completeness],
          [data-tulala-roster-list] [data-rl-lastactive] {
            display: none !important;
          }
        }
      `}</style>
      {/* Column header row */}
      <div
        data-rl-header
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "8px 14px",
          background: "rgba(11,11,13,0.02)",
          borderBottom: `1px solid ${COLORS.borderSoft}`,
          fontSize: 10,
          fontWeight: 600,
          letterSpacing: 1,
          textTransform: "uppercase",
          color: COLORS.inkMuted,
        }}
      >
        {onSelect && <span style={{ width: 18, flexShrink: 0 }} />}
        <span style={{ width: 36, flexShrink: 0 }} />
        <span style={{ flex: 1, minWidth: 0 }}>Name · type · city</span>
        <span data-rl-completeness style={{ width: 56, flexShrink: 0, textAlign: "right" }}>Profile</span>
        <span data-rl-lastactive style={{ width: 60, flexShrink: 0, textAlign: "right" }}>Active</span>
        <span style={{ width: 84, flexShrink: 0 }}>State</span>
      </div>
      {items.map((p, i) => (
        <RosterRow
          key={p.id}
          profile={p}
          isFirst={i === 0}
          selected={selected.has(p.id)}
          onSelect={onSelect}
          onOpen={onOpen}
        />
      ))}
    </div>
  );
}

function RosterRow({
  profile,
  isFirst,
  selected,
  onSelect,
  onOpen,
}: {
  profile: TalentProfile;
  isFirst: boolean;
  selected: boolean;
  onSelect?: (id: string) => void;
  onOpen: (p: TalentProfile) => void;
}) {
  const [hover, setHover] = useState(false);

  const typeMeta = (() => {
    if (!profile.primaryType) return null;
    for (const parent of TAXONOMY) {
      const c = parent.children.find((x) => x.id === profile.primaryType);
      if (c) return { label: c.label, emoji: parent.emoji, specialty: c.specialties?.[0] ?? null };
    }
    return null;
  })();
  const typeLabel = typeMeta?.label ?? null;

  const stateTone = ({
    published: COLORS.green,
    draft: COLORS.inkMuted,
    invited: COLORS.indigoDeep,
    "awaiting-approval": COLORS.amber,
    claimed: COLORS.ink,
  } as const)[profile.state];

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onOpen(profile)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen(profile);
        }
      }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "10px 14px",
        borderTop: isFirst ? "none" : `1px solid ${COLORS.borderSoft}`,
        cursor: "pointer",
        background: hover ? "rgba(11,11,13,0.02)" : selected ? "rgba(15,79,62,0.04)" : "transparent",
        transition: "background 0.12s",
      }}
    >
      {/* Selection checkbox */}
      {onSelect && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onSelect(profile.id);
          }}
          aria-label={selected ? "Deselect" : "Select"}
          style={{
            width: 18,
            height: 18,
            borderRadius: 4,
            border: `1.5px solid ${selected ? COLORS.accent : COLORS.borderSoft}`,
            background: selected ? COLORS.accent : "transparent",
            cursor: "pointer",
            padding: 0,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
            opacity: hover || selected ? 1 : 0.5,
            transition: "opacity 0.12s",
          }}
        >
          {selected && (
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          )}
        </button>
      )}

      {/* Avatar */}
      <span
        style={{
          width: 36,
          height: 36,
          borderRadius: "50%",
          background: profile.thumb
            ? `url(${profile.thumb}) center/cover`
            : COLORS.surfaceAlt,
          flexShrink: 0,
        }}
      />

      {/* Name + type */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 13.5,
            fontWeight: 600,
            color: COLORS.ink,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {profile.name}
        </div>
        <div
          style={{
            fontSize: 11.5,
            color: COLORS.inkMuted,
            marginTop: 1,
            display: "flex",
            alignItems: "center",
            gap: 4,
            whiteSpace: "nowrap",
            overflow: "hidden",
          }}
        >
          {typeMeta && (
            <span aria-hidden style={{ fontSize: 12, flexShrink: 0, opacity: 0.85 }}>
              {typeMeta.emoji}
            </span>
          )}
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", minWidth: 0 }}>
            {typeMeta?.label ?? "No type"}
            {typeMeta?.specialty && <span style={{ color: COLORS.inkDim }}>{" · "}{typeMeta.specialty}</span>}
            {profile.city && <span style={{ color: COLORS.inkDim }}>{" · "}{profile.city}</span>}
          </span>
        </div>
      </div>

      {/* Completeness (non-published) */}
      {profile.state !== "published" && profile.completeness !== undefined && (
        <div style={{ width: 56, flexShrink: 0 }}>
          <div style={{ fontSize: 10, color: COLORS.inkMuted, fontWeight: 600, marginBottom: 2, textAlign: "right" }}>
            {profile.completeness}%
          </div>
          <div style={{ height: 3, background: "rgba(11,11,13,0.06)", borderRadius: 999, overflow: "hidden" }}>
            <div
              style={{
                width: `${profile.completeness}%`,
                height: "100%",
                background: COLORS.indigoDeep,
              }}
            />
          </div>
        </div>
      )}

      {/* Last active */}
      {profile.lastActive && (
        <div
          style={{
            fontSize: 11,
            color: COLORS.inkMuted,
            width: 60,
            textAlign: "right",
            flexShrink: 0,
          }}
        >
          {profile.lastActive}
        </div>
      )}

      {/* State pill */}
      <div
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 5,
          padding: "3px 9px",
          borderRadius: 999,
          background: profile.state === "published" ? COLORS.successSoft :
                       profile.state === "awaiting-approval" ? COLORS.amberSoft :
                       profile.state === "invited" ? COLORS.indigoSoft :
                       "rgba(11,11,13,0.05)",
          color: profile.state === "published" ? COLORS.successDeep :
                 profile.state === "awaiting-approval" ? COLORS.amberDeep :
                 profile.state === "invited" ? COLORS.indigoDeep :
                 COLORS.inkMuted,
          fontSize: 10.5,
          fontWeight: 600,
          flexShrink: 0,
          textTransform: "capitalize",
        }}
      >
        <span style={{ width: 5, height: 5, borderRadius: "50%", background: stateTone }} />
        {profile.state === "awaiting-approval" ? "pending" : profile.state}
      </div>
    </div>
  );
}

// ── Roster empty state ──────────────────────────────────────────────
function RosterEmptyState({
  searching,
  query,
  onClear,
  onAdd,
}: {
  searching: boolean;
  query?: string;
  onClear: () => void;
  onAdd?: () => void;
}) {
  return (
    <div
      style={{
        background: "#fff",
        border: `1px dashed ${COLORS.borderSoft}`,
        borderRadius: 14,
        padding: "44px 24px",
        textAlign: "center",
        fontFamily: FONTS.body,
      }}
    >
      <div style={{ fontSize: 32, marginBottom: 10 }}>{searching ? "🔍" : "✨"}</div>
      <div
        style={{
          fontFamily: FONTS.display,
          fontSize: 17,
          fontWeight: 500,
          color: COLORS.ink,
          letterSpacing: -0.2,
          marginBottom: 4,
        }}
      >
        {searching ? `No matches for "${query}"` : "Your roster is empty"}
      </div>
      <div style={{ fontSize: 12.5, color: COLORS.inkMuted, marginBottom: 16, lineHeight: 1.5 }}>
        {searching
          ? "Try a different name, type, or city — or clear the filters to see everyone."
          : "Three fast ways to start. Templates pre-fill the common types so your first 3 are 30 seconds each."}
      </div>
      <div style={{ display: "inline-flex", gap: 8, flexWrap: "wrap", justifyContent: "center" }}>
        {searching && (
          <button
            type="button"
            onClick={onClear}
            style={{
              padding: "8px 16px",
              borderRadius: 999,
              border: `1px solid ${COLORS.border}`,
              background: "transparent",
              color: COLORS.ink,
              fontFamily: FONTS.body,
              fontSize: 12.5,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Clear filters
          </button>
        )}
        {onAdd && !searching && (
          <>
            <button
              type="button"
              onClick={onAdd}
              style={{
                padding: "8px 16px",
                borderRadius: 999,
                border: "none",
                background: COLORS.fill,
                color: "#fff",
                fontFamily: FONTS.body,
                fontSize: 12.5,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              + Add your first talent
            </button>
            <button
              type="button"
              onClick={onAdd}
              style={{
                padding: "8px 16px",
                borderRadius: 999,
                border: `1px solid ${COLORS.borderSoft}`,
                background: "#fff",
                color: COLORS.ink,
                fontFamily: FONTS.body,
                fontSize: 12.5,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              📋 Use a template
            </button>
            <button
              type="button"
              onClick={onAdd}
              style={{
                padding: "8px 16px",
                borderRadius: 999,
                border: `1px dashed ${COLORS.border}`,
                background: "transparent",
                color: COLORS.inkMuted,
                fontFamily: FONTS.body,
                fontSize: 12.5,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              📎 Bulk via CSV
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// ── Bulk action bar (sticky bottom) ─────────────────────────────────
function RosterBulkActionBar({
  count,
  onClear,
  onPublish,
  onArchive,
  onMessage,
}: {
  count: number;
  onClear: () => void;
  onPublish: () => void;
  onArchive: () => void;
  onMessage: () => void;
}) {
  return (
    <div
      style={{
        position: "sticky",
        bottom: 16,
        left: 0,
        right: 0,
        marginTop: 16,
        zIndex: 30,
        display: "flex",
        justifyContent: "center",
        pointerEvents: "none",
      }}
    >
      <div
        style={{
          pointerEvents: "auto",
          display: "inline-flex",
          alignItems: "center",
          gap: 10,
          padding: "8px 8px 8px 16px",
          background: COLORS.ink,
          color: "#fff",
          borderRadius: 999,
          boxShadow: "0 12px 40px -8px rgba(11,11,13,0.35)",
          fontFamily: FONTS.body,
          fontSize: 12.5,
          fontWeight: 600,
        }}
      >
        <span>{count} selected</span>
        <span style={{ width: 1, height: 16, background: "rgba(255,255,255,0.18)" }} />
        <button type="button" onClick={onMessage} style={bulkBtnStyle}>
          Message
        </button>
        <button type="button" onClick={onPublish} style={bulkBtnStyle}>
          Publish
        </button>
        <button type="button" onClick={onArchive} style={bulkBtnStyle}>
          Archive
        </button>
        <button
          type="button"
          onClick={onClear}
          aria-label="Clear selection"
          style={{
            width: 28,
            height: 28,
            borderRadius: "50%",
            border: "none",
            background: "rgba(255,255,255,0.10)",
            color: "#fff",
            cursor: "pointer",
            fontSize: 13,
            lineHeight: 1,
          }}
        >
          ×
        </button>
      </div>
    </div>
  );
}

const bulkBtnStyle: React.CSSProperties = {
  padding: "6px 12px",
  borderRadius: 999,
  border: "none",
  background: "rgba(255,255,255,0.10)",
  color: "#fff",
  cursor: "pointer",
  fontSize: 12,
  fontWeight: 600,
  fontFamily: "inherit",
};

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
    toast(`Exported ${filteredClients.length} rows to CSV`);
  };

  if (isFree) {
    return (
      <>
        <PageHeader
          title="Clients"
          subtitle="Inquiries from your channels. Filter by what needs you."
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
        title="Clients"
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

      {/* Status strip — replaces 4-up StatusCard wall */}
      <StatusStrip
        ariaLabel="Clients overview"
        items={[
          { id: "active",  label: "Active",   value: clients.filter((c) => c.status === "active").length,  tone: "green",  active: statusFilter === "active",  onClick: () => setStatusFilter(statusFilter === "active" ? "all" : "active") },
          { id: "dormant", label: "Dormant",  value: clients.filter((c) => c.status === "dormant").length, tone: "dim",    active: statusFilter === "dormant", onClick: () => setStatusFilter(statusFilter === "dormant" ? "all" : "dormant") },
          { id: "trust",   label: "Verified+", value: clients.filter((c) => c.trust && c.trust !== "basic").length, tone: "indigo" },
          { id: "ytd",     label: "Bookings YTD", value: clients.reduce((sum, c) => sum + c.bookingsYTD, 0), tone: "ink" },
        ]}
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
              transition: `background ${TRANSITION.micro}`,
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

      {/* FAB — full quick-create menu (mobile only) */}
      {canEdit && <FabWithQuickCreate />}

      {/* Confirm modal — archive client (#8) */}
      <ConfirmModal
        open={confirmArchive !== null}
        title="Archive client"
        message={`Archive ${confirmArchive?.name ?? "this client"}? Their booking history is preserved — you can unarchive any time.`}
        confirmLabel="Archive"
        onConfirm={() => {
          toast(`Archived ${confirmArchive?.name ?? "client"}`);
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
// OPERATIONS — Analytics + Workflow automation
// ════════════════════════════════════════════════════════════════════

// Tight section header for tool pages (Operations, Production) — colored
// dot + tight title row + description below. No huge accent bar / page
// breaks; everything is dense for fast scanning.
function PageSection({ tone, title, desc, children }: { tone: string; label?: string; title: string; desc: string; children: ReactNode }) {
  return (
    <section style={{ marginTop: 18 }}>
      <header style={{ marginBottom: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ width: 8, height: 8, borderRadius: "50%", background: tone, flexShrink: 0 }} />
          <h2 style={{ fontFamily: FONTS.display, fontSize: 15, fontWeight: 700, color: COLORS.ink, margin: 0, letterSpacing: -0.1 }}>{title}</h2>
          <span style={{ fontFamily: FONTS.body, fontSize: 12, color: COLORS.inkMuted, marginLeft: 4 }}>{desc}</span>
        </div>
      </header>
      {children}
    </section>
  );
}

// Settings-style row used by Operations / Production pages. Same card
// shape as the SettingsAccordionItem header — but instead of toggling
// open, the click fires the provided onClick (opens a drawer).
function ToolRow({ tone, icon, title, desc, onClick }: { tone: string; icon: ReactNode; title: string; desc: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        width: "100%",
        padding: "12px 14px",
        background: "#fff",
        border: `1px solid ${COLORS.borderSoft}`,
        borderRadius: 10,
        cursor: "pointer",
        fontFamily: FONTS.body,
        textAlign: "left",
        marginBottom: 6,
        transition: `border-color ${TRANSITION.sm}, transform ${TRANSITION.micro}, box-shadow ${TRANSITION.sm}, background ${TRANSITION.micro}`,
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = COLORS.border;
        e.currentTarget.style.background = "rgba(11,11,13,0.015)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = COLORS.borderSoft;
        e.currentTarget.style.background = "#fff";
      }}
    >
      <div style={{
        width: 30, height: 30, borderRadius: 8, flexShrink: 0,
        background: `${tone}14`, color: tone,
        display: "inline-flex", alignItems: "center", justifyContent: "center",
      }}>
        {icon}
      </div>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontSize: 13.5, fontWeight: 600, color: COLORS.ink, lineHeight: 1.3, letterSpacing: -0.05 }}>{title}</div>
        <div style={{ fontSize: 12, color: COLORS.inkMuted, marginTop: 2, lineHeight: 1.4 }}>{desc}</div>
      </div>
      {/* Right chevron — indicates "opens" rather than "expands" */}
      <span aria-hidden style={{ flexShrink: 0, color: COLORS.inkDim }}>
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <path d="M5 3l4 4-4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </span>
    </button>
  );
}

// Reusable inline icons — kept here so each ToolTile can use a distinct
// glyph without piping through Icon name unions.
const TI = {
  chart:    <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M2 12V8M6 12V4M10 12v-6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/></svg>,
  funnel:   <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M2 3h10l-3.5 4.5V12L5.5 11V7.5L2 3z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/></svg>,
  star:     <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M7 1.5l1.5 3.4 3.7.4-2.8 2.5.8 3.6L7 9.7l-3.2 1.7.8-3.6L1.8 5.3l3.7-.4L7 1.5z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/></svg>,
  team:     <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><circle cx="5" cy="5" r="2" stroke="currentColor" strokeWidth="1.4"/><circle cx="10" cy="6" r="1.5" stroke="currentColor" strokeWidth="1.4"/><path d="M1.5 11.5c0-2 1.5-3.5 3.5-3.5s3.5 1.5 3.5 3.5M9 11.5c0-1.5 1-2.5 2.5-2.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>,
  list:     <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M3 3.5h8M3 7h8M3 10.5h8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>,
  clock:    <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="1.4"/><path d="M7 4v3.5l2 1.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>,
  bolt:     <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M7.5 1.5L3 8h3.5l-1 4.5L11 6H7.5l1-4.5z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/></svg>,
  reply:    <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M5 4L2 7l3 3M2 7h7c2 0 3 1 3 3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  airplane: <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M2 7l10-5-3 11-2-4-5-2z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/></svg>,
  rotate:   <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M11.5 4.5A5 5 0 102 8m9.5-3.5V2m0 2.5h-3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  mail:     <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><rect x="1.5" y="3" width="11" height="8" rx="1" stroke="currentColor" strokeWidth="1.4"/><path d="M1.5 4l5.5 4 5.5-4" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/></svg>,
  flow:     <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><circle cx="3" cy="3" r="1.5" stroke="currentColor" strokeWidth="1.4"/><circle cx="11" cy="11" r="1.5" stroke="currentColor" strokeWidth="1.4"/><path d="M4.5 3H10c.5 0 1 .4 1 1v6.5" stroke="currentColor" strokeWidth="1.4"/></svg>,
  send:     <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M2 7L12 2l-2.5 11-2-4.5L2 7z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/></svg>,
  gift:     <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><rect x="2" y="6" width="10" height="6.5" stroke="currentColor" strokeWidth="1.4"/><path d="M2 6h10M7 6v6.5M7 6c-1.5-2-4 0-1 1m1-1c1.5-2 4 0 1 1" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>,
  upload:   <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M7 9V2m0 0L4 5m3-3l3 3M2 11.5h10" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  swap:     <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M3 5l-2-2 2-2M1 3h7c1.5 0 3 1 3 3M11 9l2 2-2 2M13 11H6c-1.5 0-3-1-3-3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  sparkle:  <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M7 2v3M7 9v3M2 7h3M9 7h3M3.5 3.5l1.5 1.5M9 9l1.5 1.5M10.5 3.5L9 5M5 9l-1.5 1.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>,
  toggle:   <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><rect x="1.5" y="4" width="11" height="6" rx="3" stroke="currentColor" strokeWidth="1.4"/><circle cx="9.5" cy="7" r="1.6" fill="currentColor"/></svg>,
  search:   <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><circle cx="6" cy="6" r="4" stroke="currentColor" strokeWidth="1.4"/><path d="M9 9l3 3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>,
  callback: <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M11.5 9c0 2-2 3-4.5 3s-4.5-1-4.5-3M2.5 5c0-2 2-3 4.5-3s4.5 1 4.5 3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>,
  feed:     <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><circle cx="2.5" cy="11" r="1.2" stroke="currentColor" strokeWidth="1.3"/><path d="M2.5 6.5a4.5 4.5 0 014.5 4.5M2.5 2a9 9 0 019 9" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>,
  cal:      <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><rect x="1.5" y="3" width="11" height="9" rx="1" stroke="currentColor" strokeWidth="1.4"/><path d="M1.5 6h11M4.5 1.5v3M9.5 1.5v3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>,
  crew:     <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><circle cx="4" cy="4.5" r="1.6" stroke="currentColor" strokeWidth="1.4"/><circle cx="10" cy="4.5" r="1.6" stroke="currentColor" strokeWidth="1.4"/><circle cx="7" cy="9.5" r="1.6" stroke="currentColor" strokeWidth="1.4"/></svg>,
  film:     <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><rect x="1.5" y="3" width="11" height="8" rx="1" stroke="currentColor" strokeWidth="1.4"/><path d="M4.5 3v8M9.5 3v8M1.5 7h11" stroke="currentColor" strokeWidth="1.4"/></svg>,
  pin:      <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M7 12.5C7 12.5 11 8.5 11 5.5a4 4 0 00-8 0c0 3 4 7 4 7z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/><circle cx="7" cy="5.5" r="1.3" stroke="currentColor" strokeWidth="1.4"/></svg>,
  brief:    <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><rect x="2" y="4" width="10" height="8.5" rx="1" stroke="currentColor" strokeWidth="1.4"/><path d="M5 4V2.5h4V4M4 7h6M4 9.5h6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>,
  shield:   <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M7 1.5l4.5 1.5v4c0 3-2 5-4.5 6-2.5-1-4.5-3-4.5-6V3L7 1.5z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/></svg>,
  alert:    <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M7 1.5l5.5 10H1.5L7 1.5z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/><path d="M7 6v2.5M7 10v.01" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/></svg>,
  scale:    <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M7 1.5v11M3 5l-2 4h4l-2-4zM11 5l-2 4h4l-2-4zM2 12.5h10" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  guard:    <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><circle cx="5" cy="5" r="2" stroke="currentColor" strokeWidth="1.4"/><circle cx="9.5" cy="6" r="1.5" stroke="currentColor" strokeWidth="1.4"/><path d="M2 11.5c0-2 1-3 3-3s3 1 3 3M9.5 11.5c0-1.5 1-2 2-2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>,
  approve:  <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="1.4"/><path d="M4.5 7L6 8.5l3.5-3.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>,
};

function OperationsPage() {
  const { openDrawer } = useProto();

  return (
    <>
      <PageHeader
        title="Operations"
        subtitle="Analytics, queues, SLAs & automations."
      />

      <div style={{ maxWidth: 760 }}>
        <PageSection tone={COLORS.indigo} title="Analytics" desc="Revenue, conversion, and team performance.">
          <ToolRow tone={COLORS.indigo} icon={TI.chart}    title="Revenue"           desc="Monthly revenue, top clients, and trend."             onClick={() => openDrawer("workspace-revenue")} />
          <ToolRow tone={COLORS.indigo} icon={TI.funnel}   title="Conversion funnel" desc="Inquiry → offer → booking conversion."                onClick={() => openDrawer("conversion-funnel")} />
          <ToolRow tone={COLORS.indigo} icon={TI.star}     title="Top performers"    desc="Most-booked talent and best clients."                 onClick={() => openDrawer("top-performers")} />
          <ToolRow tone={COLORS.indigo} icon={TI.team}     title="Team workload"     desc="Per-coordinator queue depth and SLA risk."            onClick={() => openDrawer("coordinator-workload")} />
        </PageSection>

        <PageSection tone={COLORS.accent} title="Workflow" desc="Coordinator queue, response timers, and automation rules.">
          <ToolRow tone={COLORS.accent} icon={TI.list}     title="My queue"          desc="Items assigned to you, sorted by priority."           onClick={() => openDrawer("my-queue")} />
          <ToolRow tone={COLORS.accent} icon={TI.clock}    title="SLA timers"        desc="Response-time clocks and escalation paths."           onClick={() => openDrawer("sla-timers")} />
          <ToolRow tone={COLORS.accent} icon={TI.bolt}     title="Automation rules"  desc="Trigger actions on status, deadlines, or fields."     onClick={() => openDrawer("rules-builder")} />
          <ToolRow tone={COLORS.accent} icon={TI.reply}    title="Saved replies"     desc="Canned response library for inbox threads."           onClick={() => openDrawer("saved-replies")} />
          <ToolRow tone={COLORS.accent} icon={TI.airplane} title="Vacation handover" desc="Delegate your queue while you're away."               onClick={() => openDrawer("vacation-handover")} />
          <ToolRow tone={COLORS.accent} icon={TI.rotate}   title="On-call rotation"  desc="Weekly schedule and escalation ladder."               onClick={() => openDrawer("on-call-rotation")} />
        </PageSection>

        <PageSection tone={COLORS.amber} title="Comms & growth" desc="Outbound email, sequences, and the referral programme.">
          <ToolRow tone={COLORS.amber}  icon={TI.mail}     title="Email templates"   desc="Outbound templates with merge fields."                onClick={() => openDrawer("email-templates")} />
          <ToolRow tone={COLORS.amber}  icon={TI.flow}     title="Email sequences"   desc="Multi-step automated follow-ups."                     onClick={() => openDrawer("email-sequences")} />
          <ToolRow tone={COLORS.amber}  icon={TI.send}     title="Invite flow"       desc="Send pre-filled talent invite links."                 onClick={() => openDrawer("invite-flow")} />
          <ToolRow tone={COLORS.amber}  icon={TI.gift}     title="Referrals"         desc="Track referrals, conversions, and credits."           onClick={() => openDrawer("referral-dashboard")} />
        </PageSection>

        <PageSection tone={COLORS.royal} title="Admin tools" desc="Bulk operations, AI workspace, telemetry, and feature controls.">
          <ToolRow tone={COLORS.royal}  icon={TI.upload}   title="CSV import"          desc="Bulk import talent, clients, or bookings."          onClick={() => openDrawer("csv-import", { type: "talent" })} />
          <ToolRow tone={COLORS.royal}  icon={TI.swap}     title="Migration assistant" desc="Move data from your current platform."              onClick={() => openDrawer("migration-assistant")} />
          <ToolRow tone={COLORS.royal}  icon={TI.sparkle}  title="AI workspace"        desc="Providers, usage controls, and console."            onClick={() => openDrawer("ai-workspace")} />
          <ToolRow tone={COLORS.royal}  icon={TI.toggle}   title="Feature controls"    desc="Turn platform features on or off per workspace."    onClick={() => openDrawer("feature-controls")} />
        </PageSection>
      </div>
    </>
  );
}

// ════════════════════════════════════════════════════════════════════
// PRODUCTION — Casting · Crew · On-set · Rights · Safety
// ════════════════════════════════════════════════════════════════════

function ProductionPage() {
  const { openDrawer } = useProto();

  return (
    <>
      <PageHeader
        title="Production"
        subtitle="Casting, crew, shoot day, rights & safety."
      />

      <PageSection tone={COLORS.coral} label="01" title="Casting" desc="Open or closed casting flows and round-by-round callbacks.">
        <Grid cols="4">
          <SecondaryCard title="Casting flow" description="Configure open/closed casting and rounds." affordance="Open" onClick={() => openDrawer("casting-flow")} />
          <SecondaryCard title="Callback tracker" description="Per-round talent status with feedback." affordance="Open" onClick={() => openDrawer("callback-tracker")} />
          <SecondaryCard title="Discovery feed" description="Trending talent and editorial picks." affordance="Open" onClick={() => openDrawer("discovery-feed")} />
          <SecondaryCard title="Availability search" description="Find talent for a date range and location." affordance="Open" onClick={() => openDrawer("avail-search")} />
        </Grid>
      </PageSection>

      <PageSection tone={COLORS.accent} label="02" title="Crew & shoot day" desc="Multi-discipline bookings, call sheets, and live on-set check-in.">
        <Grid cols="4">
          <SecondaryCard title="Crew booking" description="Book talent, photographer, HMU, studio." affordance="Open" onClick={() => openDrawer("crew-booking")} />
          <SecondaryCard title="Production timeline" description="Call-sheet order of events." affordance="Open" onClick={() => openDrawer("production-timeline")} />
          <SecondaryCard title="Call sheet" description="Live production roster with status." affordance="Open" onClick={() => openDrawer("call-sheet")} />
          <SecondaryCard title="On-set check-in" description="Mark talent and crew as arrived." affordance="Open" onClick={() => openDrawer("onset-checkin")} />
        </Grid>
        <div style={{ marginTop: 8 }}>
          <Grid cols="3">
            <SecondaryCard title="Locations" description="Studios, venues, and outdoor locations." affordance="Open" onClick={() => openDrawer("locations-drawer")} />
            <SecondaryCard title="Brief builder" description="Author shot lists and creative briefs." affordance="Open" onClick={() => openDrawer("brief-builder")} />
            <SecondaryCard title="Brand assets" description="Logos, fonts, and reusable assets." affordance="Open" onClick={() => openDrawer("brand-assets")} />
          </Grid>
        </div>
      </PageSection>

      <PageSection tone={COLORS.amber} label="03" title="Rights & safety" desc="Image-rights tracking, incident reporting, and dispute resolution.">
        <Grid cols="4">
          <SecondaryCard title="Usage tracker" description="Monitor licence expiry per booking." affordance="Open" onClick={() => openDrawer("usage-tracker")} />
          <SecondaryCard title="Relicence" description="Extend or expand usage rights." affordance="Open" onClick={() => openDrawer("relicense-flow")} />
          <SecondaryCard title="Incident reports" description="On-set safety and conduct reports." affordance="Open" onClick={() => openDrawer("incident-report")} />
          <SecondaryCard title="Disputes" description="Filed → Mediation → Decision." affordance="Open" onClick={() => openDrawer("dispute-resolution")} />
        </Grid>
      </PageSection>

      <PageSection tone={COLORS.indigo} label="04" title="Account lifecycle" desc="Workspace ownership and minor-account guardian setup.">
        <Grid cols="3">
          <SecondaryCard title="Ownership transfer" description="Transfer workspace to a new owner." affordance="Open" onClick={() => openDrawer("ownership-transfer")} />
          <SecondaryCard title="Minor account" description="Attach guardian co-pilot for under-18 talent." affordance="Open" onClick={() => openDrawer("minor-account")} />
          <SecondaryCard title="Approval flow" description="Multi-stage sign-off for sensitive items." affordance="Open" onClick={() => openDrawer("approval-flow")} />
        </Grid>
      </PageSection>
    </>
  );
}

// ════════════════════════════════════════════════════════════════════
// WEBSITE
// 2026 premium site-management surface. Twelve sections (hero / performance
// / pages / posts / redirects / nav / custom code / tracking / SEO /
// domain / maintenance / announcement). Performance is the headline:
// 4 KPI tiles + funnel strip + Top performers Pages↔Talent switcher.
// See dev-handoff §27 for production wiring map per section.
// ════════════════════════════════════════════════════════════════════

function WebsitePage() {
  const { state, openDrawer, toast } = useProto();
  const canEdit = meetsRole(state.role, "admin");
  const w = WEBSITE_STATE;
  const liveUrl = `https://${w.domain.primaryDomain}`;
  const totals = {
    publishedPages: w.pages.filter(p => p.status === "published").length,
    draftPages: w.pages.filter(p => p.status === "draft").length,
    scheduledPages: w.pages.filter(p => p.status === "scheduled").length,
    publishedPosts: w.posts.filter(p => p.status === "published").length,
    activeRedirects: w.redirects.filter(r => r.active).length,
  };
  const fmtMoney = (n: number) => `€${n.toLocaleString()}`;

  return (
    <>
      <PageHeader
        title="Website"
        subtitle={`${w.domain.primaryDomain} · pages, posts, redirects, code, tracking, SEO`}
        actions={
          <>
            {!canEdit && <span style={{ fontSize: 11, color: COLORS.inkMuted, fontWeight: 600, letterSpacing: 0.4, textTransform: "uppercase" }}>Read-only</span>}
            <SecondaryButton size="sm" onClick={() => toast(`Open ${liveUrl} in new tab`)}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                <Icon name="external" size={12} stroke={1.7} /> View live
              </span>
            </SecondaryButton>
            <PrimaryButton size="sm" onClick={() => toast("Opening page builder…")}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                <Icon name="pencil" size={12} stroke={1.7} /> Open page builder
              </span>
            </PrimaryButton>
          </>
        }
      />

      {/* Hero — gradient banner with URL + status + key totals */}
      <section style={{
        marginBottom: 18,
        background: `linear-gradient(135deg, ${COLORS.fill} 0%, ${COLORS.fillDeep} 100%)`,
        borderRadius: 14,
        padding: 20,
        color: "#fff",
        fontFamily: FONTS.body,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
          <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.7, textTransform: "uppercase", opacity: 0.7 }}>Live URL</span>
          <span style={{ fontFamily: "ui-monospace, monospace", fontSize: 14, fontWeight: 600 }}>{liveUrl}</span>
          <button type="button" onClick={() => { try { navigator.clipboard.writeText(liveUrl); } catch {} toast("Copied"); }}
            style={{ fontSize: 11, padding: "3px 9px", borderRadius: 999, border: "1px solid rgba(255,255,255,0.30)", background: "transparent", color: "#fff", fontFamily: FONTS.body, cursor: "pointer" }}
          >Copy</button>
          <span style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 600 }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: w.maintenance.enabled ? COLORS.amber : "#5BD893" }} />
            {w.maintenance.enabled ? "In maintenance" : "Live"}
          </span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 14 }}>
          <HeroStat label="Pages live"      value={totals.publishedPages.toString()} sub={`${totals.draftPages} draft`} />
          <HeroStat label="Posts"            value={totals.publishedPosts.toString()} sub={`${w.posts.length - totals.publishedPosts} unpublished`} />
          <HeroStat label="301 redirects"    value={totals.activeRedirects.toString()} sub={`${w.redirects.length - totals.activeRedirects} paused`} />
          <HeroStat label="Scheduled"        value={totals.scheduledPages.toString()} sub={totals.scheduledPages > 0 ? "next: SS27" : "none"} />
        </div>
      </section>

      {/* Performance — KPI tiles + funnel + Top performers switcher */}
      <WebsitePerformance analytics={w.analytics} pages={w.pages} fmtMoney={fmtMoney} />

      {/* Site banners — only render if any are active (Maintenance + Announcement collapsed) */}
      {(w.maintenance.enabled || w.announcement.enabled) && (
        <section style={{ marginBottom: 18, display: "flex", flexDirection: "column", gap: 8 }}>
          {w.maintenance.enabled && (
            <div style={{ padding: "12px 16px", borderRadius: 12, background: COLORS.amberSoft, border: `1px solid ${COLORS.amberDeep}33`, display: "flex", alignItems: "center", gap: 12, fontFamily: FONTS.body }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: COLORS.amberDeep, flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.6, textTransform: "uppercase", color: COLORS.amberDeep }}>Maintenance mode active</div>
                <div style={{ fontSize: 13, color: COLORS.ink, marginTop: 2 }}>{w.maintenance.message}</div>
              </div>
              <button type="button" onClick={() => { try { navigator.clipboard.writeText(w.maintenance.bypassToken); } catch {} toast("Bypass token copied"); }}
                style={{ fontSize: 11, padding: "5px 10px", borderRadius: 7, border: `1px solid ${COLORS.amberDeep}55`, background: "#fff", color: COLORS.amberDeep, fontWeight: 600, cursor: "pointer", fontFamily: FONTS.body, flexShrink: 0 }}>Copy bypass</button>
            </div>
          )}
          {w.announcement.enabled && (
            <div style={{ padding: "10px 14px", borderRadius: 10, background: w.announcement.tone === "info" ? COLORS.indigoSoft : w.announcement.tone === "success" ? COLORS.successSoft : w.announcement.tone === "warning" ? COLORS.amberSoft : COLORS.surfaceAlt, color: w.announcement.tone === "info" ? COLORS.indigoDeep : w.announcement.tone === "success" ? COLORS.successDeep : w.announcement.tone === "warning" ? COLORS.amberDeep : COLORS.ink, fontFamily: FONTS.body, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, border: `1px solid ${COLORS.borderSoft}` }}>
              <span style={{ fontSize: 13, fontWeight: 500 }}>📣 {w.announcement.text}</span>
              <span style={{ fontSize: 11, opacity: 0.7, textTransform: "uppercase", fontWeight: 700, letterSpacing: 0.6 }}>{w.announcement.audience}</span>
            </div>
          )}
        </section>
      )}

      {/* Pages — visual card grid (the hero asset, not a table) */}
      <section style={{ marginBottom: 22 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
          <h2 style={{ margin: 0, fontFamily: FONTS.display, fontSize: 18, fontWeight: 600, color: COLORS.ink, letterSpacing: -0.2 }}>Pages</h2>
          <span style={{ fontSize: 11.5, color: COLORS.inkMuted, fontFamily: FONTS.body }}>
            {totals.publishedPages} live · {totals.draftPages} draft · {totals.scheduledPages} scheduled
          </span>
          {canEdit && (
            <button type="button" onClick={() => toast("Opening page builder for new page…")} style={{ marginLeft: "auto", padding: "6px 12px", borderRadius: 8, border: `1px solid ${COLORS.borderSoft}`, background: "#fff", color: COLORS.ink, fontSize: 12, fontWeight: 500, cursor: "pointer", fontFamily: FONTS.body }}>+ New page</button>
          )}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 12 }}>
          {(() => {
            const maxHits = Math.max(...w.pages.map(p => p.hits7d ?? 0), 1);
            return w.pages.map(p => (
              <PageVisualCard key={p.id} page={p} maxHits={maxHits} onClick={() => toast(`Opening "${p.title}" in page builder…`)} />
            ));
          })()}
        </div>
      </section>

      {/* Posts + Redirects — two-column composite (breaks the visual rhythm) */}
      <section style={{ marginBottom: 22, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))", gap: 14 }}>
        {/* Posts column */}
        <div style={{ background: "#fff", border: `1px solid ${COLORS.borderSoft}`, borderRadius: 14, padding: 16, fontFamily: FONTS.body }}>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 12 }}>
            <h3 style={{ margin: 0, fontFamily: FONTS.display, fontSize: 15, fontWeight: 600, color: COLORS.ink }}>
              Posts <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.5, textTransform: "uppercase", color: COLORS.inkMuted, marginLeft: 6 }}>{w.posts.length}</span>
            </h3>
            {canEdit && (
              <button type="button" onClick={() => toast("Opening blog editor…")} style={{ fontSize: 11.5, color: COLORS.indigoDeep, background: "transparent", border: "none", cursor: "pointer", fontWeight: 600, fontFamily: FONTS.body }}>+ New post</button>
            )}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {w.posts.map(p => (
              <button key={p.id} type="button" onClick={() => toast(`Opening "${p.title}"…`)}
                style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 10, alignItems: "center", padding: "10px 12px", borderRadius: 9, border: `1px solid ${COLORS.borderSoft}`, background: "#fff", textAlign: "left", cursor: "pointer", fontFamily: FONTS.body, transition: `background ${TRANSITION.micro}` }}
                onMouseEnter={(e) => { e.currentTarget.style.background = COLORS.surfaceAlt; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "#fff"; }}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
                    <PageStatusChip status={p.status} />
                    <span style={{ fontSize: 11, color: COLORS.inkDim }}>{p.author}</span>
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.title}</div>
                  <div style={{ fontSize: 11, color: COLORS.inkMuted, marginTop: 2 }}>{p.tags.join(" · ")}</div>
                </div>
                <div style={{ textAlign: "right", color: COLORS.inkMuted }}>
                  <div style={{ fontFamily: "ui-monospace, monospace", fontSize: 13, fontWeight: 600, color: COLORS.ink, fontVariantNumeric: "tabular-nums" }}>{(p.hits7d ?? 0).toLocaleString()}</div>
                  <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: 0.5, fontWeight: 600 }}>hits 7d</div>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Redirects column */}
        <div style={{ background: "#fff", border: `1px solid ${COLORS.borderSoft}`, borderRadius: 14, padding: 16, fontFamily: FONTS.body }}>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 12 }}>
            <h3 style={{ margin: 0, fontFamily: FONTS.display, fontSize: 15, fontWeight: 600, color: COLORS.ink }}>
              Redirects <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.5, textTransform: "uppercase", color: COLORS.inkMuted, marginLeft: 6 }}>{totals.activeRedirects}/{w.redirects.length}</span>
            </h3>
            {canEdit && (
              <button type="button" onClick={() => toast("Add redirect — coming soon")} style={{ fontSize: 11.5, color: COLORS.indigoDeep, background: "transparent", border: "none", cursor: "pointer", fontWeight: 600, fontFamily: FONTS.body }}>+ Add</button>
            )}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {w.redirects.map(r => (
              <div key={r.id} style={{ padding: "9px 12px", borderRadius: 9, border: `1px solid ${COLORS.borderSoft}`, background: r.active ? "#fff" : COLORS.surfaceAlt, opacity: r.active ? 1 : 0.7 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
                  <span style={{ fontSize: 10, fontWeight: 700, padding: "1px 6px", borderRadius: 999, background: COLORS.indigoSoft, color: COLORS.indigoDeep, fontFamily: "ui-monospace, monospace" }}>{r.statusCode}</span>
                  <span style={{ fontSize: 10, fontWeight: 600, color: COLORS.inkMuted, textTransform: "uppercase", letterSpacing: 0.5 }}>{r.match}</span>
                  <span style={{ marginLeft: "auto", fontFamily: "ui-monospace, monospace", fontSize: 11, color: COLORS.inkMuted, fontVariantNumeric: "tabular-nums" }}>{(r.hits7d ?? 0).toLocaleString()} hits</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 6, fontFamily: "ui-monospace, monospace", fontSize: 12 }}>
                  <span style={{ color: COLORS.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flexShrink: 1, minWidth: 0 }}>{r.from}</span>
                  <span style={{ color: COLORS.inkDim, flexShrink: 0 }}>→</span>
                  <span style={{ color: COLORS.indigoDeep, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flexShrink: 1, minWidth: 0 }}>{r.to}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Configuration — single 3-column card combining Domain / SEO / Tracking */}
      <section style={{ marginBottom: 18 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
          <h2 style={{ margin: 0, fontFamily: FONTS.display, fontSize: 18, fontWeight: 600, color: COLORS.ink, letterSpacing: -0.2 }}>Configuration</h2>
          <span style={{ fontSize: 11.5, color: COLORS.inkMuted, fontFamily: FONTS.body }}>Domain · SEO · Tracking</span>
        </div>
        <div style={{ background: "#fff", border: `1px solid ${COLORS.borderSoft}`, borderRadius: 14, overflow: "hidden", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))" }}>
          {/* Domain */}
          <div style={{ padding: 18, borderRight: `1px solid ${COLORS.borderSoft}`, fontFamily: FONTS.body, position: "relative" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
              <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: 0.7, textTransform: "uppercase", color: COLORS.inkMuted }}>Domain</span>
              {canEdit && <button type="button" onClick={() => openDrawer("domain")} style={{ fontSize: 11, color: COLORS.indigoDeep, background: "transparent", border: "none", cursor: "pointer", fontWeight: 600, fontFamily: FONTS.body }}>Manage →</button>}
            </div>
            <div style={{ fontFamily: FONTS.display, fontSize: 18, fontWeight: 600, color: COLORS.ink, letterSpacing: -0.3, wordBreak: "break-all", marginBottom: 12 }}>{w.domain.primaryDomain}</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
              <ConfigStatusRow label="DNS" status={w.domain.status === "verified" ? "ok" : "warn"} value={w.domain.status === "verified" ? "Verified" : "Pending"} />
              <ConfigStatusRow label="SSL" status={w.domain.sslStatus === "active" ? "ok" : "warn"} value={w.domain.sslStatus === "active" ? `Active · renews ${w.domain.sslExpiresOn ?? "—"}` : w.domain.sslStatus} />
              <ConfigStatusRow label="Records" status={(w.domain.dnsRecords ?? []).every(r => r.matched) ? "ok" : "warn"} value={`${(w.domain.dnsRecords ?? []).filter(r => r.matched).length}/${(w.domain.dnsRecords ?? []).length} matched`} />
            </div>
          </div>

          {/* SEO */}
          <div style={{ padding: 18, borderRight: `1px solid ${COLORS.borderSoft}`, fontFamily: FONTS.body }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
              <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: 0.7, textTransform: "uppercase", color: COLORS.inkMuted }}>SEO defaults</span>
              <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 999, background: w.seo.robotsMode === "indexable" ? COLORS.successSoft : COLORS.amberSoft, color: w.seo.robotsMode === "indexable" ? COLORS.successDeep : COLORS.amberDeep, textTransform: "uppercase", letterSpacing: 0.5 }}>{w.seo.robotsMode === "indexable" ? "Indexable" : "No-index"}</span>
            </div>
            <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.ink, marginBottom: 4, lineHeight: 1.3 }}>{w.seo.siteTitle}</div>
            <div style={{ fontSize: 11.5, color: COLORS.inkMuted, marginBottom: 12, lineHeight: 1.45 }}>{w.seo.description}</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 5, fontSize: 11.5 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}><span style={{ color: COLORS.inkMuted }}>Title template</span><span style={{ fontFamily: "ui-monospace, monospace", color: COLORS.ink, fontSize: 11, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "60%" }}>{w.seo.titleTemplate}</span></div>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}><span style={{ color: COLORS.inkMuted }}>Sitemap</span><span style={{ color: w.seo.sitemapEnabled ? COLORS.successDeep : COLORS.amberDeep, fontWeight: 600 }}>{w.seo.sitemapEnabled ? "Enabled" : "Disabled"}</span></div>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}><span style={{ color: COLORS.inkMuted }}>Canonical</span><span style={{ fontFamily: "ui-monospace, monospace", color: COLORS.ink, fontSize: 11 }}>{w.seo.canonicalDomain}</span></div>
            </div>
          </div>

          {/* Tracking — chip cluster */}
          <div style={{ padding: 18, fontFamily: FONTS.body }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
              <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: 0.7, textTransform: "uppercase", color: COLORS.inkMuted }}>Tracking</span>
              <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 999, background: COLORS.indigoSoft, color: COLORS.indigoDeep, textTransform: "uppercase", letterSpacing: 0.5 }}>Consent: {w.tracking.cookieConsent}</span>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {[
                { label: "GA4", value: w.tracking.ga4MeasurementId },
                { label: "Plausible", value: w.tracking.plausibleDomain },
                { label: "Meta", value: w.tracking.metaPixelId },
                { label: "GTM", value: w.tracking.gtmContainerId },
                { label: "Hotjar", value: w.tracking.hotjarSiteId },
                { label: "LinkedIn", value: w.tracking.linkedInPartnerId },
              ].map(t => {
                const active = t.value.length > 0;
                return (
                  <span key={t.label} title={active ? t.value : "Not configured"}
                    style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "5px 10px", borderRadius: 999, background: active ? COLORS.successSoft : COLORS.surfaceAlt, border: `1px solid ${active ? "rgba(46,125,91,0.30)" : COLORS.borderSoft}`, fontSize: 11.5, fontWeight: 600, color: active ? COLORS.successDeep : COLORS.inkDim }}>
                    <span style={{ width: 6, height: 6, borderRadius: "50%", background: active ? COLORS.successDeep : COLORS.inkDim }} />
                    {t.label}
                  </span>
                );
              })}
            </div>
          </div>
        </div>
      </section>
    </>
  );
}

function HeroStat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div>
      <div style={{ fontFamily: FONTS.display, fontSize: 26, fontWeight: 600, color: "#fff", letterSpacing: -0.5, lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>{value}</div>
      <div style={{ fontSize: 11, color: "rgba(255,255,255,0.6)", marginTop: 4, fontWeight: 500, letterSpacing: 0.2 }}>
        {label}
        {sub && <span style={{ marginLeft: 4, opacity: 0.7 }}>· {sub}</span>}
      </div>
    </div>
  );
}

// Visual page card — replaces flat table rows with browser-chrome mockup cards.
// Each card shows the page title prominently, a faux URL bar, status chip, and
// an inline bar showing relative hits-7d compared to top page in the set.
function PageVisualCard({ page, maxHits, onClick }: { page: WebsitePageRow; maxHits: number; onClick: () => void }) {
  const hits = page.hits7d ?? 0;
  const fillPct = maxHits > 0 ? (hits / maxHits) * 100 : 0;
  const isLive = page.status === "published";
  return (
    <button type="button" onClick={onClick}
      style={{
        textAlign: "left", cursor: "pointer", border: `1px solid ${COLORS.borderSoft}`, borderRadius: 12,
        background: "#fff", padding: 0, fontFamily: FONTS.body, overflow: "hidden",
        display: "flex", flexDirection: "column", transition: `transform ${TRANSITION.micro}, box-shadow ${TRANSITION.micro}, border-color ${TRANSITION.micro}`,
      }}
      onMouseEnter={(e) => { e.currentTarget.style.borderColor = COLORS.indigoDeep; e.currentTarget.style.boxShadow = "0 4px 14px rgba(11,11,13,0.06)"; e.currentTarget.style.transform = "translateY(-1px)"; }}
      onMouseLeave={(e) => { e.currentTarget.style.borderColor = COLORS.borderSoft; e.currentTarget.style.boxShadow = "none"; e.currentTarget.style.transform = "translateY(0)"; }}
    >
      {/* Faux browser chrome / preview band */}
      <div style={{ height: 70, background: `linear-gradient(135deg, ${COLORS.surfaceAlt} 0%, #fff 100%)`, borderBottom: `1px solid ${COLORS.borderSoft}`, padding: "10px 12px", display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ display: "flex", gap: 4 }}>
          <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#FF5F57" }} />
          <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#FEBC2E" }} />
          <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#28C840" }} />
        </div>
        <div style={{ background: "#fff", border: `1px solid ${COLORS.borderSoft}`, borderRadius: 6, padding: "4px 8px", fontFamily: "ui-monospace, monospace", fontSize: 10.5, color: COLORS.inkMuted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{page.slug}</div>
      </div>
      {/* Body */}
      <div style={{ padding: 14, display: "flex", flexDirection: "column", gap: 10, flex: 1 }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: COLORS.ink, letterSpacing: -0.1, lineHeight: 1.25, flex: 1, minWidth: 0 }}>{page.title}</div>
          <PageStatusChip status={page.status} />
        </div>
        {/* Inline bar — hits relative to top page */}
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4 }}>
            <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: 0.5, textTransform: "uppercase", color: COLORS.inkMuted }}>Hits 7d</span>
            <span style={{ fontFamily: "ui-monospace, monospace", fontSize: 12, fontWeight: 600, color: COLORS.ink, fontVariantNumeric: "tabular-nums" }}>{hits.toLocaleString()}</span>
          </div>
          <div style={{ height: 4, borderRadius: 999, background: COLORS.surfaceAlt, overflow: "hidden" }}>
            <div style={{ width: `${fillPct}%`, height: "100%", background: isLive ? COLORS.indigoDeep : COLORS.inkDim, borderRadius: 999, transition: "width 200ms ease" }} />
          </div>
        </div>
        <div style={{ marginTop: "auto", display: "flex", justifyContent: "space-between", fontSize: 11, color: COLORS.inkMuted }}>
          <span>by {page.lastEditedBy}</span>
          <span>{page.updatedAt}</span>
        </div>
      </div>
    </button>
  );
}

function ConfigStatusRow({ label, status, value }: { label: string; status: "ok" | "warn"; value: string }) {
  const dot = status === "ok" ? COLORS.successDeep : COLORS.amberDeep;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, fontFamily: FONTS.body }}>
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: dot, flexShrink: 0 }} />
      <span style={{ color: COLORS.inkMuted, fontWeight: 600, letterSpacing: 0.3, textTransform: "uppercase", fontSize: 10.5, minWidth: 60 }}>{label}</span>
      <span style={{ color: COLORS.ink, fontWeight: 500, marginLeft: "auto", textAlign: "right", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{value}</span>
    </div>
  );
}

function WebsitePerformance({ analytics, pages, fmtMoney }: { analytics: WebsiteAnalytics; pages: WebsitePageRow[]; fmtMoney: (n: number) => string }) {
  const [period, setPeriod] = useState<"7d" | "30d">("7d");
  const [topView, setTopView] = useState<"pages" | "talent">("pages");
  const m: WebsitePeriodMetrics = period === "7d" ? analytics.last7d : analytics.last30d;
  const byPage = period === "7d" ? analytics.byPage7d : analytics.byPage30d;
  const byTalent = period === "7d" ? analytics.byTalent7d : analytics.byTalent30d;
  const overallConv = m.visits > 0 ? (m.bookings / m.visits) * 100 : 0;
  const v2i = m.visits > 0 ? (m.inquiries / m.visits) * 100 : 0;
  const i2b = m.inquiries > 0 ? (m.bookings / m.inquiries) * 100 : 0;

  const topPages = byPage
    .filter(p => p.visits > 0)
    .sort((a, b) => b.visits - a.visits)
    .slice(0, 4)
    .map(p => ({ ...p, title: pages.find(pg => pg.id === p.pageId)?.title ?? "—" }));

  const topTalent = byTalent
    .filter(t => t.visits > 0)
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 4)
    .map(t => ({ ...t, topPageTitle: pages.find(pg => pg.id === t.topPageId)?.title ?? "—" }));

  const Tile = ({ label, value, current, prior, accent }: { label: string; value: string; current: number; prior: number; accent?: boolean }) => {
    const delta = prior > 0 ? ((current - prior) / prior) * 100 : 0;
    const dir = Math.abs(delta) < 0.5 ? "flat" : (delta > 0 ? "up" : "down");
    const color = dir === "up" ? COLORS.successDeep : dir === "down" ? COLORS.criticalDeep : COLORS.inkMuted;
    return (
      <div style={{ padding: 14, borderRadius: 10, background: accent ? COLORS.accentSoft : "#fff", border: `1px solid ${accent ? "rgba(15,79,62,0.24)" : COLORS.borderSoft}` }}>
        <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: 0.6, textTransform: "uppercase", color: COLORS.inkMuted }}>{label}</div>
        <div style={{ fontFamily: FONTS.display, fontSize: 24, fontWeight: 600, color: accent ? COLORS.accentDeep : COLORS.ink, marginTop: 4, fontVariantNumeric: "tabular-nums", letterSpacing: -0.3 }}>{value}</div>
        <div style={{ fontSize: 11, color, marginTop: 2 }}>
          {dir === "up" ? "↑" : dir === "down" ? "↓" : "→"} {Math.abs(delta).toFixed(1)}%
          <span style={{ color: COLORS.inkDim, marginLeft: 4 }}>vs {typeof prior === "number" && prior > 1000 && label === "Booking revenue" ? fmtMoney(prior) : prior.toLocaleString()}</span>
        </div>
      </div>
    );
  };

  return (
    <section style={{ marginBottom: 18 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 8, flexWrap: "wrap" }}>
        <h2 style={{ margin: 0, fontFamily: FONTS.display, fontSize: 18, fontWeight: 600, color: COLORS.ink, letterSpacing: -0.2 }}>Performance</h2>
        <span style={{ fontSize: 11.5, color: COLORS.inkMuted, fontFamily: FONTS.body }}>vs prior {period}</span>
        <div style={{ marginLeft: "auto", display: "inline-flex", background: COLORS.surfaceAlt, border: `1px solid ${COLORS.borderSoft}`, borderRadius: 999, padding: 3, fontFamily: FONTS.body }}>
          {(["7d", "30d"] as const).map(p => {
            const active = p === period;
            return (
              <button key={p} type="button" onClick={() => setPeriod(p)} style={{ padding: "5px 12px", fontSize: 11.5, fontWeight: 600, letterSpacing: 0.2, borderRadius: 999, border: "none", cursor: "pointer", background: active ? "#fff" : "transparent", color: active ? COLORS.ink : COLORS.inkMuted, boxShadow: active ? "0 1px 3px rgba(0,0,0,0.06)" : "none", transition: "all 120ms ease" }}>{p === "7d" ? "7 days" : "30 days"}</button>
            );
          })}
        </div>
      </div>

      <div style={{ background: "#fff", border: `1px solid ${COLORS.borderSoft}`, borderRadius: 14, padding: 18, display: "flex", flexDirection: "column", gap: 18 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 14 }}>
          <Tile label="Visits"           value={m.visits.toLocaleString()}   current={m.visits}    prior={m.prior.visits} />
          <Tile label="Inquiries"        value={m.inquiries.toLocaleString()} current={m.inquiries} prior={m.prior.inquiries} />
          <Tile label="Bookings"         value={m.bookings.toLocaleString()} current={m.bookings}  prior={m.prior.bookings} />
          <Tile label="Booking revenue"  value={fmtMoney(m.revenue)}          current={m.revenue}   prior={m.prior.revenue}  accent />
        </div>

        {/* Funnel strip */}
        <div style={{ background: COLORS.indigoSoft, border: "1px solid rgba(91,107,160,0.18)", borderRadius: 10, padding: "14px 16px", display: "grid", gridTemplateColumns: "1fr auto 1fr auto 1fr", alignItems: "center", gap: 12 }}>
          <FunnelStep label="Visits"     value={m.visits.toLocaleString()} />
          <FunnelArrow rate={v2i} caption="visit → inquiry" />
          <FunnelStep label="Inquiries"  value={m.inquiries.toLocaleString()} />
          <FunnelArrow rate={i2b} caption="inquiry → booking" />
          <FunnelStep label="Bookings"   value={m.bookings.toLocaleString()} />
          <div style={{ gridColumn: "1 / -1", paddingTop: 10, marginTop: 4, borderTop: "1px solid rgba(91,107,160,0.18)", display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 11.5, color: COLORS.indigoDeep, fontFamily: FONTS.body }}>
            <span style={{ fontWeight: 600, textTransform: "uppercase", fontSize: 10.5, letterSpacing: 0.6 }}>Overall conversion</span>
            <span style={{ fontFamily: "ui-monospace, monospace", fontWeight: 600, fontSize: 13 }}>{overallConv.toFixed(2)}%
              <span style={{ marginLeft: 6, opacity: 0.6, fontSize: 11 }}>({m.bookings} of {m.visits.toLocaleString()})</span>
            </span>
          </div>
        </div>

        {/* Top performers — Pages | Talent switcher */}
        <div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10, flexWrap: "wrap", gap: 8 }}>
            <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: 0.6, textTransform: "uppercase", color: COLORS.inkMuted, fontFamily: FONTS.body }}>Top performers</div>
            <div style={{ display: "inline-flex", background: COLORS.surfaceAlt, border: `1px solid ${COLORS.borderSoft}`, borderRadius: 999, padding: 3, fontFamily: FONTS.body }}>
              {(["pages", "talent"] as const).map(v => {
                const active = topView === v;
                return (
                  <button key={v} type="button" onClick={() => setTopView(v)} style={{ padding: "5px 14px", fontSize: 11.5, fontWeight: 600, letterSpacing: 0.2, borderRadius: 999, border: "none", cursor: "pointer", background: active ? "#fff" : "transparent", color: active ? COLORS.ink : COLORS.inkMuted, boxShadow: active ? "0 1px 3px rgba(0,0,0,0.06)" : "none", transition: "all 120ms ease" }}>{v === "pages" ? "Pages" : "Talent"}</button>
                );
              })}
            </div>
          </div>

          {topView === "pages" && topPages.length > 0 && (
            <div style={{ border: `1px solid ${COLORS.borderSoft}`, borderRadius: 10, overflow: "hidden" }}>
              <div style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr 1fr 1fr 1fr", padding: "8px 14px", background: COLORS.surfaceAlt, borderBottom: `1px solid ${COLORS.borderSoft}`, fontSize: 10.5, fontWeight: 600, letterSpacing: 0.5, textTransform: "uppercase", color: COLORS.inkMuted, fontFamily: FONTS.body }}>
                <div>Page</div>
                <div style={{ textAlign: "right" }}>Visits</div>
                <div style={{ textAlign: "right" }}>Inquiries</div>
                <div style={{ textAlign: "right" }}>Bookings</div>
                <div style={{ textAlign: "right" }}>Conv. rate</div>
              </div>
              {topPages.map((p, i) => {
                const conv = p.visits > 0 ? (p.bookings / p.visits) * 100 : 0;
                const tone = (overallConv > 0 && conv >= overallConv) ? COLORS.successDeep : conv > 0 ? COLORS.indigoDeep : COLORS.inkDim;
                return (
                  <div key={p.pageId} style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr 1fr 1fr 1fr", padding: "10px 14px", alignItems: "center", borderTop: i === 0 ? "none" : `1px solid ${COLORS.borderSoft}`, fontSize: 13, color: COLORS.ink, fontFamily: FONTS.body }}>
                    <span style={{ fontWeight: 600 }}>{p.title}</span>
                    <span style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{p.visits.toLocaleString()}</span>
                    <span style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{p.inquiries}</span>
                    <span style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{p.bookings}</span>
                    <span style={{ textAlign: "right", fontVariantNumeric: "tabular-nums", fontWeight: 600, color: tone }}>{conv.toFixed(2)}%</span>
                  </div>
                );
              })}
            </div>
          )}

          {topView === "talent" && topTalent.length > 0 && (
            <div style={{ border: `1px solid ${COLORS.borderSoft}`, borderRadius: 10, overflow: "hidden" }}>
              <div style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr 1fr 1fr 1fr 1.2fr", padding: "8px 14px", background: COLORS.surfaceAlt, borderBottom: `1px solid ${COLORS.borderSoft}`, fontSize: 10.5, fontWeight: 600, letterSpacing: 0.5, textTransform: "uppercase", color: COLORS.inkMuted, fontFamily: FONTS.body }}>
                <div>Talent</div>
                <div style={{ textAlign: "right" }}>Visits</div>
                <div style={{ textAlign: "right" }}>Inquiries</div>
                <div style={{ textAlign: "right" }}>Bookings</div>
                <div style={{ textAlign: "right" }}>Revenue</div>
                <div style={{ textAlign: "right" }}>Top page</div>
              </div>
              {topTalent.map((t, i) => {
                const conv = t.visits > 0 ? (t.bookings / t.visits) * 100 : 0;
                const tone = (overallConv > 0 && conv >= overallConv) ? COLORS.successDeep : t.revenue > 0 ? COLORS.indigoDeep : COLORS.inkDim;
                return (
                  <div key={t.talentId} style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr 1fr 1fr 1fr 1.2fr", padding: "10px 14px", alignItems: "center", borderTop: i === 0 ? "none" : `1px solid ${COLORS.borderSoft}`, fontSize: 13, color: COLORS.ink, fontFamily: FONTS.body }}>
                    <span style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                      <span style={{ fontWeight: 600 }}>{t.talentName}</span>
                      <span style={{ fontSize: 11, color: COLORS.inkDim }}>{conv > 0 ? `${conv.toFixed(2)}% conv` : "no bookings"}</span>
                    </span>
                    <span style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{t.visits.toLocaleString()}</span>
                    <span style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{t.inquiries}</span>
                    <span style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{t.bookings}</span>
                    <span style={{ textAlign: "right", fontVariantNumeric: "tabular-nums", fontWeight: 600, color: tone }}>{fmtMoney(t.revenue)}</span>
                    <span style={{ textAlign: "right", fontSize: 12, color: COLORS.inkMuted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.topPageTitle}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function FunnelStep({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ textAlign: "center" }}>
      <div style={{ fontFamily: FONTS.display, fontSize: 22, fontWeight: 600, color: COLORS.indigoDeep, fontVariantNumeric: "tabular-nums", letterSpacing: -0.3 }}>{value}</div>
      <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: 0.6, textTransform: "uppercase", color: COLORS.indigoDeep, opacity: 0.7 }}>{label}</div>
    </div>
  );
}
function FunnelArrow({ rate, caption }: { rate: number; caption: string }) {
  return (
    <div style={{ textAlign: "center", color: COLORS.indigoDeep }}>
      <div style={{ fontFamily: "ui-monospace, monospace", fontSize: 13, fontWeight: 600 }}>{rate.toFixed(2)}%</div>
      <div style={{ fontSize: 10, color: COLORS.indigoDeep, opacity: 0.7 }}>{caption}</div>
    </div>
  );
}

function SiteSubSection({ title, count, sub, actionLabel, onAction, children }: { title: string; count?: number; sub?: string; actionLabel?: string; onAction?: () => void; children: ReactNode }) {
  return (
    <section style={{ marginBottom: 18 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 10, flexWrap: "wrap" }}>
        <h3 style={{ margin: 0, fontFamily: FONTS.display, fontSize: 16, fontWeight: 600, color: COLORS.ink, letterSpacing: -0.1 }}>{title}</h3>
        {typeof count === "number" && (
          <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.5, textTransform: "uppercase", color: COLORS.inkMuted }}>{count}</span>
        )}
        {sub && <span style={{ fontSize: 12, color: COLORS.inkMuted, fontFamily: FONTS.body }}>{sub}</span>}
        {actionLabel && (
          <button type="button" onClick={onAction} style={{ marginLeft: "auto", padding: "5px 11px", borderRadius: 7, border: `1px solid ${COLORS.borderSoft}`, background: "#fff", color: COLORS.ink, fontSize: 12, fontWeight: 500, cursor: "pointer", fontFamily: FONTS.body }}>{actionLabel}</button>
        )}
      </div>
      {children}
    </section>
  );
}

function SiteTable({ headers, children }: { headers: string[]; children: ReactNode }) {
  return (
    <div style={{ border: `1px solid ${COLORS.borderSoft}`, borderRadius: 10, overflow: "hidden", background: "#fff" }}>
      <div style={{ display: "grid", gridTemplateColumns: `2fr ${headers.slice(1).map(() => "1fr").join(" ")}`, padding: "8px 14px", background: COLORS.surfaceAlt, borderBottom: `1px solid ${COLORS.borderSoft}`, fontSize: 10.5, fontWeight: 600, letterSpacing: 0.5, textTransform: "uppercase", color: COLORS.inkMuted, fontFamily: FONTS.body }}>
        {headers.map(h => <div key={h}>{h}</div>)}
      </div>
      {children}
    </div>
  );
}

function SiteTableRow({ cells, onClick }: { cells: ReactNode[]; onClick?: () => void }) {
  const cols = `2fr ${cells.slice(1).map(() => "1fr").join(" ")}`;
  return (
    <div
      onClick={onClick}
      style={{
        display: "grid", gridTemplateColumns: cols,
        padding: "10px 14px", alignItems: "center",
        borderTop: `1px solid ${COLORS.borderSoft}`,
        fontSize: 13, color: COLORS.ink, fontFamily: FONTS.body,
        cursor: onClick ? "pointer" : "default",
        transition: `background ${TRANSITION.micro}`,
      }}
      onMouseEnter={(e) => { if (onClick) e.currentTarget.style.background = COLORS.surfaceAlt; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
    >
      {cells.map((c, i) => <div key={i}>{c}</div>)}
    </div>
  );
}

function PageStatusChip({ status }: { status: "published" | "draft" | "scheduled" }) {
  const map = {
    published: { label: "Live",      bg: COLORS.successSoft, fg: COLORS.successDeep },
    draft:     { label: "Draft",     bg: COLORS.surfaceAlt,  fg: COLORS.inkMuted },
    scheduled: { label: "Scheduled", bg: COLORS.indigoSoft,  fg: COLORS.indigoDeep },
  } as const;
  const m = map[status];
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "2px 8px", borderRadius: 999, background: m.bg, color: m.fg, fontSize: 11, fontWeight: 600, fontFamily: FONTS.body }}>{m.label}</span>
  );
}

function SiteInfoCard({ label, value, status, sub, mono }: { label: string; value: string; status?: "ok" | "warn"; sub?: string; mono?: boolean }) {
  const dot = status === "ok" ? COLORS.successDeep : status === "warn" ? COLORS.amberDeep : null;
  return (
    <div style={{ padding: 12, borderRadius: 10, background: "#fff", border: `1px solid ${COLORS.borderSoft}`, fontFamily: FONTS.body }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
        {dot && <span style={{ width: 6, height: 6, borderRadius: "50%", background: dot }} />}
        <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: 0.6, textTransform: "uppercase", color: COLORS.inkMuted }}>{label}</div>
      </div>
      <div style={{ fontSize: 13, fontWeight: 500, color: COLORS.ink, fontFamily: mono ? "ui-monospace, monospace" : FONTS.body, overflow: "hidden", textOverflow: "ellipsis" }}>{value || "—"}</div>
      {sub && <div style={{ fontSize: 11, color: COLORS.inkMuted, marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

function SiteTrackingCell({ label, value }: { label: string; value: string }) {
  const active = value.length > 0;
  return (
    <div style={{ padding: "10px 12px", borderRadius: 8, background: active ? COLORS.successSoft : "#fff", border: `1px solid ${active ? "rgba(46,125,91,0.30)" : COLORS.borderSoft}`, fontFamily: FONTS.body }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 2 }}>
        <span style={{ fontSize: 11, fontWeight: 600, color: COLORS.inkMuted, textTransform: "uppercase", letterSpacing: 0.5 }}>{label}</span>
        {active && <span style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: 0.5, textTransform: "uppercase", color: COLORS.successDeep }}>Active</span>}
      </div>
      <div style={{ fontSize: 12, color: active ? COLORS.successDeep : COLORS.inkDim, fontFamily: "ui-monospace, monospace", overflow: "hidden", textOverflow: "ellipsis" }}>{value || "Not configured"}</div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════
// SITE (legacy)
// ════════════════════════════════════════════════════════════════════

function SitePage() {
  const { state, setPage, openDrawer, openUpgrade } = useProto();
  const canEdit = meetsRole(state.role, "admin");

  return (
    <>
      <PageHeader
        title="Public site"
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

      {/* WS-27 Site management tools */}
      <div style={{ display: "flex", gap: 8, marginTop: 14, marginBottom: 4 }}>
        <SecondaryButton size="sm" onClick={() => openDrawer("site-context-switcher")}>Switch context</SecondaryButton>
        <SecondaryButton size="sm" onClick={() => openDrawer("page-scheduler")}>Schedule pages</SecondaryButton>
      </div>

      <div style={{ height: 10 }} />

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
    amber: { bg: "rgba(82,96,109,0.12)", fg: COLORS.amberDeep, dot: COLORS.amber },
    green: { bg: "rgba(46,125,91,0.12)", fg: COLORS.successDeep, dot: COLORS.green },
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
              background: isCurrent ? COLORS.fill : "transparent",
              color: isCurrent ? "#fff" : COLORS.ink,
              border: "none",
              cursor: isReached ? "default" : "pointer",
              textAlign: "left",
              fontFamily: FONTS.body,
              opacity: isReached && !isCurrent ? 0.6 : 1,
              transition: `background ${TRANSITION.sm}`,
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
        title="Billing"
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
            onClick={() => { document.querySelector("[data-billing-activity]")?.scrollIntoView({ behavior: scrollBehavior(), block: "start" }); }}
          />
          <SecondaryCard
            title="Pending payouts"
            description={payout.pendingPayouts}
            affordance="See activity"
            onClick={() => { document.querySelector("[data-billing-activity]")?.scrollIntoView({ behavior: scrollBehavior(), block: "start" }); }}
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
              transition: `background ${TRANSITION.micro}`,
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

// WS-3.5  Settings page redesign — anchor-link sub-nav
// ─────────────────────────────────────────────────────────────────────────────

// Accordion sections — `supportLink` deep-links to the support docs/help
// surface for that category, so backend can route help-requests by section.
const SETTINGS_SECTIONS = [
  { id: "account",      label: "Account",          desc: "Workspace name, slug, contact email.",                                supportLink: "/help/settings/account" },
  { id: "plan",         label: "Plan & billing",   desc: "Your current plan, usage, and invoices.",                              supportLink: "/help/settings/billing" },
  { id: "workspace",    label: "Workspace",        desc: "Timezone, locale, currency, custom fields, and taxonomy.",             supportLink: "/help/settings/workspace" },
  { id: "domain",       label: "Domain",           desc: "Run your storefront at your own domain.",                              supportLink: "/help/settings/domain" },
  { id: "branding",     label: "Branding",         desc: "Logo, colors, email identity — what clients see.",                     supportLink: "/help/settings/branding" },
  { id: "team",         label: "Team",             desc: "Invite teammates and assign roles.",                                   supportLink: "/help/settings/team" },
  { id: "integrations", label: "Integrations",     desc: "Connect calendars, CRMs, and other tools.",                            supportLink: "/help/settings/integrations" },
  { id: "features",     label: "Feature controls", desc: "Turn platform features on or off for your workspace.",                 supportLink: "/help/settings/features" },
  { id: "danger",       label: "Danger zone",      desc: "Irreversible operations — proceed with care.",                         supportLink: "/help/settings/danger" },
] as const;
type SettingsSection = typeof SETTINGS_SECTIONS[number]["id"];

function SettingsSectionHeader({ title, desc }: { title: string; desc: string }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 15, fontWeight: 700, color: COLORS.ink, fontFamily: FONTS.body, marginBottom: 3 }}>{title}</div>
      <div style={{ fontSize: 13, color: COLORS.inkMuted, fontFamily: FONTS.body }}>{desc}</div>
    </div>
  );
}

function LockedPill({ plan }: { plan: Plan }) {
  return (
    <span style={{
      fontSize: 10.5, fontWeight: 700, padding: "2px 7px", borderRadius: 999,
      background: COLORS.surfaceAlt, color: COLORS.inkMuted,
      border: `1px solid ${COLORS.border}`, fontFamily: FONTS.body,
      textTransform: "capitalize",
    }}>
      {plan}+
    </span>
  );
}

function WorkspacePageView() {
  const { state, openDrawer, openUpgrade, toast, pendingTalent, verificationRequests, profileClaims } = useProto();
  const pendingTrustCount = verificationRequests.filter(r =>
    r.status === "submitted" || r.status === "in_review" || r.status === "needs_more_info"
  ).length;
  const disputedClaimsCount = profileClaims.filter(c => c.status === "disputed").length;
  const isOwner = state.role === "owner";
  const isAdmin = meetsRole(state.role, "admin");
  const isFree = state.plan === "free";

  // Accordion: only Account expanded by default. Click a section header
  // to expand it; click again to collapse. Each accordion item carries
  // a `data-support-link` that backend can route to /help/settings/{id}.
  const [openSet, setOpenSet] = useState<Set<string>>(new Set(["account"]));
  const isOpen = (id: string) => openSet.has(id);
  const toggleSection = (id: string) => {
    setOpenSet((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const expandAll = () => setOpenSet(new Set(SETTINGS_SECTIONS.map(s => s.id)));
  const collapseAll = () => setOpenSet(new Set(["account"]));

  // 2026 redesign — group the 13-accordion wall into 4 tabs.
  // Each tab renders a subset of the accordion list; user can still
  // expand/collapse within the tab. Clearer mental map than a giant scroll.
  type SettingsTab = "workspace" | "roster" | "team" | "billing" | "advanced";
  const [activeTab, setActiveTab] = useState<SettingsTab>("workspace");
  const TABS: { id: SettingsTab; label: string; emoji: string; sections: string[] }[] = [
    { id: "workspace", label: "Workspace",     emoji: "🏛", sections: ["account", "workspace", "domain", "branding"] },
    { id: "roster",    label: "Roster",        emoji: "🎯", sections: ["talent-types"] },
    { id: "team",      label: "Team & legal",  emoji: "👥", sections: ["team", "compliance"] },
    { id: "billing",   label: "Plan & integrations", emoji: "💳", sections: ["plan", "integrations", "brand", "growth", "email"] },
    { id: "advanced",  label: "Advanced",      emoji: "⚙",  sections: ["features", "danger"] },
  ];
  const visibleSections = new Set(TABS.find(t => t.id === activeTab)!.sections);

  // Auto-save indicator (#6) — simulates a settings save 1.2s after mount
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  useEffect(() => {
    const t = setTimeout(() => setSavedAt(new Date()), 1200);
    return () => clearTimeout(t);
  }, []);

  /** Settings list row — white card with flex-row layout + hover lift.
   *  Interactive rows: pass `onClick`; the whole surface becomes the tap target.
   *  Non-interactive rows (inner button only): omit `onClick`. */
  function SettingsRow({
    children,
    onClick,
    opacity,
    borderColor,
  }: {
    children: ReactNode;
    onClick?: () => void;
    opacity?: number;
    borderColor?: string;
  }) {
    return (
      <Card
        interactive={!!onClick}
        onClick={onClick}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "14px 16px",
          marginBottom: 8,
          fontFamily: FONTS.body,
          ...(opacity !== undefined && { opacity }),
          ...(borderColor ? { borderColor } : {}),
        }}
      >
        {children}
      </Card>
    );
  }
  // ── Accordion item shell ────────────────────────────────────────
  // Click the row to expand/collapse. Smooth chevron rotation + soft
  // border highlight when open. `supportLink` is wired to a data-attr
  // so backend deep-linking works.
  function AccordionItem({
    id, label, desc, supportLink, danger, defaultBadge, children,
  }: {
    id: string;
    label: string;
    desc: string;
    supportLink: string;
    danger?: boolean;
    defaultBadge?: ReactNode;
    children: ReactNode;
  }) {
    const open = isOpen(id);
    return (
      <div
        data-settings-section={id}
        data-support-link={supportLink}
        style={{
          marginBottom: 8,
          background: "#fff",
          border: `1px solid ${open ? (danger ? "#FCA5A5" : COLORS.border) : COLORS.borderSoft}`,
          borderRadius: RADIUS.md,
          overflow: "hidden",
          transition: `border-color ${TRANSITION.sm}, box-shadow ${TRANSITION.sm}`,
          boxShadow: open ? "0 1px 3px rgba(11,11,13,0.04)" : "none",
        }}
      >
        <button
          type="button"
          onClick={() => toggleSection(id)}
          aria-expanded={open}
          aria-controls={`settings-body-${id}`}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            width: "100%",
            padding: "14px 16px",
            background: "transparent",
            border: "none",
            cursor: "pointer",
            fontFamily: FONTS.body,
            textAlign: "left",
          }}
          onMouseEnter={(e) => { if (!open) e.currentTarget.style.background = "rgba(11,11,13,0.02)"; }}
          onMouseLeave={(e) => { if (!open) e.currentTarget.style.background = "transparent"; }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{
                fontFamily: FONTS.display, fontSize: 15, fontWeight: 600,
                color: danger ? "#DC2626" : COLORS.ink, letterSpacing: -0.1,
              }}>
                {label}
              </span>
              {defaultBadge}
            </div>
            <div style={{
              fontSize: 12.5, color: COLORS.inkMuted, marginTop: 2, lineHeight: 1.4,
              whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
            }}>
              {desc}
            </div>
          </div>
          {/* Chevron — rotates 180° when open */}
          <span aria-hidden style={{ flexShrink: 0, color: COLORS.inkMuted, transition: `transform ${TRANSITION.sm}`, transform: open ? "rotate(180deg)" : "rotate(0deg)" }}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </span>
        </button>
        {open && (
          <div
            id={`settings-body-${id}`}
            style={{
              padding: "0 16px 14px",
              borderTop: `1px solid ${COLORS.borderSoft}`,
              animation: "settingsAccordionExpand .2s ease-out",
            }}
          >
            <style>{`@keyframes settingsAccordionExpand { from { opacity: 0; transform: translateY(-2px); } to { opacity: 1; transform: translateY(0); } }`}</style>
            <div style={{ paddingTop: 12 }}>{children}</div>
          </div>
        )}
      </div>
    );
  }

  return (
    <>
      <PageHeader
        title="Settings"
        subtitle="Plan, team, branding, identity — the controls that shape who you are inside Tulala."
        actions={
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <button
              type="button"
              onClick={openSet.size === SETTINGS_SECTIONS.length ? collapseAll : expandAll}
              style={{
                background: "transparent", border: "none", cursor: "pointer",
                fontFamily: FONTS.body, fontSize: 12, fontWeight: 500,
                color: COLORS.inkMuted, padding: "6px 8px", borderRadius: 6,
              }}
              onMouseEnter={(e) => (e.currentTarget.style.color = COLORS.ink)}
              onMouseLeave={(e) => (e.currentTarget.style.color = COLORS.inkMuted)}
            >
              {openSet.size === SETTINGS_SECTIONS.length ? "Collapse all" : "Expand all"}
            </button>
            <AutoSaveIndicator savedAt={savedAt} />
          </div>
        }
      />

      {/* 2026 redesign — tab nav groups the 13 accordions into 5 buckets.
          Each tab still uses accordion sections within for expand/collapse. */}
      <div
        data-tulala-settings-tabs
        style={{
          display: "flex",
          gap: 4,
          padding: 4,
          background: "rgba(11,11,13,0.04)",
          borderRadius: 999,
          marginBottom: 16,
          maxWidth: 760,
          overflowX: "auto",
          scrollbarWidth: "none",
        }}
      >
        {TABS.map((t) => {
          const active = activeTab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setActiveTab(t.id)}
              style={{
                flexShrink: 0,
                padding: "7px 14px",
                borderRadius: 999,
                border: "none",
                background: active ? "#fff" : "transparent",
                color: active ? COLORS.ink : COLORS.inkMuted,
                fontFamily: FONTS.body,
                fontSize: 12.5,
                fontWeight: active ? 600 : 500,
                cursor: "pointer",
                boxShadow: active ? "0 1px 2px rgba(11,11,13,0.06)" : "none",
                whiteSpace: "nowrap",
                display: "inline-flex",
                alignItems: "center",
                gap: 5,
              }}
            >
              <span aria-hidden style={{ fontSize: 13 }}>{t.emoji}</span>
              {t.label}
            </button>
          );
        })}
      </div>

      {/* Single column accordion — click each section header to expand. */}
      <div style={{ maxWidth: 760 }}>
        <div>

          {visibleSections.has("account") && (
          <AccordionItem id="account" label="Account" desc="Workspace name, slug, and contact info." supportLink="/help/settings/account">
            <SettingsRow onClick={() => openDrawer("identity")}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.ink }}>{TENANT.name}</div>
                <div style={{ fontSize: 12, color: COLORS.inkMuted, marginTop: 2 }}>Name · Slug · Contact email</div>
              </div>
              <Affordance label="Edit" />
            </SettingsRow>
          </AccordionItem>
          )}

          {visibleSections.has("plan") && (
          <AccordionItem id="plan" label="Plan & billing" desc="Your current plan, usage, and invoices." supportLink="/help/settings/billing" defaultBadge={<PlanChip plan={state.plan} variant="solid" />}>
            {isOwner ? (
              <SettingsRow onClick={() => openDrawer("plan-billing")}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <PlanChip plan={state.plan} variant="solid" />
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.ink }}>{PLAN_META[state.plan].label}</div>
                    <div style={{ fontSize: 12, color: COLORS.inkMuted, marginTop: 2 }}>{PLAN_META[state.plan].theme}</div>
                  </div>
                </div>
                <Affordance label="Manage" />
              </SettingsRow>
            ) : (
              <SettingsRow opacity={0.6}>
                <span style={{ fontSize: 13, color: COLORS.inkMuted }}>Only owners can change billing</span>
                <ReadOnlyChip />
              </SettingsRow>
            )}
          </AccordionItem>
          )}

          {visibleSections.has("workspace") && (
          <AccordionItem id="workspace" label="Workspace" desc="Timezone, locale, currency, custom fields, and taxonomy." supportLink="/help/settings/workspace">
            {[
              { title: "General",     desc: "Timezone · Locale · Default currency",  drawer: "workspace-settings" as const },
              { title: "Field catalog", desc: "Custom fields for talent, clients, bookings", drawer: "field-catalog" as const, plan: "agency" as const },
              { title: "Taxonomy",    desc: "Tags, niches, segments for filtering",  drawer: "taxonomy" as const, plan: "agency" as const },
            ].map((row) => {
              const locked = row.plan && !meetsPlan(state.plan, row.plan);
              return (
                <SettingsRow
                  key={row.drawer}
                  opacity={locked ? 0.55 : 1}
                  onClick={() => locked ? openUpgrade({ feature: row.title, why: row.desc, requiredPlan: row.plan! }) : openDrawer(row.drawer)}
                >
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.ink }}>{row.title}</div>
                    <div style={{ fontSize: 12, color: COLORS.inkMuted, marginTop: 2 }}>{row.desc}</div>
                  </div>
                  {locked ? <LockedPill plan={row.plan!} /> : <Affordance label="Configure" />}
                </SettingsRow>
              );
            })}
          </AccordionItem>
          )}

          {visibleSections.has("domain") && (
          <AccordionItem id="domain" label="Domain" desc="Run your storefront at your own domain." supportLink="/help/settings/domain">
            {meetsPlan(state.plan, "studio") ? (
              <SettingsRow onClick={() => toast("Coming soon")}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.ink }}>Custom domain</div>
                  <div style={{ fontSize: 12, color: COLORS.inkMuted, marginTop: 2 }}>
                    {TENANT.customDomain ?? "No custom domain connected"}
                  </div>
                </div>
                <Affordance label="Configure" />
              </SettingsRow>
            ) : (
              <SettingsRow
                opacity={0.55}
                onClick={() => openUpgrade({ feature: "Custom domain", why: "Run your storefront at your own domain.", requiredPlan: "studio" })}
              >
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.ink }}>Custom domain</div>
                  <div style={{ fontSize: 12, color: COLORS.inkMuted, marginTop: 2 }}>Requires Studio or above</div>
                </div>
                <LockedPill plan="studio" />
              </SettingsRow>
            )}
          </AccordionItem>
          )}

          {visibleSections.has("branding") && (
          <AccordionItem id="branding" label="Branding" desc="Logo, colors, email identity — what clients see." supportLink="/help/settings/branding">
            {isAdmin && meetsPlan(state.plan, "agency") ? (
              <SettingsRow onClick={() => openDrawer("branding")}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.ink }}>Brand identity</div>
                  <div style={{ fontSize: 12, color: COLORS.inkMuted, marginTop: 2 }}>Logo · Colors · Email signature · Voice</div>
                </div>
                <Affordance label="Edit" />
              </SettingsRow>
            ) : (
              <SettingsRow
                opacity={0.55}
                onClick={() => openUpgrade({ feature: "Branding", why: "Full brand identity control.", requiredPlan: "agency", unlocks: ["Logo & favicon", "Color tokens", "Email signature"] })}
              >
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.ink }}>Brand identity</div>
                  <div style={{ fontSize: 12, color: COLORS.inkMuted, marginTop: 2 }}>Requires Agency or above</div>
                </div>
                <LockedPill plan="agency" />
              </SettingsRow>
            )}
          </AccordionItem>
          )}

          {visibleSections.has("team") && (
          <AccordionItem id="team" label="Team" desc="Invite teammates and assign roles." supportLink="/help/settings/team">
            {isAdmin && !isFree ? (
              <SettingsRow onClick={() => openDrawer("team")}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.ink }}>Team members</div>
                  <div style={{ fontSize: 12, color: COLORS.inkMuted, marginTop: 2 }}>
                    {getTeam(state.plan).length} members · viewer / editor / coordinator / admin / owner
                  </div>
                </div>
                <Affordance label="Manage" />
              </SettingsRow>
            ) : (
              <SettingsRow
                opacity={0.55}
                onClick={() => openUpgrade({ feature: "Team & roles", why: "Invite teammates.", requiredPlan: "agency", unlocks: ["Up to 25 seats", "Role-based access"] })}
              >
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.ink }}>Team members</div>
                  <div style={{ fontSize: 12, color: COLORS.inkMuted, marginTop: 2 }}>Requires Agency or above</div>
                </div>
                <LockedPill plan="agency" />
              </SettingsRow>
            )}
          </AccordionItem>
          )}

          {visibleSections.has("talent-types") && (
          <AccordionItem id="talent-types" label="Talent types" desc="Choose which talent categories your roster supports." supportLink="/help/settings/talent-types">
            <SettingsRow onClick={() => openDrawer("talent-types")}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.ink }}>Categories on your site</div>
                <div style={{ fontSize: 12, color: COLORS.inkMuted, marginTop: 2 }}>
                  Master taxonomy · plan-tier gated
                </div>
              </div>
              <Affordance label="Manage" />
            </SettingsRow>
            <SettingsRow onClick={() => openDrawer("field-privacy")}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.ink }}>Field privacy</div>
                <div style={{ fontSize: 12, color: COLORS.inkMuted, marginTop: 2 }}>
                  What's public on your site, what admins see, what's hidden
                </div>
              </div>
              <Affordance label="Configure" />
            </SettingsRow>
            <SettingsRow onClick={() => openDrawer("field-catalog")}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.ink }}>Field catalog</div>
                <div style={{ fontSize: 12, color: COLORS.inkMuted, marginTop: 2 }}>
                  Built-in fields + add agency-specific custom fields
                </div>
              </div>
              <Affordance label="Open" />
            </SettingsRow>
            <SettingsRow onClick={() => openDrawer("trust-verification-queue")}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flex: 1 }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.ink }}>Trust & Verification</div>
                  <div style={{ fontSize: 12, color: COLORS.inkMuted, marginTop: 2 }}>
                    Review Instagram + Tulala verification requests · approve / reject / request more info
                  </div>
                </div>
                {pendingTrustCount > 0 && (
                  <span style={{
                    display: "inline-flex", alignItems: "center", justifyContent: "center",
                    minWidth: 18, height: 18, padding: "0 6px", borderRadius: 999,
                    background: COLORS.indigo, color: "#fff",
                    fontSize: 10.5, fontWeight: 700, lineHeight: 1,
                  }}>{pendingTrustCount}</span>
                )}
              </div>
              <Affordance label={pendingTrustCount > 0 ? "Review" : "Open"} />
            </SettingsRow>
            <SettingsRow onClick={() => openDrawer("trust-disputed-claims")}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flex: 1 }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.ink }}>Disputed claims</div>
                  <div style={{ fontSize: 12, color: COLORS.inkMuted, marginTop: 2 }}>
                    Talent-flagged agency profiles · release / uphold / remove
                  </div>
                </div>
                {disputedClaimsCount > 0 && (
                  <span style={{
                    display: "inline-flex", alignItems: "center", justifyContent: "center",
                    minWidth: 18, height: 18, padding: "0 6px", borderRadius: 999,
                    background: COLORS.red, color: "#fff",
                    fontSize: 10.5, fontWeight: 700, lineHeight: 1,
                  }}>{disputedClaimsCount}</span>
                )}
              </div>
              <Affordance label={disputedClaimsCount > 0 ? "Resolve" : "Open"} />
            </SettingsRow>
            <SettingsRow onClick={() => openDrawer("talent-approvals")}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.ink }}>Pending approvals</div>
                  <div style={{ fontSize: 12, color: COLORS.inkMuted, marginTop: 2 }}>
                    {pendingTalent.length === 0
                      ? "No self-registrations waiting — you'll be notified."
                      : "Self-registered talent waiting for review"}
                  </div>
                </div>
                {pendingTalent.length > 0 && (
                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      minWidth: 18,
                      height: 18,
                      padding: "0 6px",
                      borderRadius: 999,
                      background: COLORS.amber,
                      color: "#fff",
                      fontSize: 10.5,
                      fontWeight: 700,
                    }}
                  >
                    {pendingTalent.length}
                  </span>
                )}
              </div>
              <Affordance label={pendingTalent.length === 0 ? "Open queue" : "Review"} />
            </SettingsRow>
          </AccordionItem>
          )}

          {visibleSections.has("integrations") && (
          <AccordionItem id="integrations" label="Integrations" desc="Connect calendars, CRMs, and other tools." supportLink="/help/settings/integrations">
            {[
              { name: "Google Calendar sync", status: "Connected",  connected: true  },
              { name: "Slack notifications",   status: "Not set up", connected: false },
              { name: "Xero / QuickBooks",      status: "Not set up", connected: false },
            ].map((intg) => (
              <SettingsRow key={intg.name} onClick={() => toast("Coming soon")}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.ink }}>{intg.name}</div>
                  <div style={{ fontSize: 12, marginTop: 2, color: intg.connected ? COLORS.successDeep : COLORS.inkMuted }}>
                    {intg.status}
                  </div>
                </div>
                <Affordance label={intg.connected ? "Manage" : "Connect"} />
              </SettingsRow>
            ))}
          </AccordionItem>
          )}

          {visibleSections.has("brand") && (
          <AccordionItem id="brand" label="Data & brand tools" desc="Imports, migration, brand assets, and brief authoring." supportLink="/help/settings/data-brand">
            <SettingsRow onClick={() => openDrawer("csv-import", { type: "talent" })}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.ink }}>Import talent</div>
                <div style={{ fontSize: 12, color: COLORS.inkMuted, marginTop: 2 }}>Bulk CSV import with column mapping.</div>
              </div>
              <Affordance label="Import" />
            </SettingsRow>
            <SettingsRow onClick={() => openDrawer("migration-assistant")}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.ink }}>Migration assistant</div>
                <div style={{ fontSize: 12, color: COLORS.inkMuted, marginTop: 2 }}>AI-assisted import from Excel, WhatsApp, Airtable.</div>
              </div>
              <Affordance label="Migrate" />
            </SettingsRow>
            <SettingsRow onClick={() => openDrawer("brand-assets")}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.ink }}>Brand assets</div>
                <div style={{ fontSize: 12, color: COLORS.inkMuted, marginTop: 2 }}>Logos, photography, and document library.</div>
              </div>
              <Affordance label="Manage" />
            </SettingsRow>
            <SettingsRow onClick={() => openDrawer("beta-program")}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.ink }}>Beta program</div>
                <div style={{ fontSize: 12, color: COLORS.inkMuted, marginTop: 2 }}>Opt into early-access features.</div>
              </div>
              <Affordance label="Manage" />
            </SettingsRow>
          </AccordionItem>
          )}

          {visibleSections.has("growth") && (
          <AccordionItem id="growth" label="Growth & integrations" desc="Calendar sync, referrals, and platform status." supportLink="/help/settings/growth">
            <SettingsRow onClick={() => openDrawer("calendar-sync")}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.ink }}>Calendar sync</div>
                <div style={{ fontSize: 12, color: COLORS.inkMuted, marginTop: 2 }}>Google, Apple, Outlook · iCal subscription URL.</div>
              </div>
              <Affordance label="Manage" />
            </SettingsRow>
            <SettingsRow onClick={() => openDrawer("referral-dashboard")}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.ink }}>Referral program</div>
                <div style={{ fontSize: 12, color: COLORS.inkMuted, marginTop: 2 }}>Earn €50 credit per workspace you refer.</div>
              </div>
              <Affordance label="View" />
            </SettingsRow>
            <SettingsRow onClick={() => openDrawer("system-status")}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.ink }}>System status</div>
                <div style={{ fontSize: 12, color: COLORS.inkMuted, marginTop: 2 }}>Tulala infrastructure health and incident log.</div>
              </div>
              <Affordance label="View" />
            </SettingsRow>
          </AccordionItem>
          )}

          {visibleSections.has("email") && (
          <AccordionItem id="email" label="Email & communications" desc="Templates, sequences, branding, and notification preferences." supportLink="/help/settings/email">
            <SettingsRow onClick={() => openDrawer("email-templates")}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.ink }}>Email templates</div>
                <div style={{ fontSize: 12, color: COLORS.inkMuted, marginTop: 2 }}>Manage your transactional email library.</div>
              </div>
              <Affordance label="Manage" />
            </SettingsRow>
            <SettingsRow onClick={() => openDrawer("email-branding")}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.ink }}>Email branding</div>
                <div style={{ fontSize: 12, color: COLORS.inkMuted, marginTop: 2 }}>Sender name, logo, colors, and footer.</div>
              </div>
              <Affordance label="Customize" />
            </SettingsRow>
            <SettingsRow onClick={() => openDrawer("email-sequences")}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.ink }}>Email sequences</div>
                <div style={{ fontSize: 12, color: COLORS.inkMuted, marginTop: 2 }}>Onboarding, dunning, win-back campaigns.</div>
              </div>
              <Affordance label="Manage" />
            </SettingsRow>
            <SettingsRow onClick={() => openDrawer("notification-prefs")}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.ink }}>Notification preferences</div>
                <div style={{ fontSize: 12, color: COLORS.inkMuted, marginTop: 2 }}>Email, push, and SMS per event type.</div>
              </div>
              <Affordance label="Configure" />
            </SettingsRow>
          </AccordionItem>
          )}

          {visibleSections.has("compliance") && (
          <AccordionItem id="compliance" label="Compliance & legal" desc="GDPR, consent records, and contract templates." supportLink="/help/settings/compliance">
            <SettingsRow onClick={() => openDrawer("gdpr-export")}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.ink }}>Export your data</div>
                <div style={{ fontSize: 12, color: COLORS.inkMuted, marginTop: 2 }}>GDPR / CCPA data portability — per data type.</div>
              </div>
              <Affordance label="Export" />
            </SettingsRow>
            <SettingsRow onClick={() => openDrawer("consent-log")}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.ink }}>Consent log</div>
                <div style={{ fontSize: 12, color: COLORS.inkMuted, marginTop: 2 }}>Marketing preferences — timestamped and auditable.</div>
              </div>
              <Affordance label="View" />
            </SettingsRow>
            <SettingsRow onClick={() => openDrawer("contract-templates")}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.ink }}>Contract templates</div>
                <div style={{ fontSize: 12, color: COLORS.inkMuted, marginTop: 2 }}>Workspace-wide reusable templates with merge fields.</div>
              </div>
              <Affordance label="Manage" />
            </SettingsRow>
            <SettingsRow onClick={() => openDrawer("audit-log")}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.ink }}>Audit log</div>
                <div style={{ fontSize: 12, color: COLORS.inkMuted, marginTop: 2 }}>Full event trail — logins, edits, access records.</div>
              </div>
              <Affordance label="View" />
            </SettingsRow>
          </AccordionItem>
          )}

          {isAdmin && visibleSections.has("features") && (
          <AccordionItem id="features" label="Feature controls" desc="Turn platform features on or off for your workspace." supportLink="/help/settings/features">
              <SettingsRow onClick={() => openDrawer("feature-controls")}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.ink }}>All feature toggles</div>
                  <div style={{ fontSize: 12, color: COLORS.inkMuted, marginTop: 2 }}>Inbox, casting, bookings, payments, analytics, AI tools, site builder, and more.</div>
                </div>
                <Affordance label="Configure" />
              </SettingsRow>
            </AccordionItem>
          )}

          {isOwner && visibleSections.has("danger") && (
          <AccordionItem id="danger" label="Danger zone" desc="Irreversible operations — proceed with care." supportLink="/help/settings/danger" danger>
              <SettingsRow borderColor="#FCA5A5" onClick={() => openDrawer("danger-zone")}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "#DC2626" }}>Delete or transfer workspace</div>
                  <div style={{ fontSize: 12, color: COLORS.inkMuted, marginTop: 2 }}>Export everything, transfer ownership, or delete this workspace.</div>
                </div>
                <Affordance label="Open" />
              </SettingsRow>
            </AccordionItem>
          )}

        </div>{/* end accordion list */}
      </div>{/* end max-width wrapper */}

      {/* Legacy — keep MoreWithSection for free plan upsell below the main layout */}
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
        // Wrap client in HybridShell so it gets the same persistent
        // identity bar (avatar / brand switcher / Talent↔Workspace mode
        // toggle / notifications) that talent + workspace have. Mirrors
        // the talent surface treatment for visual parity.
        return (
          <HybridShell>
            <ClientSurface />
          </HybridShell>
        );
      case "platform":
        return <PlatformSurface />;
    }
  })();
  return (
    <main id="tulala-main" tabIndex={-1} aria-label={`${state.surface} surface`} style={{ display: "contents", outline: "none" }}>
      {inner}
      <UpgradeCelebration />
    </main>
  );
}

// ════════════════════════════════════════════════════════════════════
// UpgradeCelebration — fires when plan ranks up (Free → Studio → Agency
// → Network). Shows a brief, premium overlay listing the new unlocks.
// Auto-dismisses after 6s; the user can also tap to skip.
// ════════════════════════════════════════════════════════════════════
function UpgradeCelebration() {
  const { state } = useProto();
  const planRanks: Record<Plan, number> = {
    free: 0, studio: 1, agency: 2, network: 3,
  };
  const SS_KEY = "tulala_prev_plan";
  const [showing, setShowing] = useState<Plan | null>(null);

  // 2026 redesign — fire on any "first time seeing this plan this session"
  // where the plan rank increased. Uses sessionStorage as the source of
  // truth so URL navigation, in-app setPlan, or page reload all trigger
  // consistently. Side-effect-free guard via a ref + timeout.
  const checkedRef = useRef<string | null>(null);
  useEffect(() => {
    const key = state.plan;
    if (checkedRef.current === key) return; // already checked this plan in this mount
    checkedRef.current = key;
    let prev: Plan | null = null;
    try { prev = window.sessionStorage.getItem(SS_KEY) as Plan | null; } catch {}
    // Persist the "last seen plan" each time, regardless of celebration.
    try { window.sessionStorage.setItem(SS_KEY, key); } catch {}
    if (!prev) return; // first time in session — don't celebrate
    if (prev === key) return;
    if (planRanks[key] <= planRanks[prev]) return; // downgrade or sideways
    setShowing(key);
    const t = setTimeout(() => setShowing(null), 6000);
    return () => clearTimeout(t);
  }, [state.plan]);

  if (!showing) return null;

  const unlocks: Record<Plan, string[]> = {
    free:    [],
    studio:  ["Custom domain", "Owned client list", "Up to 50 talents", "Private inquiry inbox"],
    agency:  ["Branded design system", "Custom roster fields", "Team & roles up to 25", "Up to 200 talents"],
    network: ["Multi-brand workspaces", "Cross-roster pool", "Hub-level analytics", "Unlimited everything"],
  };
  const tier = showing;
  const tierMeta: Record<Plan, { color: string; soft: string; emoji: string }> = {
    free:    { color: COLORS.inkMuted,  soft: "rgba(11,11,13,0.05)",   emoji: "🌱" },
    studio:  { color: "#3B4A75",         soft: "rgba(91,107,160,0.12)", emoji: "✦" },
    agency:  { color: "#7A5A1F",         soft: "rgba(184,135,49,0.16)", emoji: "★" },
    network: { color: COLORS.accentDeep, soft: "rgba(15,79,62,0.12)",   emoji: "◆" },
  };
  const meta = tierMeta[tier];
  const items = unlocks[tier];

  return (
    <div
      onClick={() => setShowing(null)}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 250,
        background: "rgba(11,11,13,0.45)",
        backdropFilter: "blur(10px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        animation: "tulala-celebrate-fade-in 0.3s ease",
      }}
    >
      <style>{`
        @keyframes tulala-celebrate-fade-in {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        @keyframes tulala-celebrate-pop {
          0%   { transform: scale(0.92) translateY(12px); opacity: 0; }
          60%  { transform: scale(1.02) translateY(0); opacity: 1; }
          100% { transform: scale(1)    translateY(0); opacity: 1; }
        }
      `}</style>
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "calc(100% - 48px)",
          maxWidth: 420,
          background: "#fff",
          borderRadius: 20,
          padding: 28,
          fontFamily: FONTS.body,
          boxShadow: "0 24px 80px -20px rgba(11,11,13,0.45)",
          animation: "tulala-celebrate-pop 0.45s cubic-bezier(.2,.9,.3,1.2)",
          textAlign: "center",
        }}
      >
        <div
          style={{
            width: 64,
            height: 64,
            borderRadius: "50%",
            background: meta.soft,
            color: meta.color,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 30,
            margin: "0 auto 16px",
            boxShadow: `0 8px 32px -8px ${meta.soft}`,
          }}
        >
          {meta.emoji}
        </div>
        <div
          style={{
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: 1.4,
            color: meta.color,
            textTransform: "uppercase",
            marginBottom: 6,
          }}
        >
          Welcome to {PLAN_META[tier].label}
        </div>
        <h2
          style={{
            margin: 0,
            fontFamily: FONTS.display,
            fontSize: 22,
            fontWeight: 600,
            color: COLORS.ink,
            letterSpacing: -0.3,
            lineHeight: 1.2,
            marginBottom: 12,
          }}
        >
          {items.length} things unlocked.
        </h2>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 6,
            margin: "0 0 20px",
            textAlign: "left",
          }}
        >
          {items.map((u) => (
            <div
              key={u}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "8px 12px",
                borderRadius: 10,
                background: meta.soft,
                fontSize: 13,
                color: COLORS.ink,
                fontWeight: 500,
              }}
            >
              <span style={{ color: meta.color, fontSize: 13, lineHeight: 1, fontWeight: 700 }}>✓</span>
              {u}
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={() => setShowing(null)}
          style={{
            padding: "10px 22px",
            borderRadius: 999,
            border: "none",
            background: COLORS.fill,
            color: "#fff",
            fontFamily: FONTS.body,
            fontSize: 13,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          Take me in
        </button>
        <div style={{ marginTop: 8, fontSize: 10.5, color: COLORS.inkDim }}>
          Tap anywhere to dismiss · auto-closes in 6s
        </div>
      </div>
    </div>
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
    pendingTalent,
  } = useProto();
  const [moreOpen, setMoreOpen] = useState(false);
  // WS-12.6 — left/right arrows move between bottom nav tabs
  const bottomNavRef = useRef<HTMLElement | null>(null);
  useRovingTabindex(bottomNavRef, "button", { orientation: "horizontal" });

  const tabs = (() => {
    if (state.surface === "workspace") {
      // Mobile nav badges — surface pending-approval count on the Roster tab
      // + unread message count on Messages, matching the desktop topbar nav.
      // Single source of truth.
      const WORKSPACE_TAB_BADGE: Partial<Record<WorkspacePage, number>> = {
        roster: pendingTalent.length || undefined,
        messages: WORKSPACE_NOTIFICATION_COUNT || undefined,
      };
      return WORKSPACE_PAGES.map((p) => ({
        id: p,
        label: p === "talent" ? ENTITY_TYPE_META[state.entityType].rosterLabel : PAGE_META[p].label,
        active: state.page === p,
        run: () => setPage(p as WorkspacePage),
        icon: WORKSPACE_TAB_ICON[p as WorkspacePage] ?? "info",
        badge: WORKSPACE_TAB_BADGE[p as WorkspacePage],
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
      // Client surface badges — unread on Messages (mock 2 for prototype).
      const CLIENT_TAB_BADGE: Partial<Record<ClientPage, number>> = {
        messages: 2,
      };
      return CLIENT_PAGES.map((p) => ({
        id: p,
        label: CLIENT_PAGE_META[p].label,
        active: state.clientPage === p,
        run: () => setClientPage(p as ClientPage),
        icon: CLIENT_TAB_ICON[p as ClientPage] ?? "info",
        badge: CLIENT_TAB_BADGE[p as ClientPage],
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
        ref={bottomNavRef}
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
        <div style={{ display: "flex", alignItems: "stretch", height: 64 }}>
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
            {/* Divider + auxiliary actions (feedback, help) — keep them
                inside the same menu instead of as floating buttons that
                cover content. */}
            <div style={{ height: 1, background: COLORS.borderSoft, margin: "6px 12px" }} />
            <button
              type="button"
              onClick={() => {
                // Trigger the FeedbackButton via a custom event the
                // primitive listens to. Simple + decoupled.
                if (typeof window !== "undefined") {
                  window.dispatchEvent(new CustomEvent("tulala-open-feedback"));
                }
                setMoreOpen(false);
              }}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                width: "100%",
                padding: "14px 18px",
                background: "transparent",
                border: "none",
                cursor: "pointer",
                fontFamily: FONTS.body,
                fontSize: 15,
                fontWeight: 500,
                color: COLORS.ink,
                textAlign: "left",
              }}
            >
              <span style={{ display: "inline-flex", color: COLORS.inkMuted }}>
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path d="M3 4.5h10v6.5l-3 .5-2 2-2-2H3v-7z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </span>
              Send feedback
            </button>
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
        padding: "7px 6px 6px",
        margin: "4px 3px",
        color: active ? COLORS.accentDeep : COLORS.inkMuted,
        fontFamily: FONTS.body,
        fontSize: 11,
        fontWeight: active ? 600 : 500,
        letterSpacing: 0.05,
        lineHeight: 1.2,
        position: "relative",
        transition: `background ${TRANSITION.sm}, color ${TRANSITION.sm}`,
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
          size={18}
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
      <span style={{
        whiteSpace: "nowrap",
        overflow: "hidden",
        textOverflow: "ellipsis",
        maxWidth: 76,
        lineHeight: 1.3,
        // Reserve space for descenders so y/g/p don't clip on iOS where
        // line-box rounds down. paddingBottom + display:block guarantees
        // the descender area is part of the layout box.
        display: "block",
      }}>
        {label}
      </span>
    </button>
  );
}

const WORKSPACE_TAB_ICON: Partial<Record<WorkspacePage, "info" | "sparkle" | "plus" | "search" | "mail" | "calendar" | "user" | "team" | "bolt" | "credit">> = {
  overview: "bolt",
  messages: "mail",
  calendar: "calendar",
  roster: "team",
  clients: "user",
  operations: "search",
  production: "sparkle",
  settings: "info",
  // legacy aliases
  inbox: "mail",
  work: "info",
  talent: "team",
  site: "sparkle",
  billing: "credit",
  workspace: "info",
};

const TALENT_TAB_ICON: Partial<Record<TalentPage, "info" | "sparkle" | "plus" | "search" | "mail" | "calendar" | "user" | "team" | "bolt" | "credit">> = {
  today: "bolt",
  messages: "mail",
  profile: "user",
  calendar: "calendar",
  agencies: "team",
  "public-page": "sparkle",
  settings: "info",
  // legacy aliases
  inbox: "mail",
  activity: "sparkle",
  reach: "search",
};

const CLIENT_TAB_ICON: Partial<Record<ClientPage, "info" | "sparkle" | "plus" | "search" | "mail" | "calendar" | "user" | "team" | "bolt" | "credit">> = {
  today: "bolt",
  messages: "mail",
  discover: "search",
  shortlists: "team",
  inquiries: "mail",
  bookings: "calendar",
  settings: "info",
};
