"use client";

/**
 * Platform surface — Tulala HQ super-admin console.
 *
 * Pages:
 *   PlatformTodayPage    — pulse: incidents, support tickets, hub queue, signups
 *   PlatformTenantsPage  — every tenant agency with health/plan/MRR
 *   PlatformUsersPage    — every human user across tenants
 *   PlatformNetworkPage  — Tulala hub: featured talent submissions + moderation
 *   PlatformBillingPage  — invoices + dunning + plan overrides
 *   PlatformOperationsPage — feature flags + system jobs + incidents
 *   PlatformSettingsPage   — HQ team + audit + region config
 *
 * Plus the IMPERSONATION mechanic: HQ users can flip to viewing a tenant's
 * workspace as if they were that tenant. Banner overlays show the active
 * impersonation. Implemented via state.impersonating + startImpersonation().
 */

import { type ReactNode } from "react";
import {
  COLORS,
  FEATURE_FLAGS,
  FONTS,
  HQ_ROLES,
  HQ_ROLE_META,
  HUB_SUBMISSIONS,
  MODERATION_QUEUE,
  PLAN_META,
  PLATFORM_HQ_TEAM,
  PLATFORM_INCIDENTS,
  PLATFORM_INVOICES,
  PLATFORM_PAGES,
  PLATFORM_PAGE_META,
  PLATFORM_TENANTS,
  PLATFORM_USERS,
  SUPPORT_TICKETS,
  SYSTEM_JOBS,
  useProto,
  type FeatureFlag,
  type HubSubmission,
  type ModerationItem,
  type PlatformIncident,
  type PlatformInvoice,
  type PlatformPage,
  type PlatformTenant,
  type PlatformUser,
  type SupportTicket,
  type SystemJob,
} from "./_state";
import {
  Avatar,
  Bullet,
  CapsLabel,
  Divider,
  GhostButton,
  Icon,
  PrimaryButton,
  PrimaryCard,
  SecondaryButton,
  SecondaryCard,
  StatDot,
  StatusCard,
  DrawerShell,
} from "./_primitives";

// ════════════════════════════════════════════════════════════════════
// Surface entry — DARK by default. The dark theme reflects this is HQ
// operations console, not a tenant-facing surface.
// ════════════════════════════════════════════════════════════════════

const HQ = {
  bg: "#0F0F11",
  card: "#16161A",
  cardSoft: "rgba(255,255,255,0.04)",
  border: "rgba(255,255,255,0.10)",
  borderSoft: "rgba(255,255,255,0.06)",
  ink: "#F5F2EB",
  inkMuted: "rgba(245,242,235,0.62)",
  inkDim: "rgba(245,242,235,0.38)",
  amber: "#E8B559",
  green: "#5DD3A0",
  red: "#F36772",
};

export function PlatformSurface() {
  return (
    <div style={{ background: HQ.bg, color: HQ.ink, minHeight: "calc(100vh - 50px)" }}>
      <PlatformTopbar />
      <ImpersonationStrip />
      <main
        style={{
          padding: "28px 28px 60px",
          maxWidth: 1280,
          margin: "0 auto",
        }}
      >
        <PlatformRouter />
      </main>
    </div>
  );
}

// ─── Topbar (dark) ────────────────────────────────────────────────

function PlatformTopbar() {
  const { state, setPlatformPage, setHqRole } = useProto();
  const meta = HQ_ROLE_META[state.hqRole];
  return (
    <header
      style={{
        background: HQ.card,
        borderBottom: `1px solid ${HQ.border}`,
        padding: "0 28px",
        position: "sticky",
        top: 50,
        zIndex: 40,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 16, height: 56 }}>
        {/* Tulala HQ identity */}
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span
            style={{
              width: 28,
              height: 28,
              borderRadius: 8,
              background: COLORS.cream,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              fontFamily: FONTS.display,
              fontWeight: 600,
              color: COLORS.ink,
            }}
          >
            T
          </span>
          <span
            style={{
              fontFamily: FONTS.display,
              fontSize: 16,
              fontWeight: 500,
              letterSpacing: -0.1,
              color: HQ.ink,
            }}
          >
            Tulala HQ
          </span>
        </div>

        {/* HQ role lens */}
        <div
          style={{
            display: "inline-flex",
            background: HQ.cardSoft,
            borderRadius: 999,
            padding: 2,
            marginLeft: 4,
          }}
        >
          {HQ_ROLES.map((r) => {
            const active = state.hqRole === r;
            return (
              <button
                key={r}
                onClick={() => setHqRole(r)}
                style={{
                  background: active ? HQ.ink : "transparent",
                  color: active ? COLORS.ink : HQ.inkMuted,
                  border: "none",
                  fontFamily: FONTS.body,
                  fontSize: 11.5,
                  fontWeight: 600,
                  padding: "5px 11px",
                  borderRadius: 999,
                  cursor: "pointer",
                  letterSpacing: 0.3,
                }}
              >
                {HQ_ROLE_META[r].label}
              </button>
            );
          })}
        </div>

        <div style={{ width: 1, height: 22, background: HQ.borderSoft, margin: "0 8px" }} />

        {/* Page nav */}
        <nav style={{ display: "flex", alignItems: "center", gap: 2, flex: 1, overflow: "auto" }}>
          {PLATFORM_PAGES.map((p) => {
            const active = state.platformPage === p;
            return (
              <button
                key={p}
                onClick={() => setPlatformPage(p)}
                style={{
                  background: "transparent",
                  border: "none",
                  cursor: "pointer",
                  padding: "8px 12px",
                  fontFamily: FONTS.body,
                  fontSize: 13,
                  fontWeight: active ? 600 : 500,
                  color: active ? HQ.ink : HQ.inkMuted,
                  letterSpacing: 0.1,
                  borderRadius: 7,
                  position: "relative",
                  transition: "color .12s",
                }}
                onMouseEnter={(e) => {
                  if (!active) e.currentTarget.style.color = HQ.ink;
                }}
                onMouseLeave={(e) => {
                  if (!active) e.currentTarget.style.color = HQ.inkMuted;
                }}
              >
                {PLATFORM_PAGE_META[p].label}
                {active && (
                  <span
                    style={{
                      position: "absolute",
                      bottom: -16,
                      left: 12,
                      right: 12,
                      height: 2,
                      background: HQ.ink,
                      borderRadius: 2,
                    }}
                  />
                )}
              </button>
            );
          })}
        </nav>

        {/* Right */}
        <span style={{ fontFamily: FONTS.body, fontSize: 11.5, color: HQ.inkMuted }}>
          {meta.tagline}
        </span>
      </div>
    </header>
  );
}

// ─── Impersonation strip ──────────────────────────────────────────

function ImpersonationStrip() {
  const { state, stopImpersonation } = useProto();
  if (!state.impersonating) return null;
  return (
    <div
      style={{
        background: "#5C2932",
        color: "#fff",
        padding: "8px 28px",
        display: "flex",
        alignItems: "center",
        gap: 12,
        fontFamily: FONTS.body,
        fontSize: 12.5,
      }}
    >
      <Icon name="user" size={12} />
      <span>
        Impersonating <strong>{state.impersonating.tenantName}</strong> as{" "}
        <strong>{state.impersonating.asRole}</strong>
        {state.impersonating.readOnly && " · read-only"}
      </span>
      <span style={{ flex: 1 }} />
      <button
        onClick={stopImpersonation}
        style={{
          background: "#fff",
          color: "#5C2932",
          border: "none",
          borderRadius: 6,
          padding: "4px 10px",
          fontFamily: FONTS.body,
          fontSize: 11.5,
          fontWeight: 600,
          cursor: "pointer",
        }}
      >
        Stop
      </button>
    </div>
  );
}

// ─── Router ───────────────────────────────────────────────────────

function PlatformRouter() {
  const { state } = useProto();
  switch (state.platformPage) {
    case "today":
      return <PlatformTodayPage />;
    case "tenants":
      return <PlatformTenantsPage />;
    case "users":
      return <PlatformUsersPage />;
    case "network":
      return <PlatformNetworkPage />;
    case "billing":
      return <PlatformBillingPage />;
    case "operations":
      return <PlatformOperationsPage />;
    case "settings":
      return <PlatformSettingsPage />;
  }
}

