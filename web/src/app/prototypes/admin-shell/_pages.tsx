"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
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
  ROLE_META,
  ROLES,
  SURFACE_META,
  SURFACES,
  TALENT_PAGES,
  TALENT_PAGE_META,
  TALENT_STATE_LABEL,
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
  ACTIVATION_TASKS,
  FREE_PLAN_VALUE,
  SITE_PAGES,
  WORKSPACE_PAYMENTS,
  PAYMENT_STATUS_META,
  PAYOUT_STATUS_META,
  PLAN_FEE_META,
  getWorkspacePayout,
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
  PayoutStatusChip,
  PaymentStatusChip,
  SwipeableRow,
} from "./_primitives";
import { SavedViewsBar } from "./_wave2";
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
      <span
        style={{
          fontSize: 11,
          color: "rgba(255,255,255,0.45)",
          letterSpacing: 0.2,
        }}
      >
        Tulala admin · v0.3 prototype
      </span>
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

// ════════════════════════════════════════════════════════════════════
// Workspace topbar (product chrome)
// ════════════════════════════════════════════════════════════════════

export function WorkspaceTopbar() {
  const { state, setPage, openDrawer } = useProto();
  const tenant = TENANT;
  const canCreate = meetsRole(state.role, "editor");

  return (
    <header
      data-tulala-app-topbar
      style={{
        background: "#fff",
        borderBottom: `1px solid ${COLORS.borderSoft}`,
        padding: "0 28px",
        position: "sticky",
        top: 50,
        zIndex: Z.topbar,
      }}
    >
      <div
        data-tulala-app-topbar-row
        style={{
          display: "flex",
          alignItems: "center",
          gap: 16,
          height: 56,
        }}
      >
        {/* Tenant identity — clicking the chip opens summary; clicking the name goes home */}
        <div data-tulala-tenant-chip style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
          <button
            onClick={() => setPage("overview")}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 10,
              background: "transparent",
              border: "none",
              cursor: "pointer",
              padding: 0,
              fontFamily: FONTS.body,
            }}
          >
            <span
              style={{
                width: 28,
                height: 28,
                borderRadius: 7,
                background: COLORS.ink,
                color: "#fff",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                fontFamily: FONTS.display,
                fontSize: 14,
                fontWeight: 600,
                letterSpacing: 0.2,
              }}
            >
              {tenant.initials}
            </span>
            <span
              style={{
                fontFamily: FONTS.display,
                fontSize: 16,
                fontWeight: 500,
                letterSpacing: -0.1,
                color: COLORS.ink,
              }}
            >
              {tenant.name}
            </span>
          </button>
          <button
            data-tulala-tenant-meta
            onClick={() => openDrawer("tenant-switcher")}
            aria-label="Switch workspace"
            title="Switch workspace"
            style={{
              background: "transparent",
              border: "none",
              padding: 0,
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <PlanChip plan={state.plan} variant="outline" />
            <EntityChip entityType={state.entityType} variant="outline" />
            <Icon name="chevron-down" size={11} color={COLORS.inkDim} />
          </button>
        </div>

        <div data-tulala-topbar-divider style={{ width: 1, height: 22, background: COLORS.borderSoft, margin: "0 8px" }} />

        {/* Nav */}
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
                {active && (
                  <span
                    style={{
                      position: "absolute",
                      bottom: -16,
                      left: 12,
                      right: 12,
                      height: 2,
                      background: COLORS.ink,
                      borderRadius: 2,
                    }}
                  />
                )}
              </button>
            );
          })}
        </nav>

        {/* Right side */}
        <div data-tulala-app-topbar-right style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {canCreate && <QuickCreateMenu />}

          {/* Bell */}
          <button
            onClick={() => openDrawer("notifications")}
            aria-label="Notifications"
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
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = COLORS.border;
              e.currentTarget.style.color = COLORS.ink;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = COLORS.borderSoft;
              e.currentTarget.style.color = COLORS.inkMuted;
            }}
          >
            <BellIcon />
            <span
              style={{
                position: "absolute",
                top: 7,
                right: 8,
                width: 7,
                height: 7,
                borderRadius: "50%",
                background: COLORS.amber,
                boxShadow: "0 0 0 2px #fff",
              }}
            />
          </button>

          <RoleChip role={state.role} />
          {state.alsoTalent && (
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 5,
                fontFamily: FONTS.body,
                fontSize: 11,
                color: COLORS.inkMuted,
                background: "rgba(11,11,13,0.04)",
                padding: "3px 8px",
                borderRadius: 999,
              }}
            >
              <Icon name="user" size={11} stroke={1.7} />
              On roster
            </span>
          )}
          <button
            onClick={() => openDrawer("my-profile")}
            style={{
              background: "transparent",
              border: "none",
              padding: 0,
              cursor: "pointer",
            }}
            aria-label="My profile"
          >
            <Avatar initials="OT" size={30} tone="ink" />
          </button>
        </div>
      </div>
    </header>
  );
}

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
              Press G then a key from anywhere — fake shortcut hint
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════
// Workspace shell + page router
// ════════════════════════════════════════════════════════════════════

