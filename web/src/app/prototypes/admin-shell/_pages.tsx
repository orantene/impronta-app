"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  CLIENT_PAGES,
  CLIENT_PAGE_META,
  COLORS,
  FONTS,
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
  useProto,
  ACTIVATION_TASKS,
  SITE_PAGES,
  type ClientPage,
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
  CapsLabel,
  CompactLockedCard,
  Divider,
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
  PlanChip,
} from "./_primitives";
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
    setAlsoTalent,
    setPage,
    setTalentPage,
    setClientPage,
    setPlatformPage,
  } = useProto();

  return (
    <div
      style={{
        background: "#0F0F11",
        color: "#fff",
        borderBottom: "1px solid rgba(255,255,255,0.08)",
        padding: "10px 18px",
        display: "flex",
        alignItems: "center",
        gap: 18,
        flexWrap: "wrap",
        position: "sticky",
        top: 0,
        zIndex: 50,
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
    </div>
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
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <span
        style={{
          fontSize: 10.5,
          color: "rgba(255,255,255,0.52)",
          letterSpacing: 1,
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
          borderRadius: 7,
          padding: 2,
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
                padding: "5px 10px",
                fontSize: 11.5,
                fontWeight: 500,
                letterSpacing: 0.1,
                fontFamily: FONTS.body,
                cursor: "pointer",
                borderRadius: 5,
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
        gap: 7,
        background: on ? "rgba(255,255,255,0.94)" : "rgba(255,255,255,0.06)",
        color: on ? "#0F0F11" : "rgba(255,255,255,0.78)",
        border: "none",
        padding: "5px 10px",
        fontSize: 11.5,
        fontWeight: 500,
        fontFamily: FONTS.body,
        cursor: "pointer",
        borderRadius: 7,
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
      style={{
        background: "#fff",
        borderBottom: `1px solid ${COLORS.borderSoft}`,
        padding: "0 28px",
        position: "sticky",
        top: 50,
        zIndex: 40,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 16,
          height: 56,
        }}
      >
        {/* Tenant identity — clicking the chip opens summary; clicking the name goes home */}
        <div style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
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
            onClick={() => openDrawer("tenant-summary")}
            aria-label="Workspace summary"
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
            <Icon name="chevron-down" size={11} color={COLORS.inkDim} />
          </button>
        </div>

        <div style={{ width: 1, height: 22, background: COLORS.borderSoft, margin: "0 8px" }} />

        {/* Nav */}
        <nav style={{ display: "flex", alignItems: "center", gap: 2, flex: 1, overflow: "auto" }}>
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
                {PAGE_META[p].label}
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
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
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
    case "work":
      return <WorkPage />;
    case "talent":
      return <TalentPage />;
    case "clients":
      return <ClientsPage />;
    case "site":
      return <SitePage />;
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
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 16,
        marginBottom: 24,
      }}
    >
      <div style={{ flex: 1 }}>
        {eyebrow && (
          <div style={{ marginBottom: 6 }}>
            <CapsLabel>{eyebrow}</CapsLabel>
          </div>
        )}
        <h1
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
      {actions && <div style={{ display: "flex", gap: 8, alignItems: "center" }}>{actions}</div>}
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
        eyebrow={`Good morning, Oran`}
        title={`Today across ${TENANT.name}`}
        subtitle="A live snapshot of what needs attention right now — the people, work and signals moving through your agency."
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
          label="Today's pulse"
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
          label="Storefront visits"
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
          description={`${awaiting.length} inquiries are waiting on the client and ${draftCount} drafts haven't been sent.`}
          icon={<Icon name="bolt" size={14} stroke={1.7} />}
          affordance="Open today's pulse"
          meta={<><StatDot tone="amber" /> {awaiting.length + draftCount} items</>}
          onClick={() => openDrawer("today-pulse")}
        />
        <PrimaryCard
          title="Inquiries pipeline"
          description="From first request to confirmed booking. See where each conversation is and who is waiting on whom."
          icon={<Icon name="bolt" size={14} stroke={1.7} />}
          affordance="Open pipeline"
          meta={
            <>
              <StatDot tone="ink" /> {inquiries.length} active
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
          title="Drafts & holds"
          description="Inquiries you started but haven't sent."
          meta={`${draftCount} items`}
          affordance="Review"
          onClick={() => openDrawer("drafts-holds")}
        />
        <SecondaryCard
          title="Awaiting client"
          description="Offers sent — waiting on confirmation."
          meta={`${awaiting.length} items`}
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
  const completedCount = state.completedTasks.size;
  const totalTasks = ACTIVATION_TASKS.length;

  return (
    <>
      <PageHeader
        eyebrow={`Welcome to Tulala`}
        title="Let's get you live."
        subtitle="You're on the Free plan — your agency joins our open ecosystem. Five short steps and your roster is searchable to anyone in our network."
        actions={
          <span
            style={{
              fontFamily: FONTS.body,
              fontSize: 12,
              color: COLORS.inkMuted,
            }}
          >
            {completedCount} of {totalTasks} steps complete
          </span>
        }
      />

      <StarterCard
        title="Set up your agency"
        subtitle="A short guided path to a published storefront. Most agencies finish this in under 10 minutes."
      >
        <ol style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 10 }}>
          {ACTIVATION_TASKS.map((task, idx) => {
            const done = state.completedTasks.has(task.id);
            return (
              <li key={task.id}>
                <button
                  onClick={() => {
                    if (task.drawer) {
                      openDrawer(task.drawer, { fromTask: task.id });
                    } else {
                      completeTask(task.id);
                      toast(`Marked “${task.label}” as done`);
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
                  <span
                    style={{
                      flex: 1,
                      fontSize: 13.5,
                      color: COLORS.ink,
                      fontWeight: 500,
                      textDecoration: done ? "line-through" : "none",
                      opacity: done ? 0.55 : 1,
                    }}
                  >
                    {task.label}
                  </span>
                  <Affordance label={done ? "Done" : "Open"} />
                </button>
              </li>
            );
          })}
        </ol>
      </StarterCard>

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
// WORK
// ════════════════════════════════════════════════════════════════════

function WorkPage() {
  const { state, openDrawer, openUpgrade } = useProto();
  const inquiries = getInquiries(state.plan);
  const canEdit = meetsRole(state.role, "coordinator");
  const isFree = state.plan === "free";

  const drafts = inquiries.filter((i) => i.stage === "draft" || i.stage === "hold");
  const awaiting = inquiries.filter((i) => i.stage === "awaiting-client");
  const confirmed = inquiries.filter((i) => i.stage === "confirmed");

  return (
    <>
      <PageHeader
        eyebrow="Work"
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
          <GhostButton onClick={() => openDrawer("filter-config")}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
              <Icon name="filter" size={12} stroke={1.7} />
              Filter
            </span>
          </GhostButton>
        </div>
        <div
          style={{
            background: "#fff",
            borderRadius: 12,
            border: `1px solid ${COLORS.borderSoft}`,
            overflow: "hidden",
          }}
        >
          {inquiries.map((iq, idx) => (
            <button
              key={iq.id}
              onClick={() => {
                // Prefer messaging-first workspace; fall back to legacy peek
                const rich =
                  RICH_INQUIRIES.find(
                    (r) => r.clientName === iq.client && r.brief === iq.brief,
                  ) ?? RICH_INQUIRIES.find((r) => r.clientName === iq.client);
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
                <div style={{ fontSize: 13.5, fontWeight: 600, color: COLORS.ink, letterSpacing: -0.05 }}>
                  {iq.client}
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
          ))}
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

function StageBadge({ stage }: { stage: string }) {
  const map: Record<string, { label: string; tone: "ink" | "amber" | "green" | "dim" | "red" }> = {
    draft: { label: "Draft", tone: "dim" },
    hold: { label: "On hold", tone: "amber" },
    "awaiting-client": { label: "Awaiting client", tone: "amber" },
    confirmed: { label: "Confirmed", tone: "green" },
    archived: { label: "Archived", tone: "dim" },
  };
  const m = map[stage] ?? { label: stage, tone: "dim" as const };
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "3px 8px",
        borderRadius: 999,
        fontSize: 11,
        fontFamily: FONTS.body,
        fontWeight: 500,
        background:
          m.tone === "green"
            ? "rgba(46,125,91,0.10)"
            : m.tone === "amber"
              ? "rgba(198,138,30,0.10)"
              : "rgba(11,11,13,0.05)",
        color:
          m.tone === "green"
            ? "#1F5C42"
            : m.tone === "amber"
              ? "#7E5612"
              : COLORS.inkMuted,
        whiteSpace: "nowrap",
      }}
    >
      <StatDot tone={m.tone} size={5} />
      {m.label}
    </span>
  );
}

// ════════════════════════════════════════════════════════════════════
// TALENT
// ════════════════════════════════════════════════════════════════════

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

  return (
    <>
      <PageHeader
        eyebrow="Talent"
        title="Roster"
        subtitle="Profiles you represent. Each one moves through draft → invited → published → claimed."
        actions={
          <>
            {!canEdit && <ReadOnlyChip />}
            {canEdit && (
              <PrimaryButton onClick={() => openDrawer("new-talent")}>
                Add talent
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
                  background: COLORS.cream,
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
            <div style={{ fontSize: 12, color: COLORS.inkMuted }}>
              {client.bookingsYTD > 3 ? "Frequent" : client.bookingsYTD > 0 ? "Active" : "Dormant"}
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

function StatusBadge({
  tone,
  label,
}: {
  tone: "ink" | "amber" | "green" | "dim";
  label: string;
}) {
  const c =
    tone === "green"
      ? { bg: "rgba(46,125,91,0.10)", fg: "#1F5C42" }
      : tone === "amber"
        ? { bg: "rgba(198,138,30,0.10)", fg: "#7E5612" }
        : { bg: "rgba(11,11,13,0.05)", fg: COLORS.inkMuted };
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        background: c.bg,
        color: c.fg,
        padding: "3px 8px",
        borderRadius: 999,
        fontFamily: FONTS.body,
        fontSize: 11,
        fontWeight: 500,
        textTransform: "capitalize",
      }}
    >
      <StatDot tone={tone} size={5} />
      {label}
    </span>
  );
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
        eyebrow="Site"
        title="Your public storefront"
        subtitle="Roster, site, and embeds — in one place."
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
          title="Roster"
          description="Talents · drafts · approvals."
          icon={<Icon name="team" size={14} stroke={1.7} />}
          affordance="Open roster"
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
        background: COLORS.cream,
        border: `1px solid rgba(184,134,11,0.22)`,
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
          background: "rgba(184,134,11,0.16)",
          color: COLORS.goldDeep,
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
          <CapsLabel color={COLORS.goldDeep} style={{ letterSpacing: 1.6 }}>
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
    amber: { bg: "rgba(198,138,30,0.12)", fg: "#7E5612", dot: COLORS.amber },
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
        eyebrow="Workspace"
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
}