// ─── Shared header ────────────────────────────────────────────────

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
    <div style={{ display: "flex", alignItems: "flex-start", gap: 16, marginBottom: 24 }}>
      <div style={{ flex: 1 }}>
        {eyebrow && (
          <div style={{ marginBottom: 6 }}>
            <span
              style={{
                fontFamily: FONTS.body,
                fontSize: 10.5,
                fontWeight: 600,
                letterSpacing: 1.4,
                textTransform: "uppercase",
                color: HQ.inkMuted,
              }}
            >
              {eyebrow}
            </span>
          </div>
        )}
        <h1
          style={{
            fontFamily: FONTS.display,
            fontSize: 30,
            fontWeight: 500,
            letterSpacing: -0.6,
            color: HQ.ink,
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
              color: HQ.inkMuted,
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

// ─── Dark-themed stat tile (replaces StatusCard which is light) ───

function HqStatCard({
  label,
  value,
  caption,
  tone = "ink",
  onClick,
}: {
  label: string;
  value: ReactNode;
  caption?: string;
  tone?: "ink" | "amber" | "green" | "red" | "dim";
  onClick?: () => void;
}) {
  const accent =
    tone === "amber" ? HQ.amber : tone === "green" ? HQ.green : tone === "red" ? HQ.red : tone === "dim" ? HQ.inkDim : HQ.ink;
  return (
    <button
      onClick={onClick}
      style={{
        background: HQ.card,
        border: `1px solid ${HQ.borderSoft}`,
        borderRadius: 12,
        padding: 16,
        textAlign: "left",
        cursor: onClick ? "pointer" : "default",
        fontFamily: FONTS.body,
        display: "flex",
        flexDirection: "column",
        gap: 6,
      }}
    >
      <span style={{ fontSize: 10.5, color: HQ.inkMuted, fontWeight: 600, letterSpacing: 1.2, textTransform: "uppercase" }}>
        {label}
      </span>
      <span
        style={{
          fontFamily: FONTS.display,
          fontSize: 30,
          fontWeight: 500,
          letterSpacing: -0.6,
          color: accent,
          lineHeight: 1,
        }}
      >
        {value}
      </span>
      {caption && (
        <span style={{ fontSize: 11.5, color: HQ.inkMuted }}>{caption}</span>
      )}
    </button>
  );
}

// ─── Dark cards used across pages ────────────────────────────────

function HqCard({
  title,
  subtitle,
  action,
  children,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section
      style={{
        background: HQ.card,
        border: `1px solid ${HQ.borderSoft}`,
        borderRadius: 12,
        padding: 16,
        fontFamily: FONTS.body,
      }}
    >
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 10 }}>
        <div>
          <span style={{ fontSize: 10.5, color: HQ.inkMuted, fontWeight: 600, letterSpacing: 1.2, textTransform: "uppercase" }}>
            {title}
          </span>
          {subtitle && (
            <p style={{ margin: "3px 0 0", fontSize: 12.5, color: HQ.inkMuted }}>{subtitle}</p>
          )}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function HqGrid({ children, cols = "auto" }: { children: ReactNode; cols?: "auto" | "2" | "3" | "4" }) {
  const colMap = {
    auto: "repeat(auto-fit, minmax(280px, 1fr))",
    "2": "repeat(2, 1fr)",
    "3": "repeat(3, 1fr)",
    "4": "repeat(4, 1fr)",
  };
  return <div style={{ display: "grid", gridTemplateColumns: colMap[cols], gap: 12 }}>{children}</div>;
}

// ════════════════════════════════════════════════════════════════════
// TODAY (HQ pulse)
// ════════════════════════════════════════════════════════════════════

function PlatformTodayPage() {
  const { setPlatformPage, openDrawer } = useProto();
  const openIncidents = PLATFORM_INCIDENTS.filter((i) => i.state !== "resolved");
  const newTickets = SUPPORT_TICKETS.filter((t) => t.state === "new");
  const pendingHub = HUB_SUBMISSIONS.filter((h) => h.status === "pending");
  const failedJobs = SYSTEM_JOBS.filter((j) => j.state === "failed");

  return (
    <>
      <PageHeader
        eyebrow="Tulala HQ"
        title="Today"
        subtitle="Platform health, incidents, and queues that need eyes today."
        actions={
          <SecondaryButton onClick={() => openDrawer("platform-today-pulse")}>
            All alerts
          </SecondaryButton>
        }
      />

      <HqGrid cols="4">
        <HqStatCard
          label="Open incidents"
          value={openIncidents.length}
          caption={openIncidents.length === 0 ? "all clear" : `${openIncidents.length} need triage`}
          tone={openIncidents.length === 0 ? "green" : "red"}
          onClick={() => setPlatformPage("operations")}
        />
        <HqStatCard
          label="New tickets"
          value={newTickets.length}
          caption="support queue"
          tone={newTickets.length === 0 ? "green" : "amber"}
        />
        <HqStatCard
          label="Hub submissions"
          value={pendingHub.length}
          caption="awaiting review"
          tone="amber"
          onClick={() => setPlatformPage("network")}
        />
        <HqStatCard
          label="Failed jobs"
          value={failedJobs.length}
          caption="last 24h"
          tone={failedJobs.length === 0 ? "green" : "red"}
          onClick={() => setPlatformPage("operations")}
        />
      </HqGrid>

      <div style={{ height: 24 }} />

      <HqGrid cols="2">
        <HqCard
          title="Incidents"
          action={
            <button
              onClick={() => setPlatformPage("operations")}
              style={{ background: "transparent", border: "none", color: HQ.amber, fontFamily: FONTS.body, fontSize: 11.5, fontWeight: 600, cursor: "pointer" }}
            >
              Open ops →
            </button>
          }
        >
          {openIncidents.length === 0 ? (
            <div style={{ color: HQ.inkMuted, fontSize: 13, padding: "10px 0" }}>No active incidents.</div>
          ) : (
            openIncidents.map((i) => <IncidentRow key={i.id} incident={i} />)
          )}
        </HqCard>
        <HqCard title="Support tickets — new">
          {newTickets.map((t) => <SupportTicketRow key={t.id} ticket={t} />)}
        </HqCard>
      </HqGrid>

      <div style={{ height: 12 }} />

      <HqGrid cols="2">
        <HqCard title="Recent signups">
          {PLATFORM_TENANTS.slice(0, 3).map((t) => (
            <TenantMiniRow key={t.id} tenant={t} />
          ))}
        </HqCard>
        <HqCard title="Hub submissions">
          {pendingHub.slice(0, 3).map((h) => (
            <HubSubmissionRow key={h.id} sub={h} />
          ))}
        </HqCard>
      </HqGrid>
    </>
  );
}

// ════════════════════════════════════════════════════════════════════
// TENANTS
// ════════════════════════════════════════════════════════════════════

function PlatformTenantsPage() {
  return (
    <>
      <PageHeader
        eyebrow="Tenants"
        title="Every agency on Tulala"
        subtitle="Health, plan, MRR, and quick-jump impersonation. Sortable / filterable list."
      />

      <HqCard title="Active tenants" subtitle={`${PLATFORM_TENANTS.length} total`}>
        <table
          style={{
            width: "100%",
            borderCollapse: "collapse",
            fontFamily: FONTS.body,
            fontSize: 13,
            color: HQ.ink,
          }}
        >
          <thead>
            <tr style={{ borderBottom: `1px solid ${HQ.borderSoft}` }}>
              {["Tenant", "Plan", "Seats", "Talent", "MRR", "Health", "Last active", ""].map((h) => (
                <th
                  key={h}
                  style={{
                    textAlign: h === "Seats" || h === "Talent" || h === "MRR" ? "right" : "left",
                    padding: "10px 8px",
                    fontSize: 10.5,
                    fontWeight: 600,
                    color: HQ.inkMuted,
                    letterSpacing: 0.5,
                    textTransform: "uppercase",
                  }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {PLATFORM_TENANTS.map((t) => <TenantRow key={t.id} tenant={t} />)}
          </tbody>
        </table>
      </HqCard>
    </>
  );
}

function TenantRow({ tenant }: { tenant: PlatformTenant }) {
  const { openDrawer } = useProto();
  const healthMeta: Record<PlatformTenant["health"], { tone: "green" | "amber" | "red"; label: string }> = {
    healthy: { tone: "green", label: "Healthy" },
    "at-risk": { tone: "amber", label: "At risk" },
    churning: { tone: "red", label: "Churning" },
  };
  const h = healthMeta[tenant.health];
  return (
    <tr
      style={{ borderBottom: `1px solid ${HQ.borderSoft}`, cursor: "pointer" }}
      onClick={() => openDrawer("platform-tenant-detail", { id: tenant.id })}
    >
      <td style={{ padding: "12px 8px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontWeight: 500, color: HQ.ink }}>{tenant.name}</span>
          <span style={{ color: HQ.inkDim, fontFamily: FONTS.mono, fontSize: 11 }}>{tenant.slug}</span>
        </div>
      </td>
      <td style={{ padding: "12px 8px" }}>
        <span
          style={{
            padding: "2px 8px",
            background: HQ.cardSoft,
            color: HQ.ink,
            fontSize: 10.5,
            fontWeight: 600,
            letterSpacing: 0.4,
            textTransform: "uppercase",
            borderRadius: 999,
          }}
        >
          {PLAN_META[tenant.plan].label}
        </span>
      </td>
      <td style={{ padding: "12px 8px", textAlign: "right", color: HQ.inkMuted }}>{tenant.seats}</td>
      <td style={{ padding: "12px 8px", textAlign: "right", color: HQ.inkMuted }}>{tenant.talentCount}</td>
      <td style={{ padding: "12px 8px", textAlign: "right", fontWeight: 500 }}>{tenant.mrr}</td>
      <td style={{ padding: "12px 8px" }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          <span
            style={{
              width: 7,
              height: 7,
              borderRadius: "50%",
              background: h.tone === "green" ? HQ.green : h.tone === "amber" ? HQ.amber : HQ.red,
            }}
          />
          {h.label}
        </span>
      </td>
      <td style={{ padding: "12px 8px", color: HQ.inkMuted }}>{tenant.lastActivity}</td>
      <td style={{ padding: "12px 8px", textAlign: "right" }}>
        <Icon name="chevron-right" size={14} color={HQ.inkDim} />
      </td>
    </tr>
  );
}

function TenantMiniRow({ tenant }: { tenant: PlatformTenant }) {
  const { openDrawer } = useProto();
  return (
    <button
      onClick={() => openDrawer("platform-tenant-detail", { id: tenant.id })}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        width: "100%",
        padding: "9px 0",
        background: "transparent",
        border: "none",
        borderTop: `1px solid ${HQ.borderSoft}`,
        cursor: "pointer",
        textAlign: "left",
        fontFamily: FONTS.body,
        color: HQ.ink,
      }}
    >
      <span style={{ flex: 1, fontSize: 13 }}>{tenant.name}</span>
      <span style={{ fontSize: 11.5, color: HQ.inkMuted }}>{PLAN_META[tenant.plan].label}</span>
      <span style={{ fontSize: 11.5, color: HQ.inkMuted }}>{tenant.signupAt}</span>
    </button>
  );
}

// ════════════════════════════════════════════════════════════════════
// USERS
// ════════════════════════════════════════════════════════════════════

function PlatformUsersPage() {
  return (
    <>
      <PageHeader
        eyebrow="Users"
        title="Every human across tenants"
        subtitle="Combined account view. A user can belong to multiple tenants — merged here."
      />
      <HqCard title="Users" subtitle={`${PLATFORM_USERS.length} active`}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: FONTS.body, fontSize: 13, color: HQ.ink }}>
          <thead>
            <tr style={{ borderBottom: `1px solid ${HQ.borderSoft}` }}>
              {["Name", "Email", "Primary tenant", "Tenants", "Type", "Last seen", ""].map((h) => (
                <th
                  key={h}
                  style={{
                    textAlign: "left",
                    padding: "10px 8px",
                    fontSize: 10.5,
                    fontWeight: 600,
                    color: HQ.inkMuted,
                    letterSpacing: 0.5,
                    textTransform: "uppercase",
                  }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {PLATFORM_USERS.map((u) => <UserRow key={u.id} user={u} />)}
          </tbody>
        </table>
      </HqCard>
    </>
  );
}

function UserRow({ user }: { user: PlatformUser }) {
  const { openDrawer } = useProto();
  return (
    <tr
      style={{ borderBottom: `1px solid ${HQ.borderSoft}`, cursor: "pointer" }}
      onClick={() => openDrawer("platform-user-detail", { id: user.id })}
    >
      <td style={{ padding: "12px 8px", fontWeight: 500 }}>{user.name}</td>
      <td style={{ padding: "12px 8px", color: HQ.inkMuted, fontFamily: FONTS.mono, fontSize: 11.5 }}>{user.email}</td>
      <td style={{ padding: "12px 8px", color: HQ.inkMuted }}>{user.primaryTenant}</td>
      <td style={{ padding: "12px 8px", color: HQ.inkMuted }}>{user.tenants}</td>
      <td style={{ padding: "12px 8px", color: HQ.inkMuted }}>
        {user.isTalent ? "Talent" : "Booker / admin"}
      </td>
      <td style={{ padding: "12px 8px", color: HQ.inkMuted }}>{user.lastSeen}</td>
      <td style={{ padding: "12px 8px", textAlign: "right" }}>
        <Icon name="chevron-right" size={14} color={HQ.inkDim} />
      </td>
    </tr>
  );
}

// ════════════════════════════════════════════════════════════════════
// NETWORK (Tulala hub)
// ════════════════════════════════════════════════════════════════════

function PlatformNetworkPage() {
  const { openDrawer } = useProto();
  return (
    <>
      <PageHeader
        eyebrow="Tulala hub"
        title="Network"
        subtitle="The discovery surface that sits across every tenant. Curate featured talent, run moderation, and tune ranking."
        actions={
          <SecondaryButton onClick={() => openDrawer("platform-hub-rules")}>Hub rules</SecondaryButton>
        }
      />
      <HqGrid cols="2">
        <HqCard title="Submissions awaiting review" subtitle="Talent agencies have submitted to be featured.">
          {HUB_SUBMISSIONS.map((s) => <HubSubmissionRow key={s.id} sub={s} />)}
        </HqCard>
        <HqCard title="Moderation queue">
          {MODERATION_QUEUE.map((m) => <ModerationRow key={m.id} item={m} />)}
        </HqCard>
      </HqGrid>
    </>
  );
}

function HubSubmissionRow({ sub }: { sub: HubSubmission }) {
  const { openDrawer } = useProto();
  const tone = sub.status === "pending" ? "amber" : sub.status === "featured" ? "green" : "dim";
  const label = sub.status === "pending" ? "Pending" : sub.status === "featured" ? "Featured" : "Declined";
  return (
    <button
      onClick={() => openDrawer("platform-hub-submission", { id: sub.id })}
      style={{
        display: "flex",
        gap: 10,
        alignItems: "center",
        width: "100%",
        padding: "10px 0",
        background: "transparent",
        border: "none",
        borderTop: `1px solid ${HQ.borderSoft}`,
        cursor: "pointer",
        textAlign: "left",
        fontFamily: FONTS.body,
        color: HQ.ink,
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 500 }}>{sub.talentName}</div>
        <div style={{ fontSize: 11.5, color: HQ.inkMuted, marginTop: 2 }}>
          {sub.agency} · {sub.submittedAt}
        </div>
      </div>
      <span
        style={{
          padding: "2px 8px",
          background: tone === "green" ? "rgba(93,211,160,0.15)" : tone === "amber" ? "rgba(232,181,89,0.15)" : HQ.cardSoft,
          color: tone === "green" ? HQ.green : tone === "amber" ? HQ.amber : HQ.inkMuted,
          fontSize: 10.5,
          fontWeight: 600,
          letterSpacing: 0.4,
          textTransform: "uppercase",
          borderRadius: 999,
        }}
      >
        {label}
      </span>
    </button>
  );
}

function ModerationRow({ item }: { item: ModerationItem }) {
  const { openDrawer } = useProto();
  const sevColor = item.severity === "high" ? HQ.red : item.severity === "med" ? HQ.amber : HQ.inkDim;
  return (
    <button
      onClick={() => openDrawer("platform-moderation-item", { id: item.id })}
      style={{
        display: "flex",
        gap: 10,
        alignItems: "center",
        width: "100%",
        padding: "10px 0",
        background: "transparent",
        border: "none",
        borderTop: `1px solid ${HQ.borderSoft}`,
        cursor: "pointer",
        textAlign: "left",
        fontFamily: FONTS.body,
        color: HQ.ink,
      }}
    >
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: sevColor, flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13 }}>{item.subject}</div>
        <div style={{ fontSize: 11.5, color: HQ.inkMuted, marginTop: 2 }}>
          {item.reason} · {item.reportedAt}
        </div>
      </div>
      <Icon name="chevron-right" size={14} color={HQ.inkDim} />
    </button>
  );
}

// ════════════════════════════════════════════════════════════════════
// BILLING
// ════════════════════════════════════════════════════════════════════

function PlatformBillingPage() {
  const { state } = useProto();
  const canRefund = HQ_ROLE_META[state.hqRole].canRefund;
  const failedInvoices = PLATFORM_INVOICES.filter((i) => i.status === "failed");
  return (
    <>
      <PageHeader
        eyebrow="Billing"
        title="Revenue"
        subtitle={
          canRefund
            ? "MRR by plan, invoice ledger, and refund tools."
            : "MRR by plan and invoice ledger. Refunds are restricted to billing role."
        }
      />
      <HqGrid cols="3">
        <HqStatCard label="MRR (April)" value="$3,742" caption="↑ 8% MoM" tone="green" />
        <HqStatCard label="Churn (last 30d)" value="$298" caption="2 cancellations" tone="amber" />
        <HqStatCard
          label="Failed payments"
          value={failedInvoices.length}
          caption="needs dunning"
          tone={failedInvoices.length === 0 ? "green" : "red"}
        />
      </HqGrid>

      <div style={{ height: 24 }} />

      <HqCard title="Recent invoices" subtitle={`${PLATFORM_INVOICES.length} on the ledger`}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: FONTS.body, fontSize: 13, color: HQ.ink }}>
          <thead>
            <tr style={{ borderBottom: `1px solid ${HQ.borderSoft}` }}>
              {["Tenant", "Plan", "Amount", "Date", "Status", ""].map((h) => (
                <th
                  key={h}
                  style={{
                    textAlign: h === "Amount" ? "right" : "left",
                    padding: "10px 8px",
                    fontSize: 10.5,
                    fontWeight: 600,
                    color: HQ.inkMuted,
                    letterSpacing: 0.5,
                    textTransform: "uppercase",
                  }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {PLATFORM_INVOICES.map((i) => <InvoiceRow key={i.id} invoice={i} />)}
          </tbody>
        </table>
      </HqCard>
    </>
  );
}

function InvoiceRow({ invoice }: { invoice: PlatformInvoice }) {
  const { openDrawer } = useProto();
  const statusColor =
    invoice.status === "paid" ? HQ.green : invoice.status === "failed" ? HQ.red : invoice.status === "refunded" ? HQ.amber : HQ.inkMuted;
  return (
    <tr
      style={{ borderBottom: `1px solid ${HQ.borderSoft}`, cursor: "pointer" }}
      onClick={() => openDrawer("platform-billing-invoice", { id: invoice.id })}
    >
      <td style={{ padding: "12px 8px", fontWeight: 500 }}>{invoice.tenant}</td>
      <td style={{ padding: "12px 8px", color: HQ.inkMuted }}>{PLAN_META[invoice.plan].label}</td>
      <td style={{ padding: "12px 8px", textAlign: "right", fontWeight: 500 }}>{invoice.amount}</td>
      <td style={{ padding: "12px 8px", color: HQ.inkMuted }}>{invoice.date}</td>
      <td style={{ padding: "12px 8px", textTransform: "capitalize", color: statusColor, fontWeight: 500 }}>
        {invoice.status}
      </td>
      <td style={{ padding: "12px 8px", textAlign: "right" }}>
        <Icon name="chevron-right" size={14} color={HQ.inkDim} />
      </td>
    </tr>
  );
}

// ════════════════════════════════════════════════════════════════════
// OPERATIONS (flags + jobs + incidents)
// ════════════════════════════════════════════════════════════════════

function PlatformOperationsPage() {
  return (
    <>
      <PageHeader
        eyebrow="Operations"
        title="Platform plumbing"
        subtitle="Feature flags, system jobs, and incidents — the levers and alarms for running Tulala."
      />
      <HqGrid cols="2">
        <HqCard title="Feature flags">
          {FEATURE_FLAGS.map((f) => <FlagRow key={f.id} flag={f} />)}
        </HqCard>
        <HqCard title="System jobs">
          {SYSTEM_JOBS.map((j) => <JobRow key={j.id} job={j} />)}
        </HqCard>
      </HqGrid>
      <div style={{ height: 12 }} />
      <HqCard title="Incidents">
        {PLATFORM_INCIDENTS.map((i) => <IncidentRow key={i.id} incident={i} />)}
      </HqCard>
    </>
  );
}

function FlagRow({ flag }: { flag: FeatureFlag }) {
  const { openDrawer, state } = useProto();
  const canFlag = HQ_ROLE_META[state.hqRole].canFlag;
  const stateColor = flag.state === "on" ? HQ.green : flag.state === "off" ? HQ.inkDim : HQ.amber;
  return (
    <button
      onClick={() => canFlag && openDrawer("platform-feature-flag", { id: flag.id })}
      style={{
        display: "flex",
        gap: 12,
        alignItems: "center",
        width: "100%",
        padding: "10px 0",
        background: "transparent",
        border: "none",
        borderTop: `1px solid ${HQ.borderSoft}`,
        cursor: canFlag ? "pointer" : "default",
        textAlign: "left",
        fontFamily: FONTS.body,
        color: HQ.ink,
        opacity: canFlag ? 1 : 0.6,
      }}
    >
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: stateColor, flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontFamily: FONTS.mono, fontSize: 12, fontWeight: 500 }}>{flag.name}</div>
        <div style={{ fontSize: 11.5, color: HQ.inkMuted, marginTop: 2 }}>
          {flag.description} · {flag.owner}
          {flag.rollout && <> · {flag.rollout}</>}
        </div>
      </div>
      <span
        style={{
          padding: "2px 8px",
          background: HQ.cardSoft,
          color: stateColor,
          fontSize: 10.5,
          fontWeight: 600,
          letterSpacing: 0.4,
          textTransform: "uppercase",
          borderRadius: 999,
        }}
      >
        {flag.state}
      </span>
    </button>
  );
}

function JobRow({ job }: { job: SystemJob }) {
  const { openDrawer } = useProto();
  const stateColor =
    job.state === "succeeded" ? HQ.green : job.state === "failed" ? HQ.red : job.state === "running" ? HQ.amber : HQ.inkDim;
  return (
    <button
      onClick={() => openDrawer("platform-system-job", { id: job.id })}
      style={{
        display: "flex",
        gap: 12,
        alignItems: "center",
        width: "100%",
        padding: "10px 0",
        background: "transparent",
        border: "none",
        borderTop: `1px solid ${HQ.borderSoft}`,
        cursor: "pointer",
        textAlign: "left",
        fontFamily: FONTS.body,
        color: HQ.ink,
      }}
    >
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: stateColor, flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontFamily: FONTS.mono, fontSize: 12, fontWeight: 500 }}>{job.name}</div>
        <div style={{ fontSize: 11.5, color: HQ.inkMuted, marginTop: 2 }}>
          {job.lastRun} · {job.duration}
        </div>
      </div>
      <span
        style={{
          padding: "2px 8px",
          background: HQ.cardSoft,
          color: stateColor,
          fontSize: 10.5,
          fontWeight: 600,
          letterSpacing: 0.4,
          textTransform: "uppercase",
          borderRadius: 999,
        }}
      >
        {job.state}
      </span>
    </button>
  );
}

function IncidentRow({ incident }: { incident: PlatformIncident }) {
  const { openDrawer } = useProto();
  const sevColor = incident.severity === "p1" ? HQ.red : incident.severity === "p2" ? HQ.amber : HQ.inkMuted;
  return (
    <button
      onClick={() => openDrawer("platform-incident", { id: incident.id })}
      style={{
        display: "flex",
        gap: 12,
        alignItems: "center",
        width: "100%",
        padding: "10px 0",
        background: "transparent",
        border: "none",
        borderTop: `1px solid ${HQ.borderSoft}`,
        cursor: "pointer",
        textAlign: "left",
        fontFamily: FONTS.body,
        color: HQ.ink,
      }}
    >
      <span
        style={{
          padding: "2px 8px",
          background: HQ.cardSoft,
          color: sevColor,
          fontSize: 10.5,
          fontWeight: 700,
          letterSpacing: 0.6,
          textTransform: "uppercase",
          borderRadius: 6,
          flexShrink: 0,
        }}
      >
        {incident.severity}
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 500 }}>{incident.title}</div>
        <div style={{ fontSize: 11.5, color: HQ.inkMuted, marginTop: 2 }}>
          {incident.state} · started {incident.startedAt}
        </div>
      </div>
      <Icon name="chevron-right" size={14} color={HQ.inkDim} />
    </button>
  );
}

function SupportTicketRow({ ticket }: { ticket: SupportTicket }) {
  const { openDrawer } = useProto();
  return (
    <button
      onClick={() => openDrawer("platform-support-ticket", { id: ticket.id })}
      style={{
        display: "flex",
        gap: 12,
        alignItems: "center",
        width: "100%",
        padding: "10px 0",
        background: "transparent",
        border: "none",
        borderTop: `1px solid ${HQ.borderSoft}`,
        cursor: "pointer",
        textAlign: "left",
        fontFamily: FONTS.body,
        color: HQ.ink,
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 500 }}>{ticket.subject}</div>
        <div style={{ fontSize: 11.5, color: HQ.inkMuted, marginTop: 2 }}>
          {ticket.tenant} · {ticket.reportedBy} · {ticket.ageHrs}h ago
        </div>
      </div>
      <Icon name="chevron-right" size={14} color={HQ.inkDim} />
    </button>
  );
}

// ════════════════════════════════════════════════════════════════════
// SETTINGS (HQ team + audit + region)
// ════════════════════════════════════════════════════════════════════

function PlatformSettingsPage() {
  const { openDrawer } = useProto();
  return (
    <>
      <PageHeader
        eyebrow="Settings"
        title="HQ"
        subtitle="The internal team, audit trail, region config, and other platform-wide settings."
      />
      <HqGrid cols="2">
        <HqCard
          title="HQ team"
          action={
            <button
              onClick={() => openDrawer("platform-hq-team")}
              style={{ background: "transparent", border: "none", color: HQ.amber, fontFamily: FONTS.body, fontSize: 11.5, fontWeight: 600, cursor: "pointer" }}
            >
              Manage →
            </button>
          }
        >
          {PLATFORM_HQ_TEAM.map((m) => (
            <div
              key={m.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "10px 0",
                borderTop: `1px solid ${HQ.borderSoft}`,
                fontFamily: FONTS.body,
                color: HQ.ink,
              }}
            >
              <Avatar initials={m.initials} size={28} tone="ink" />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 500 }}>{m.name}</div>
                <div style={{ fontSize: 11.5, color: HQ.inkMuted, marginTop: 1 }}>{m.email}</div>
              </div>
              <span
                style={{
                  padding: "2px 8px",
                  background: HQ.cardSoft,
                  color: HQ.ink,
                  fontSize: 10.5,
                  fontWeight: 600,
                  letterSpacing: 0.4,
                  textTransform: "uppercase",
                  borderRadius: 999,
                }}
              >
                {m.role}
              </span>
            </div>
          ))}
        </HqCard>
        <HqCard title="Platform">
          {[
            { label: "Audit log", id: "platform-audit-export" as const, desc: "Export the last 90 days of HQ actions" },
            { label: "Region config", id: "platform-region-config" as const, desc: "EU / NA / APAC routing" },
            { label: "Dunning rules", id: "platform-dunning" as const, desc: "When and how to retry failed payments" },
          ].map((row) => (
            <button
              key={row.id}
              onClick={() => openDrawer(row.id)}
              style={{
                display: "flex",
                gap: 10,
                alignItems: "center",
                width: "100%",
                padding: "10px 0",
                background: "transparent",
                border: "none",
                borderTop: `1px solid ${HQ.borderSoft}`,
                cursor: "pointer",
                textAlign: "left",
                fontFamily: FONTS.body,
                color: HQ.ink,
              }}
            >
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 500 }}>{row.label}</div>
                <div style={{ fontSize: 11.5, color: HQ.inkMuted, marginTop: 2 }}>{row.desc}</div>
              </div>
              <Icon name="chevron-right" size={14} color={HQ.inkDim} />
            </button>
          ))}
        </HqCard>
      </HqGrid>
    </>
  );
}