export function WorkspaceShell() {
  const { state } = useProto();
  return (
    <div style={{ background: COLORS.surface, minHeight: "calc(100vh - 56px - 50px)" }}>
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
  );
}

function PageRouter({ page }: { page: WorkspacePage }) {
  switch (page) {
    case "overview":
      return <OverviewPage />;
    case "inbox":
      return <UnifiedInboxPage />;
    case "calendar":
      return <CalendarPage />;
    case "work":
      return <WorkPage />;
    case "talent":
      return <TalentPage />;
    case "clients":
      return <ClientsPage />;
    case "site":
      return <SitePage />;
    case "billing":
      return <BillingPage />;
    case "workspace":
      return <WorkspacePageView />;
  }
}

// ════════════════════════════════════════════════════════════════════
// Page header shared
// ════════════════════════════════════════════════════════════════════

function PageHeader({
  eyebrow,
  title,
  subtitle,
  actions,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
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

function OverviewPage() {
  const { state, openDrawer, openUpgrade, completeTask, toast } = useProto();
  const isFree = state.plan === "free";
  const canEdit = meetsRole(state.role, "editor");

  if (isFree) {
    return <OverviewFree />;
  }

  const inquiries = getInquiries(state.plan);
  const draftCount = inquiries.filter((i) => i.stage === "draft" || i.stage === "hold").length;
  const awaiting = inquiries.filter((i) => i.stage === "awaiting-client");
  const confirmedThisWeek = inquiries.filter((i) => i.stage === "confirmed");

  return (
    <>
      <PageHeader
        eyebrow={`Good morning, Oran · ${TENANT.name}`}
        title="Today"
        subtitle="What needs your attention today."
        actions={
          canEdit && (
            <PrimaryButton onClick={() => openDrawer("new-inquiry")}>
              New inquiry
            </PrimaryButton>
          )
        }
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
          value={inquiries.filter((i) => i.stage !== "archived").length}
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
          value="284"
          caption="last 7 days · +18%"
          tone="dim"
          onClick={() => openDrawer("storefront-visibility")}
        />
      </Grid>

      <div style={{ height: 24 }} />

      {/* Primary row */}
      <Grid cols="2">
        <PrimaryCard
          title="What needs you today"
          description={`${pluralize(awaiting.length, "inquiry", "inquiries")} ${awaiting.length === 1 ? "is" : "are"} waiting on the client and ${pluralize(draftCount, "draft", "drafts")} ${draftCount === 1 ? "hasn't" : "haven't"} been sent.`}
          icon={<Icon name="bolt" size={14} stroke={1.7} />}
          affordance="See what needs you"
          meta={<>{pluralize(awaiting.length + draftCount, "item", "items", true)}</>}
          onClick={() => openDrawer("today-pulse")}
        />
        <PrimaryCard
          title="Workflow"
          description="Every inquiry, grouped by where it's stuck. See who's waiting on whom from first request to confirmed booking."
          icon={<Icon name="bolt" size={14} stroke={1.7} />}
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
  const [filter, setFilter] = useState<"needs-me" | "all" | "mentions">("needs-me");

  const isOpen = (s: typeof inquiries[number]["stage"]) =>
    s !== "rejected" && s !== "expired";
  const rows = inquiries
    .filter((i) => isOpen(i.stage))
    .filter((i) => {
      if (filter === "needs-me") return i.nextActionBy === "coordinator";
      if (filter === "mentions") return i.unreadGroup > 0;
      return true;
    })
    .sort((a, b) => a.lastActivityHrs - b.lastActivityHrs);

  // Saved-views payload — capture the active filter; restore on click.
  type InboxView = { filter: typeof filter };
  const onApplyView = (v: InboxView) => setFilter(v.filter);

  return (
    <>
      <PageHeader
        eyebrow="Inbox"
        title="Unified inbox"
        subtitle="Inquiry threads, mentions, and notifications in one place — sorted by what needs you next."
      />
      <SavedViewsBar viewKey="inbox" current={{ filter }} onApply={onApplyView} />
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
            { id: "mentions", label: `Mentions · ${inquiries.filter((i) => i.unreadGroup > 0).length}` },
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
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon="mail"
          title="Inbox zero"
          body="Nothing waiting on you in this filter. Switch to All to see everything moving."
          primaryLabel="Show all threads"
          onPrimary={() => setFilter("all")}
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
          {rows.map((inq, idx) => (
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
              onClick={() => openDrawer("inquiry-workspace", { inquiryId: inq.id })}
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: 12,
                width: "100%",
                padding: "14px 16px",
                background: "#fff",
                border: "none",
                borderTop: idx === 0 ? "none" : `1px solid ${COLORS.borderSoft}`,
                cursor: "pointer",
                textAlign: "left",
                fontFamily: FONTS.body,
              }}
            >
              <Avatar initials={inq.clientName.slice(0, 2).toUpperCase()} size={32} tone="auto" />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: COLORS.ink }}>
                    {inq.clientName}
                  </span>
                  <ClientTrustChip level={inq.clientTrust} compact />
                  {inq.unreadGroup > 0 && (
                    <span
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
                  }}
                >
                  <span>
                    {INQUIRY_STAGE_META[inq.stage].label}
                  </span>
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
                      <span>Waiting on {inq.nextActionBy}</span>
                    </>
                  )}
                </div>
              </div>
              <Icon name="chevron-right" size={14} color={COLORS.inkDim} />
            </button>
            </SwipeableRow>
          ))}
        </div>
      )}
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
function CalendarPage() {
  const { openDrawer } = useProto();
  const inquiries = RICH_INQUIRIES;
  // Build a map of "YYYY-MM-DD" → events for the current month. Use
  // today's month as the focus; navigation buttons are non-functional
  // shells in the prototype.
  const today = new Date();
  const year = today.getFullYear();
  const month = today.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstWeekday = new Date(year, month, 1).getDay(); // 0 = Sun

  // Synthesize a few "events" by hashing inquiry ids onto days.
  const events: Record<number, { title: string; tone: "ink" | "green" | "amber" | "red" }[]> = {};
  inquiries.slice(0, 8).forEach((inq, i) => {
    const day = ((i * 5) % daysInMonth) + 1;
    const tone = inq.stage === "booked" || inq.stage === "approved" ? "green" : inq.stage === "draft" ? "amber" : "ink";
    events[day] = events[day] ?? [];
    events[day].push({ title: `${inq.clientName} — ${inq.brief.slice(0, 18)}…`, tone });
  });

  const monthLabel = today.toLocaleString("en-US", { month: "long", year: "numeric" });

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
          <div style={{ fontSize: 14, fontWeight: 600, color: COLORS.ink }}>{monthLabel}</div>
          <div style={{ display: "flex", gap: 4 }}>
            <CalendarNavBtn label="←" />
            <CalendarNavBtn label="Today" />
            <CalendarNavBtn label="→" />
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
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(7, 1fr)",
            gridAutoRows: "minmax(96px, auto)",
          }}
        >
          {Array.from({ length: firstWeekday }).map((_, i) => (
            <div key={`pad-${i}`} style={{ background: "rgba(11,11,13,0.015)" }} />
          ))}
          {Array.from({ length: daysInMonth }).map((_, i) => {
            const day = i + 1;
            const dayEvents = events[day] ?? [];
            const isToday = day === today.getDate();
            return (
              <div
                key={day}
                style={{
                  padding: "8px 10px",
                  borderTop: `1px solid ${COLORS.borderSoft}`,
                  borderLeft: i % 7 === 0 ? "none" : `1px solid ${COLORS.borderSoft}`,
                  display: "flex",
                  flexDirection: "column",
                  gap: 4,
                }}
              >
                <div
                  style={{
                    fontSize: 12,
                    fontWeight: isToday ? 700 : 500,
                    color: isToday ? COLORS.accent : COLORS.ink,
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {day}
                </div>
                {dayEvents.slice(0, 2).map((e, idx) => (
                  <span
                    key={idx}
                    style={{
                      fontSize: 10.5,
                      color: e.tone === "green" ? COLORS.green : e.tone === "amber" ? COLORS.amber : e.tone === "red" ? COLORS.red : COLORS.ink,
                      background:
                        e.tone === "green"
                          ? "rgba(46,125,91,0.08)"
                          : e.tone === "amber"
                            ? "rgba(82,96,109,0.08)"
                            : "rgba(11,11,13,0.04)",
                      padding: "2px 6px",
                      borderRadius: 5,
                      fontWeight: 500,
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {e.title}
                  </span>
                ))}
                {dayEvents.length > 2 && (
                  <span style={{ fontSize: 10, color: COLORS.inkDim }}>
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

function CalendarNavBtn({ label }: { label: string }) {
  return (
    <button
      type="button"
      style={{
        padding: "5px 10px",
        background: "transparent",
        border: `1px solid ${COLORS.borderSoft}`,
        borderRadius: 6,
        cursor: "pointer",
        fontFamily: FONTS.body,
        fontSize: 12,
        color: COLORS.inkMuted,
      }}
    >
      {label}
    </button>
  );
}

// ════════════════════════════════════════════════════════════════════
// WORK
// ════════════════════════════════════════════════════════════════════

function WorkPage() {
  const { state, openDrawer, openUpgrade } = useProto();
  const inquiries = getInquiries(state.plan);
  const canEdit = meetsRole(state.role, "coordinator");
  const isFree = state.plan === "free";

  /**
   * Pipeline list source filter. Mirrors RichInquiry.source.kind — "all"
   * passes through, anything else narrows to that origin kind.
   */
  type SourceKind = "all" | "direct" | "hub" | "manual" | "marketplace";
  const [sourceFilter, setSourceFilter] = useState<SourceKind>("all");
  /**
   * Pulls a RichInquiry that matches the legacy Inquiry row, so we can
   * surface its source chip. Falls back to client-name match if the brief
   * differs (legacy data sometimes does).
   */
  const matchRich = (iq: { client: string; brief: string }) =>
    RICH_INQUIRIES.find(
      (r) => r.clientName === iq.client && r.brief === iq.brief,
    ) ?? RICH_INQUIRIES.find((r) => r.clientName === iq.client);
  const filteredInquiries =
    sourceFilter === "all"
      ? inquiries
      : inquiries.filter((iq) => matchRich(iq)?.source.kind === sourceFilter);

  const drafts = inquiries.filter((i) => i.stage === "draft" || i.stage === "hold");
  const awaiting = inquiries.filter((i) => i.stage === "awaiting-client");
  const confirmed = inquiries.filter((i) => i.stage === "confirmed");

  return (
    <>
      <PageHeader
        eyebrow="Pipeline"
        title="Inquiries → confirmed bookings"
        subtitle="Every conversation that could become a booking. Coordinators move work forward; admins track the whole flow."
        actions={
          <>
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
          tone="dim"
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
          <div style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
            <SourceFilterChips value={sourceFilter} onChange={setSourceFilter} />
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
              title="No inquiries from this source yet"
              body="When a brief comes in via this channel, it'll show up here. You can also log one manually."
              primaryLabel="New inquiry"
              onPrimary={() => openDrawer("new-inquiry")}
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
                      color: near ? "#3A4651" : COLORS.inkMuted,
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
                        background: near ? "#52606D" : COLORS.ink,
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
  const { state, openDrawer, openUpgrade } = useProto();
  const roster = getRoster(state.plan);
  const canEdit = meetsRole(state.role, "editor");
  const isFree = state.plan === "free";

  const counts = {
    published: roster.filter((r) => r.state === "published").length,
    draft: roster.filter((r) => r.state === "draft").length,
    invited: roster.filter((r) => r.state === "invited").length,
    awaiting: roster.filter((r) => r.state === "awaiting-approval").length,
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
            {!canEdit && <ReadOnlyChip />}
            {canEdit && (
              <PrimaryButton onClick={() => openDrawer("new-talent")}>
                {state.entityType === "hub" ? "Invite member" : "Add talent"}
              </PrimaryButton>
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
          <div style={{ display: "flex", gap: 6 }}>
            <GhostButton onClick={() => openDrawer("filter-config")}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                <Icon name="filter" size={12} stroke={1.7} />
                Filter
              </span>
            </GhostButton>
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
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
            gap: 12,
          }}
        >
          {roster.map((profile) => (
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
                  fontSize: 56,
                  position: "relative",
                }}
              >
                {profile.thumb}
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
    </>
  );
}

// ════════════════════════════════════════════════════════════════════
// CLIENTS
// ════════════════════════════════════════════════════════════════════

function ClientsPage() {
  const { state, openDrawer, openUpgrade } = useProto();
  const clients = getClients(state.plan);
  const canEdit = meetsRole(state.role, "coordinator");
  const isFree = state.plan === "free";

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
          canEdit ? (
            <PrimaryButton onClick={() => openDrawer("client-profile", { id: "new" })}>
              Add client
            </PrimaryButton>
          ) : (
            <ReadOnlyChip />
          )
        }
      />

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
          <span>Client</span>
          <span>Bookings</span>
          <span>Status</span>
          <span>Trust</span>
          <span />
        </div>
        {clients.map((client, idx) => (
          <button
            key={client.id}
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
              <Avatar initials={client.name.split(" ").map(w=>w[0]).join("").slice(0,2).toUpperCase()} size={32} tone="warm" />
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
        eyebrow="Public site"
        title="Your public site"
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
          description="Logo · Cormorant / Inter · #B8860B."
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
          description="4 published · 1 draft"
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
          <a
            href="#contact"
            onClick={(e) => {
              e.preventDefault();
              openUpgrade({
                feature: "Network plan",
                why: "Run multiple agency identities under one roof. Move roster across brands without losing history.",
                requiredPlan: "network",
              });
            }}
            style={{
              fontFamily: FONTS.body,
              fontSize: 12,
              color: COLORS.inkMuted,
              textDecoration: "none",
              display: "inline-flex",
              alignItems: "center",
              gap: 5,
            }}
          >
            Contact <Icon name="arrow-right" size={11} />
          </a>
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
        subtitle="Where money flows in this workspace — platform fee, payout receiver, recent activity."
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
            onClick={() => {
              /* anchored below */
            }}
          />
          <SecondaryCard
            title="Pending payouts"
            description={payout.pendingPayouts}
            affordance="See activity"
            onClick={() => {
              /* anchored below */
            }}
          />
          <SecondaryCard
            title="Card acceptance"
            description={payout.acceptCards ? "Visa · Mastercard · Amex enabled" : "Not enabled"}
            affordance="Configure"
            onClick={() => openDrawer("payments-setup")}
          />
        </Grid>
      )}

      <Divider label="Recent activity" />

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
      {WORKSPACE_PAYMENTS.map((row) => (
        <button
          key={row.id}
          type="button"
          onClick={() => openDrawer("payment-detail", { id: row.id })}
          style={{
            display: "grid",
            gridTemplateColumns: "1.4fr 1.6fr 1fr 1fr 1.2fr 1fr 0.6fr",
            alignItems: "center",
            gap: 0,
            padding: "12px 16px",
            background: "transparent",
            border: "none",
            borderTop: `1px solid ${COLORS.borderSoft}`,
            width: "100%",
            textAlign: "left",
            cursor: "pointer",
            fontFamily: FONTS.body,
            fontSize: 13,
            color: COLORS.ink,
          }}
        >
          <span style={{ fontWeight: 600 }}>{row.ref}</span>
          <span>
            <div style={{ color: COLORS.ink }}>{row.client}</div>
            <div style={{ fontSize: 11.5, color: COLORS.inkMuted }}>{row.brief}</div>
          </span>
          <span style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{row.total}</span>
          <span style={{ textAlign: "right", fontVariantNumeric: "tabular-nums", color: COLORS.inkMuted }}>
            {row.netPayout}
            <div style={{ fontSize: 11, color: COLORS.inkDim }}>fee {row.fee}</div>
          </span>
          <span style={{ color: COLORS.inkMuted }}>{row.receiverName}</span>
          <span>
            <PaymentStatusChip status={row.status} />
          </span>
          <span style={{ textAlign: "right", color: COLORS.inkMuted, fontSize: 12 }}>{row.date}</span>
        </button>
      ))}
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

  return (
    <>
      <PageHeader
        eyebrow="Settings"
        title="Workspace settings"
        subtitle="Plan, team, branding, identity — the controls that shape who you are inside Tulala."
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
        return <WorkspaceShell />;
      case "talent":
        return <TalentSurface />;
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
      return TALENT_PAGES.map((p) => ({
        id: p,
        label: TALENT_PAGE_META[p].label,
        active: state.talentPage === p,
        run: () => setTalentPage(p as TalentPage),
        icon: TALENT_TAB_ICON[p as TalentPage] ?? "info",
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
}: {
  id: string;
  label: string;
  icon: "info" | "sparkle" | "plus" | "search" | "mail" | "calendar" | "user" | "team" | "bolt" | "credit" | "x" | "chevron-right" | "chevron-down";
  active: boolean;
  run: () => void;
}) {
  return (
    <button
      type="button"
      onClick={run}
      style={{
        flex: 1,
        background: "transparent",
        border: "none",
        cursor: "pointer",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 3,
        padding: "6px 4px",
        color: active ? COLORS.accentDeep : COLORS.inkMuted,
        fontFamily: FONTS.body,
        fontSize: 10.5,
        fontWeight: 500,
      }}
    >
      <Icon name={icon} size={18} stroke={active ? 2 : 1.7} color={active ? COLORS.accent : COLORS.inkMuted} />
      <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 70 }}>
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
  profile: "user",
  inbox: "mail",
  calendar: "calendar",
  activity: "sparkle",
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