// ════════════════════════════════════════════════════════════════════
// Platform DRAWERS
// ════════════════════════════════════════════════════════════════════

export function PlatformTodayPulseDrawer() {
  const { state, closeDrawer } = useProto();
  const open = state.drawer.drawerId === "platform-today-pulse";
  return (
    <DrawerShell
      open={open}
      onClose={closeDrawer}
      title="Platform pulse"
      description="Everything that needs attention right now — incidents, tickets, hub queue."
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {[
          ...PLATFORM_INCIDENTS.filter((i) => i.state !== "resolved").map((i) => ({
            label: i.title,
            sub: `${i.severity} · ${i.state}`,
            tone: "red" as const,
          })),
          ...SUPPORT_TICKETS.filter((t) => t.state !== "resolved").map((t) => ({
            label: t.subject,
            sub: `${t.tenant} · ${t.ageHrs}h ago`,
            tone: "amber" as const,
          })),
          ...HUB_SUBMISSIONS.filter((h) => h.status === "pending").map((h) => ({
            label: `Hub: ${h.talentName}`,
            sub: `${h.agency} · ${h.submittedAt}`,
            tone: "ink" as const,
          })),
        ].map((row, i) => (
          <div
            key={i}
            style={{
              display: "flex",
              gap: 10,
              alignItems: "center",
              padding: "10px 12px",
              background: "#fff",
              border: `1px solid ${COLORS.borderSoft}`,
              borderRadius: 10,
              fontFamily: FONTS.body,
            }}
          >
            <StatDot tone={row.tone === "red" ? "red" : row.tone === "amber" ? "amber" : "ink"} size={8} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 500, color: COLORS.ink }}>{row.label}</div>
              <div style={{ fontSize: 11.5, color: COLORS.inkMuted, marginTop: 2 }}>{row.sub}</div>
            </div>
          </div>
        ))}
      </div>
    </DrawerShell>
  );
}

export function PlatformTenantDetailDrawer() {
  const { state, closeDrawer, openDrawer } = useProto();
  const open = state.drawer.drawerId === "platform-tenant-detail";
  const id = state.drawer.payload?.id as string | undefined;
  const t = PLATFORM_TENANTS.find((t) => t.id === id) ?? PLATFORM_TENANTS[0];
  const canImpersonate = HQ_ROLE_META[state.hqRole].canImpersonate;
  return (
    <DrawerShell
      open={open}
      onClose={closeDrawer}
      title={t.name}
      description={`${PLAN_META[t.plan].label} · ${t.seats} seats · ${t.talentCount} talent · MRR ${t.mrr}`}
      footer={
        <>
          <SecondaryButton onClick={() => openDrawer("platform-tenant-suspend", { id: t.id })}>Suspend</SecondaryButton>
          {canImpersonate && (
            <PrimaryButton onClick={() => openDrawer("platform-tenant-impersonate", { id: t.id })}>
              Impersonate
            </PrimaryButton>
          )}
        </>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <DrawerKv label="Slug" value={t.slug} />
        <DrawerKv label="Plan" value={PLAN_META[t.plan].label} />
        <DrawerKv label="Health" value={t.health} />
        <DrawerKv label="Signed up" value={t.signupAt} />
        <DrawerKv label="Last active" value={t.lastActivity} />
      </div>
      <Divider label="Plan controls" />
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <button
          onClick={() => openDrawer("platform-tenant-plan-override", { id: t.id })}
          style={drawerActionStyle()}
        >
          Override plan
          <Icon name="chevron-right" size={14} color={COLORS.inkDim} />
        </button>
        <button
          onClick={() => openDrawer("platform-refund", { tenantId: t.id })}
          style={drawerActionStyle()}
        >
          Issue refund
          <Icon name="chevron-right" size={14} color={COLORS.inkDim} />
        </button>
      </div>
    </DrawerShell>
  );
}

function drawerActionStyle(): React.CSSProperties {
  return {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "12px 14px",
    background: "#fff",
    border: `1px solid ${COLORS.borderSoft}`,
    borderRadius: 10,
    cursor: "pointer",
    textAlign: "left",
    fontFamily: FONTS.body,
    fontSize: 13,
    fontWeight: 500,
    color: COLORS.ink,
    width: "100%",
    justifyContent: "space-between",
  };
}

function DrawerKv({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        display: "flex",
        padding: "8px 0",
        borderTop: `1px solid ${COLORS.borderSoft}`,
        fontFamily: FONTS.body,
      }}
    >
      <span
        style={{
          width: 110,
          fontSize: 11.5,
          color: COLORS.inkMuted,
          fontWeight: 600,
          letterSpacing: 0.5,
          textTransform: "uppercase",
        }}
      >
        {label}
      </span>
      <span style={{ flex: 1, fontSize: 13, color: COLORS.ink }}>{value}</span>
    </div>
  );
}

export function PlatformTenantImpersonateDrawer() {
  const { state, closeDrawer, startImpersonation, toast } = useProto();
  const open = state.drawer.drawerId === "platform-tenant-impersonate";
  const id = state.drawer.payload?.id as string | undefined;
  const t = PLATFORM_TENANTS.find((t) => t.id === id) ?? PLATFORM_TENANTS[0];
  return (
    <DrawerShell
      open={open}
      onClose={closeDrawer}
      title="Impersonate tenant"
      description={`Step into ${t.name} as if you were on their team. Read-only by default — flip the toggle if you need to act.`}
      footer={
        <>
          <SecondaryButton onClick={closeDrawer}>Cancel</SecondaryButton>
          <PrimaryButton
            onClick={() => {
              startImpersonation({
                tenantSlug: t.slug,
                tenantName: t.name,
                asPlan: t.plan,
                asRole: "owner",
                readOnly: true,
              });
              toast(`Impersonating ${t.name} (read-only)`);
            }}
          >
            Start (read-only)
          </PrimaryButton>
        </>
      }
    >
      <div
        style={{
          padding: 14,
          background: "rgba(176,48,58,0.06)",
          border: `1px solid rgba(176,48,58,0.18)`,
          borderRadius: 10,
          color: "#7A2026",
          fontFamily: FONTS.body,
          fontSize: 12.5,
          lineHeight: 1.55,
          display: "flex",
          gap: 10,
        }}
      >
        <Icon name="info" size={14} color="#7A2026" />
        <span>
          Impersonation is logged to the audit trail. Read-only mode prevents writes — the tenant can't tell you're there.
        </span>
      </div>
      <Divider label="What you'll see" />
      <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 6, fontFamily: FONTS.body, fontSize: 13, color: COLORS.ink }}>
        {[
          "Their workspace UI — exactly as their owner sees it",
          "Their plan, team, talent roster, inquiries, bookings",
          "A red banner across the top (so you don't forget)",
        ].map((p) => (
          <li key={p} style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: COLORS.inkDim }} />
            {p}
          </li>
        ))}
      </ul>
    </DrawerShell>
  );
}

export function PlatformTenantSuspendDrawer() {
  const { state, closeDrawer, toast } = useProto();
  const open = state.drawer.drawerId === "platform-tenant-suspend";
  const id = state.drawer.payload?.id as string | undefined;
  const t = PLATFORM_TENANTS.find((t) => t.id === id) ?? PLATFORM_TENANTS[0];
  return (
    <DrawerShell
      open={open}
      onClose={closeDrawer}
      title="Suspend tenant"
      description={`Temporarily lock ${t.name} out of the platform. Their public site stays up but no one can sign in.`}
      footer={
        <>
          <SecondaryButton onClick={closeDrawer}>Cancel</SecondaryButton>
          <PrimaryButton onClick={() => { toast(`${t.name} suspended`); closeDrawer(); }}>Suspend</PrimaryButton>
        </>
      }
    >
      <div
        style={{
          padding: 14,
          background: "rgba(176,48,58,0.06)",
          border: `1px solid rgba(176,48,58,0.18)`,
          borderRadius: 10,
          color: "#7A2026",
          fontFamily: FONTS.body,
          fontSize: 12.5,
          lineHeight: 1.55,
        }}
      >
        Suspension is reversible from this same drawer. The tenant gets a generic "account paused" email.
      </div>
    </DrawerShell>
  );
}

export function PlatformTenantPlanOverrideDrawer() {
  const { state, closeDrawer, toast } = useProto();
  const open = state.drawer.drawerId === "platform-tenant-plan-override";
  return (
    <DrawerShell
      open={open}
      onClose={closeDrawer}
      title="Override plan"
      description="Temporarily set a different plan for this tenant. Reverts on next billing cycle unless extended."
      footer={
        <>
          <SecondaryButton onClick={closeDrawer}>Cancel</SecondaryButton>
          <PrimaryButton onClick={() => { toast("Plan override saved"); closeDrawer(); }}>Save override</PrimaryButton>
        </>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 8, fontFamily: FONTS.body }}>
        {(["free", "studio", "agency", "network"] as const).map((p) => (
          <label
            key={p}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "10px 12px",
              background: "#fff",
              border: `1px solid ${COLORS.borderSoft}`,
              borderRadius: 10,
              cursor: "pointer",
            }}
          >
            <input type="radio" name="plan-override" defaultChecked={p === "agency"} />
            <span style={{ flex: 1, fontSize: 13, color: COLORS.ink, fontWeight: 500 }}>
              {PLAN_META[p].label}
            </span>
            <span style={{ fontSize: 11.5, color: COLORS.inkMuted }}>{PLAN_META[p].theme}</span>
          </label>
        ))}
      </div>
    </DrawerShell>
  );
}

export function PlatformUserDetailDrawer() {
  const { state, closeDrawer, openDrawer } = useProto();
  const open = state.drawer.drawerId === "platform-user-detail";
  const id = state.drawer.payload?.id as string | undefined;
  const u = PLATFORM_USERS.find((u) => u.id === id) ?? PLATFORM_USERS[0];
  return (
    <DrawerShell
      open={open}
      onClose={closeDrawer}
      title={u.name}
      description={u.email}
      footer={
        <>
          <SecondaryButton onClick={() => openDrawer("platform-user-merge", { id: u.id })}>Merge accounts</SecondaryButton>
          <PrimaryButton onClick={() => openDrawer("platform-user-reset", { id: u.id })}>Reset password</PrimaryButton>
        </>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <DrawerKv label="Primary tenant" value={u.primaryTenant} />
        <DrawerKv label="Tenants" value={String(u.tenants)} />
        <DrawerKv label="Type" value={u.isTalent ? "Talent" : "Booker / admin"} />
        <DrawerKv label="Last seen" value={u.lastSeen} />
      </div>
    </DrawerShell>
  );
}

export function PlatformUserMergeDrawer() {
  const { state, closeDrawer, toast } = useProto();
  const open = state.drawer.drawerId === "platform-user-merge";
  return (
    <DrawerShell
      open={open}
      onClose={closeDrawer}
      title="Merge accounts"
      description="Combine duplicate users. The selected target keeps the canonical email."
      footer={
        <>
          <SecondaryButton onClick={closeDrawer}>Cancel</SecondaryButton>
          <PrimaryButton onClick={() => { toast("Accounts merged"); closeDrawer(); }}>Merge</PrimaryButton>
        </>
      }
    >
      <div style={{ fontFamily: FONTS.body, fontSize: 13, color: COLORS.inkMuted, lineHeight: 1.55 }}>
        Merging is logged in the audit trail and emits a webhook. Duplicates that share login email get auto-detected.
      </div>
    </DrawerShell>
  );
}

export function PlatformUserResetDrawer() {
  const { state, closeDrawer, toast } = useProto();
  const open = state.drawer.drawerId === "platform-user-reset";
  return (
    <DrawerShell
      open={open}
      onClose={closeDrawer}
      title="Send reset email"
      description="Sends the standard password-reset email. We never set or see passwords directly."
      footer={
        <>
          <SecondaryButton onClick={closeDrawer}>Cancel</SecondaryButton>
          <PrimaryButton onClick={() => { toast("Reset email sent"); closeDrawer(); }}>Send</PrimaryButton>
        </>
      }
    >
      <div style={{ fontFamily: FONTS.body, fontSize: 13, color: COLORS.inkMuted, lineHeight: 1.55 }}>
        The email arrives within a minute. If the user reports not getting it, check the audit log.
      </div>
    </DrawerShell>
  );
}

export function PlatformHubSubmissionDrawer() {
  const { state, closeDrawer, toast } = useProto();
  const open = state.drawer.drawerId === "platform-hub-submission";
  const id = state.drawer.payload?.id as string | undefined;
  const s = HUB_SUBMISSIONS.find((s) => s.id === id) ?? HUB_SUBMISSIONS[0];
  return (
    <DrawerShell
      open={open}
      onClose={closeDrawer}
      title={s.talentName}
      description={`${s.agency} · submitted ${s.submittedAt}`}
      footer={
        <>
          <SecondaryButton onClick={() => { toast("Declined"); closeDrawer(); }}>Decline</SecondaryButton>
          <PrimaryButton onClick={() => { toast("Featured"); closeDrawer(); }}>Feature</PrimaryButton>
        </>
      }
    >
      <div
        style={{
          aspectRatio: "16 / 9",
          background: COLORS.cream,
          borderRadius: 12,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 80,
        }}
      >
        ✨
      </div>
      <Divider label="Decision" />
      <p style={{ fontFamily: FONTS.body, fontSize: 13, color: COLORS.inkMuted, lineHeight: 1.55 }}>
        Feature on the Tulala hub for 30 days. Featured talent appear at the top of search.
        Decline if profile incomplete or media doesn't meet quality bar.
      </p>
    </DrawerShell>
  );
}

export function PlatformHubRulesDrawer() {
  const { state, closeDrawer, toast } = useProto();
  const open = state.drawer.drawerId === "platform-hub-rules";
  return (
    <DrawerShell
      open={open}
      onClose={closeDrawer}
      title="Hub rules"
      description="Rotation length, ranking weights, and what disqualifies a submission."
      footer={
        <>
          <SecondaryButton onClick={closeDrawer}>Cancel</SecondaryButton>
          <PrimaryButton onClick={() => { toast("Rules saved"); closeDrawer(); }}>Save</PrimaryButton>
        </>
      }
    >
      <div style={{ fontFamily: FONTS.body, fontSize: 13, color: COLORS.ink, lineHeight: 1.6 }}>
        <p>Featured rotation: 30 days · Ranking: completeness × recency × engagement.</p>
      </div>
    </DrawerShell>
  );
}

export function PlatformBillingInvoiceDrawer() {
  const { state, closeDrawer, openDrawer } = useProto();
  const open = state.drawer.drawerId === "platform-billing-invoice";
  const id = state.drawer.payload?.id as string | undefined;
  const i = PLATFORM_INVOICES.find((i) => i.id === id) ?? PLATFORM_INVOICES[0];
  return (
    <DrawerShell
      open={open}
      onClose={closeDrawer}
      title={`Invoice ${i.id}`}
      description={`${i.tenant} · ${i.amount} · ${i.date}`}
      footer={
        i.status === "paid" ? (
          <PrimaryButton onClick={() => openDrawer("platform-refund", { invoiceId: i.id })}>Issue refund</PrimaryButton>
        ) : i.status === "failed" ? (
          <PrimaryButton onClick={() => openDrawer("platform-dunning", { invoiceId: i.id })}>Open dunning</PrimaryButton>
        ) : null
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <DrawerKv label="Status" value={i.status} />
        <DrawerKv label="Plan" value={PLAN_META[i.plan].label} />
        <DrawerKv label="Date" value={i.date} />
        <DrawerKv label="Amount" value={i.amount} />
      </div>
    </DrawerShell>
  );
}

export function PlatformRefundDrawer() {
  const { state, closeDrawer, toast } = useProto();
  const open = state.drawer.drawerId === "platform-refund";
  const canRefund = HQ_ROLE_META[state.hqRole].canRefund;
  return (
    <DrawerShell
      open={open}
      onClose={closeDrawer}
      title="Issue refund"
      description={canRefund ? "Refunds emit a webhook and reverse the Stripe charge." : "Refunds require billing role."}
      footer={
        canRefund ? (
          <>
            <SecondaryButton onClick={closeDrawer}>Cancel</SecondaryButton>
            <PrimaryButton onClick={() => { toast("Refund issued"); closeDrawer(); }}>Confirm refund</PrimaryButton>
          </>
        ) : (
          <SecondaryButton onClick={closeDrawer}>Close</SecondaryButton>
        )
      }
    >
      <div style={{ fontFamily: FONTS.body, fontSize: 13, color: COLORS.inkMuted, lineHeight: 1.55 }}>
        {canRefund
          ? "This will trigger a Stripe refund and email the tenant a receipt."
          : "Switch your HQ role to Billing or Exec to issue refunds."}
      </div>
    </DrawerShell>
  );
}

export function PlatformDunningDrawer() {
  const { state, closeDrawer, toast } = useProto();
  const open = state.drawer.drawerId === "platform-dunning";
  return (
    <DrawerShell
      open={open}
      onClose={closeDrawer}
      title="Dunning"
      description="Retry rules and follow-up emails for failed payments."
      footer={
        <PrimaryButton onClick={() => { toast("Dunning queue updated"); closeDrawer(); }}>Retry now</PrimaryButton>
      }
    >
      <div style={{ fontFamily: FONTS.body, fontSize: 13, color: COLORS.ink, lineHeight: 1.6 }}>
        Retry sequence: day 1 → day 3 → day 7. After day 14 the tenant is marked at-risk.
      </div>
    </DrawerShell>
  );
}

export function PlatformFeatureFlagDrawer() {
  const { state, closeDrawer, toast } = useProto();
  const open = state.drawer.drawerId === "platform-feature-flag";
  const id = state.drawer.payload?.id as string | undefined;
  const f = FEATURE_FLAGS.find((f) => f.id === id) ?? FEATURE_FLAGS[0];
  return (
    <DrawerShell
      open={open}
      onClose={closeDrawer}
      title={f.name}
      description={f.description}
      footer={
        <>
          <SecondaryButton onClick={closeDrawer}>Cancel</SecondaryButton>
          <PrimaryButton onClick={() => { toast("Flag updated"); closeDrawer(); }}>Save</PrimaryButton>
        </>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <DrawerKv label="State" value={f.state} />
        <DrawerKv label="Owner" value={f.owner} />
        {f.rollout && <DrawerKv label="Rollout" value={f.rollout} />}
      </div>
      <Divider label="Set state" />
      <div style={{ display: "flex", gap: 8 }}>
        {(["off", "rollout", "on"] as const).map((s) => (
          <button
            key={s}
            style={{
              flex: 1,
              padding: "10px 12px",
              background: f.state === s ? COLORS.ink : "#fff",
              color: f.state === s ? "#fff" : COLORS.ink,
              border: `1px solid ${COLORS.border}`,
              borderRadius: 8,
              fontFamily: FONTS.body,
              fontSize: 12.5,
              fontWeight: 600,
              letterSpacing: 0.4,
              textTransform: "uppercase",
              cursor: "pointer",
            }}
          >
            {s}
          </button>
        ))}
      </div>
    </DrawerShell>
  );
}

export function PlatformModerationItemDrawer() {
  const { state, closeDrawer, toast } = useProto();
  const open = state.drawer.drawerId === "platform-moderation-item";
  const id = state.drawer.payload?.id as string | undefined;
  const m = MODERATION_QUEUE.find((m) => m.id === id) ?? MODERATION_QUEUE[0];
  return (
    <DrawerShell
      open={open}
      onClose={closeDrawer}
      title="Moderation item"
      description={m.subject}
      footer={
        <>
          <SecondaryButton onClick={() => { toast("Cleared"); closeDrawer(); }}>Clear</SecondaryButton>
          <PrimaryButton onClick={() => { toast("Action taken"); closeDrawer(); }}>Take action</PrimaryButton>
        </>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <DrawerKv label="Kind" value={m.kind} />
        <DrawerKv label="Reason" value={m.reason} />
        <DrawerKv label="Severity" value={m.severity} />
        <DrawerKv label="Reported" value={m.reportedAt} />
      </div>
    </DrawerShell>
  );
}

export function PlatformSystemJobDrawer() {
  const { state, closeDrawer, toast } = useProto();
  const open = state.drawer.drawerId === "platform-system-job";
  const id = state.drawer.payload?.id as string | undefined;
  const j = SYSTEM_JOBS.find((j) => j.id === id) ?? SYSTEM_JOBS[0];
  return (
    <DrawerShell
      open={open}
      onClose={closeDrawer}
      title={j.name}
      description={`Last run ${j.lastRun} · duration ${j.duration}`}
      footer={
        <>
          <SecondaryButton onClick={() => { toast("Logs opened"); closeDrawer(); }}>View logs</SecondaryButton>
          <PrimaryButton onClick={() => { toast("Job re-queued"); closeDrawer(); }}>Re-run now</PrimaryButton>
        </>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <DrawerKv label="State" value={j.state} />
      </div>
    </DrawerShell>
  );
}

export function PlatformIncidentDrawer() {
  const { state, closeDrawer, toast } = useProto();
  const open = state.drawer.drawerId === "platform-incident";
  const id = state.drawer.payload?.id as string | undefined;
  const i = PLATFORM_INCIDENTS.find((i) => i.id === id) ?? PLATFORM_INCIDENTS[0];
  return (
    <DrawerShell
      open={open}
      onClose={closeDrawer}
      title={i.title}
      description={`${i.severity.toUpperCase()} · ${i.state} · started ${i.startedAt}`}
      footer={
        <>
          <SecondaryButton onClick={() => { toast("Status updated"); closeDrawer(); }}>Update status</SecondaryButton>
          <PrimaryButton onClick={() => { toast("Marked resolved"); closeDrawer(); }}>Mark resolved</PrimaryButton>
        </>
      }
    >
      <div style={{ fontFamily: FONTS.body, fontSize: 13, color: COLORS.inkMuted, lineHeight: 1.55 }}>
        Status updates auto-post to the public statuspage. Mark resolved when monitoring shows clean for 15 minutes.
      </div>
    </DrawerShell>
  );
}

export function PlatformSupportTicketDrawer() {
  const { state, closeDrawer, toast } = useProto();
  const open = state.drawer.drawerId === "platform-support-ticket";
  const id = state.drawer.payload?.id as string | undefined;
  const t = SUPPORT_TICKETS.find((t) => t.id === id) ?? SUPPORT_TICKETS[0];
  return (
    <DrawerShell
      open={open}
      onClose={closeDrawer}
      title={t.subject}
      description={`${t.tenant} · ${t.reportedBy} · ${t.ageHrs}h ago`}
      footer={
        <>
          <SecondaryButton onClick={() => { toast("Reply sent"); closeDrawer(); }}>Reply</SecondaryButton>
          <PrimaryButton onClick={() => { toast("Resolved"); closeDrawer(); }}>Mark resolved</PrimaryButton>
        </>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <DrawerKv label="State" value={t.state} />
        <DrawerKv label="Tenant" value={t.tenant} />
        <DrawerKv label="Reporter" value={t.reportedBy} />
      </div>
    </DrawerShell>
  );
}

export function PlatformAuditExportDrawer() {
  const { state, closeDrawer, toast } = useProto();
  const open = state.drawer.drawerId === "platform-audit-export";
  return (
    <DrawerShell
      open={open}
      onClose={closeDrawer}
      title="Audit export"
      description="Export the last 90 days of HQ actions as CSV."
      footer={
        <PrimaryButton onClick={() => { toast("CSV emailed"); closeDrawer(); }}>Email CSV</PrimaryButton>
      }
    >
      <div style={{ fontFamily: FONTS.body, fontSize: 13, color: COLORS.inkMuted, lineHeight: 1.55 }}>
        Includes impersonations, refunds, plan overrides, flag changes, suspensions.
      </div>
    </DrawerShell>
  );
}

export function PlatformHqTeamDrawer() {
  const { state, closeDrawer, toast } = useProto();
  const open = state.drawer.drawerId === "platform-hq-team";
  return (
    <DrawerShell
      open={open}
      onClose={closeDrawer}
      title="HQ team"
      description="Tulala employees with HQ access."
      footer={
        <PrimaryButton onClick={() => { toast("Invite sent"); closeDrawer(); }}>Invite member</PrimaryButton>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {PLATFORM_HQ_TEAM.map((m) => (
          <div
            key={m.id}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "10px 12px",
              background: "#fff",
              border: `1px solid ${COLORS.borderSoft}`,
              borderRadius: 10,
              fontFamily: FONTS.body,
            }}
          >
            <Avatar initials={m.initials} size={32} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 500, color: COLORS.ink }}>{m.name}</div>
              <div style={{ fontSize: 11.5, color: COLORS.inkMuted, marginTop: 2 }}>{m.email}</div>
            </div>
            <span
              style={{
                padding: "2px 8px",
                background: "rgba(11,11,13,0.04)",
                color: COLORS.ink,
                fontSize: 10.5,
                fontWeight: 600,
                letterSpacing: 0.4,
                textTransform: "uppercase",
                borderRadius: 999,
              }}
            >
              {m.role}
            </span>
          </div>
        ))}
      </div>
    </DrawerShell>
  );
}

export function PlatformRegionConfigDrawer() {
  const { state, closeDrawer, toast } = useProto();
  const open = state.drawer.drawerId === "platform-region-config";
  return (
    <DrawerShell
      open={open}
      onClose={closeDrawer}
      title="Region config"
      description="Routing rules per region (data residency, payment gateway, CDN)."
      footer={
        <PrimaryButton onClick={() => { toast("Region config saved"); closeDrawer(); }}>Save</PrimaryButton>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {[
          { region: "EU", db: "eu-west-1", payment: "Stripe EU" },
          { region: "NA", db: "us-east-1", payment: "Stripe US" },
          { region: "APAC", db: "ap-southeast-1", payment: "Stripe APAC" },
        ].map((r) => (
          <div
            key={r.region}
            style={{
              display: "flex",
              gap: 10,
              padding: "10px 12px",
              background: "#fff",
              border: `1px solid ${COLORS.borderSoft}`,
              borderRadius: 10,
              fontFamily: FONTS.body,
              alignItems: "center",
            }}
          >
            <span
              style={{
                padding: "2px 8px",
                background: COLORS.ink,
                color: "#fff",
                fontSize: 10.5,
                fontWeight: 700,
                letterSpacing: 0.5,
                borderRadius: 6,
              }}
            >
              {r.region}
            </span>
            <span style={{ flex: 1, fontSize: 13, color: COLORS.ink }}>
              {r.db} · {r.payment}
            </span>
          </div>
        ))}
      </div>
    </DrawerShell>
  );
}
