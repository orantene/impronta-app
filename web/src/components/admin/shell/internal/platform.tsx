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

import { type ReactNode, useEffect, useState } from "react";
import {
  COLORS,
  ENTITY_TYPE_META,
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
  useAdminShell,
  type EntityType,
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
} from "./state";
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
} from "./primitives";

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
  // Dark-theme cautionary tone — was warm gold (#E8B559); shifted to a
  // muted steel that reads as "attention" on dark surfaces without the
  // gold/rust connotation banned by feedback_admin_aesthetics.md.
  amber: "#9BA8B7",
  green: "#5DD3A0",
  red: "#F36772",
};

function openPlatformSupportEmail(subject: string, body: string) {
  const params = new URLSearchParams({ subject, body });
  window.location.href = `mailto:support@tulala.digital?${params.toString()}`;
}

function requestPlatformSupport(toast: (message: string) => void, subject: string, lines: string[]) {
  openPlatformSupportEmail(subject, lines.join("\n"));
  toast("Opening platform support email");
}

export function PlatformSurface() {
  return (
    <div style={{ background: HQ.bg, color: HQ.ink, minHeight: "calc(100vh - 50px)" }}>
      <PlatformTopbar />
      <ImpersonationStrip />
      <main
        data-tulala-surface-main
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
  const { state, setPlatformPage, setHqRole, verificationRequests } = useAdminShell();
  const meta = HQ_ROLE_META[state.hqRole];
  // Trust-verification queue is a PLATFORM-level function (Tulala staff
  // act as a neutral arbiter — see project_client_trust_badges.md).
  // Surface the pending count on the Operations tab so reviewers can see
  // their queue from anywhere in HQ. (This badge used to live on the
  // workspace Roster topbar — moved here 2026-05-02 to fix the layering.)
  const pendingVerifications = verificationRequests.filter(r =>
    r.status === "submitted" || r.status === "in_review" || r.status === "pending_user_action"
  ).length;
  return (
    <header
      data-tulala-app-topbar
      style={{
        background: HQ.card,
        borderBottom: `1px solid ${HQ.border}`,
        padding: "0 28px",
        position: "sticky",
        top: 50,
        zIndex: 40,
      }}
    >
      <div data-tulala-app-topbar-row style={{ display: "flex", alignItems: "center", gap: 16, height: 56 }}>
        {/* Tulala HQ identity */}
        <div className="flex items-center gap-2.5">
          <span style={{ width: 28, height: 28, borderRadius: 8, display: "inline-flex", alignItems: "center", justifyContent: "center", fontFamily: FONTS.display, fontWeight: 600 }} className="bg-admin-surface-alt text-admin-ink">
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

        <div data-tulala-topbar-divider style={{ width: 1, height: 22, background: HQ.borderSoft, margin: "0 8px" }} />

        {/* Page nav */}
        <nav data-tulala-app-topbar-nav aria-label="Platform sections" style={{ display: "flex", alignItems: "center", gap: 2, flex: 1, overflow: "auto" }}>
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
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
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
                {p === "operations" && pendingVerifications > 0 && (
                  <span
                    aria-label={`${pendingVerifications} pending verification${pendingVerifications === 1 ? "" : "s"}`}
                    title={`${pendingVerifications} pending verification${pendingVerifications === 1 ? "" : "s"} — IG-verified / Tulala-verified review queue`}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      minWidth: 16,
                      height: 16,
                      padding: "0 5px",
                      borderRadius: 999,
                      background: COLORS.indigo,
                      color: "#fff",
                      fontSize: 10,
                      fontWeight: 700,
                      lineHeight: 1,
                    }}
                  >
                    {pendingVerifications}
                  </span>
                )}
                <span
                  aria-hidden
                  style={{
                    position: "absolute",
                    bottom: -16,
                    left: 8,
                    right: 8,
                    height: 3,
                    background: HQ.ink,
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
  const { state, stopImpersonation } = useAdminShell();
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
  const { state } = useAdminShell();
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
    <>
    <style>{`
      @media (max-width: 680px) {
        [data-tulala-page-header] [data-tulala-h1] {
          font-size: 19px !important; line-height: 1.2 !important; letter-spacing: -0.25px !important; font-weight: 700 !important;
        }
        [data-tulala-page-header] { margin-bottom: 10px !important; gap: 8px !important; align-items: baseline !important; }
        [data-tulala-page-header] [data-tulala-page-eyebrow] { display: none !important; }
        [data-tulala-page-header] p { display: none !important; }
        [data-tulala-page-header-actions] { flex-shrink: 0 !important; }
      }
    `}</style>
    <div data-tulala-page-header style={{ display: "flex", alignItems: "flex-start", gap: 16, marginBottom: 14 }}>
      <div className="flex-1 min-w-0">
        {eyebrow && (
          <div data-tulala-page-eyebrow style={{ marginBottom: 6 }}>
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
          data-tulala-h1
          style={{
            fontFamily: FONTS.display,
            fontSize: 24,
            fontWeight: 600,
            letterSpacing: -0.4,
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
              fontSize: 13,
              color: HQ.inkMuted,
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
        <div data-tulala-page-header-actions style={{ display: "flex", gap: 8, alignItems: "center", flexShrink: 0 }}>
          {actions}
        </div>
      )}
    </div>
    </>
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
  // Wave 0 audit fixes:
  // - label: uppercase + 1.2 letter-spacing → sentence-case + 0.05 to
  //   match StatusCard's quiet-eyebrow pattern
  // - hover: was missing; now mirrors StatusCard via CardFrame (border
  //   + shadow lift on interactive variants)
  // - element: was always <button>, even when onClick was undefined;
  //   now switches to <div> so screen readers don't announce a no-op
  //   button
  // - aria-label: combined label + value + caption for screen-reader
  //   parity with StatusCard
  const accent =
    tone === "amber" ? HQ.amber : tone === "green" ? HQ.green : tone === "red" ? HQ.red : tone === "dim" ? HQ.inkDim : HQ.ink;
  const shared: React.CSSProperties = {
    background: HQ.card,
    border: `1px solid ${HQ.borderSoft}`,
    borderRadius: 12,
    padding: 16,
    textAlign: "left",
    fontFamily: FONTS.body,
    display: "flex",
    flexDirection: "column",
    gap: 6,
    minHeight: 116,
    transition: "border-color .12s, box-shadow .12s",
  };
  const inner = (
    <>
      <span style={{ fontSize: 11.5, color: HQ.inkMuted, fontWeight: 500, letterSpacing: 0.05 }}>
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
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {value}
      </span>
      {caption && (
        <span style={{ fontSize: 11.5, color: HQ.inkMuted }}>{caption}</span>
      )}
    </>
  );
  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-label={`${label}: ${typeof value === "string" || typeof value === "number" ? value : ""}${caption ? `, ${caption}` : ""}`}
        style={{ ...shared, cursor: "pointer" }}
        onMouseEnter={(e) => {
          e.currentTarget.style.borderColor = HQ.border;
          e.currentTarget.style.boxShadow = "0 6px 18px rgba(0,0,0,0.18)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.borderColor = HQ.borderSoft;
          e.currentTarget.style.boxShadow = "none";
        }}
      >
        {inner}
      </button>
    );
  }
  return <div style={shared}>{inner}</div>;
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
  return <div data-tulala-grid={cols} style={{ display: "grid", gridTemplateColumns: colMap[cols], gap: 12 }}>{children}</div>;
}

// ════════════════════════════════════════════════════════════════════
// TODAY (HQ pulse)
// ════════════════════════════════════════════════════════════════════

function PlatformTodayPage() {
  const { setPlatformPage, openDrawer } = useAdminShell();
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
        title="Tenants"
        subtitle="Agencies and hubs. Health, plan, entity model, MRR, and quick-jump impersonation."
      />

      <HqCard
        title="Active tenants"
        subtitle={(() => {
          const agencies = PLATFORM_TENANTS.filter((t) => t.entityType === "agency").length;
          const hubs = PLATFORM_TENANTS.filter((t) => t.entityType === "hub").length;
          return `${PLATFORM_TENANTS.length} total · ${agencies} agencies · ${hubs} hubs`;
        })()}
      >
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
              {["Tenant", "Entity", "Plan", "Seats", "Roster", "MRR", "Health", "Last active", ""].map((h) => (
                <th
                  key={h}
                  style={{
                    textAlign: h === "Seats" || h === "Roster" || h === "MRR" ? "right" : "left",
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
  const { openDrawer } = useAdminShell();
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
        <div className="flex items-center gap-2.5">
          <span style={{ fontWeight: 500, color: HQ.ink }}>{tenant.name}</span>
          <span style={{ color: HQ.inkDim, fontFamily: FONTS.mono, fontSize: 11 }}>{tenant.slug}</span>
        </div>
      </td>
      <td style={{ padding: "12px 8px" }}>
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 5,
            padding: "2px 8px",
            background: tenant.entityType === "hub" ? "rgba(11,11,13,0.04)" : "transparent",
            color: HQ.inkMuted,
            border: `1px solid ${HQ.borderSoft}`,
            fontSize: 10.5,
            fontWeight: 600,
            letterSpacing: 0.4,
            textTransform: "uppercase",
            borderRadius: 999,
          }}
        >
          <span style={{ fontSize: 9, opacity: 0.7, letterSpacing: 0 }}>
            {tenant.entityType === "hub" ? "·•·" : "▣"}
          </span>
          {ENTITY_TYPE_META[tenant.entityType].label}
        </span>
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
        <span className="inline-flex items-center gap-1.5">
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
  const { openDrawer } = useAdminShell();
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
        title="Users"
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
  const { openDrawer } = useAdminShell();
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
  const { openDrawer } = useAdminShell();
  return (
    <>
      <PageHeader
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
  const { openDrawer } = useAdminShell();
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
      <div className="flex-1 min-w-0">
        <div style={{ fontSize: 13, fontWeight: 500 }}>{sub.talentName}</div>
        <div style={{ fontSize: 11.5, color: HQ.inkMuted, marginTop: 2 }}>
          {sub.agency} · {sub.submittedAt}
        </div>
      </div>
      <span
        style={{
          padding: "2px 8px",
          background: tone === "green" ? "rgba(93,211,160,0.15)" : tone === "amber" ? "rgba(155,168,183,0.15)" : HQ.cardSoft,
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
  const { openDrawer } = useAdminShell();
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
      <div className="flex-1 min-w-0">
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
  const { state } = useAdminShell();
  const canRefund = HQ_ROLE_META[state.hqRole].canRefund;
  const failedInvoices = PLATFORM_INVOICES.filter((i) => i.status === "failed");
  return (
    <>
      <PageHeader
        title="Billing"
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
  const { openDrawer } = useAdminShell();
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
        title="Operations"
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
  const { openDrawer, state } = useAdminShell();
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
      <div className="flex-1 min-w-0">
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
  const { openDrawer } = useAdminShell();
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
      <div className="flex-1 min-w-0">
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
  const { openDrawer } = useAdminShell();
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
      <div className="flex-1 min-w-0">
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
  const { openDrawer } = useAdminShell();
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
      <div className="flex-1 min-w-0">
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
  const { openDrawer } = useAdminShell();
  return (
    <>
      <PageHeader
        title="HQ settings"
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
              <div className="flex-1 min-w-0">
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
            { label: "Verification methods", id: "platform-verification-methods" as const, desc: "Toggle which trust signals are enabled platform-wide" },
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
              <div className="flex-1">
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
  const { state, closeDrawer } = useAdminShell();
  const open = state.drawer.drawerId === "platform-today-pulse";
  return (
    <DrawerShell
      open={open}
      onClose={closeDrawer}
      title="Platform pulse"
      description="Everything that needs attention right now — incidents, tickets, hub queue."
    >
      <div className="flex flex-col gap-1.5">
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
            <div className="flex-1 min-w-0">
              <div style={{ fontSize: 13, fontWeight: 500 }} className="text-admin-ink">{row.label}</div>
              <div style={{ fontSize: 11.5, marginTop: 2 }} className="text-admin-ink-muted">{row.sub}</div>
            </div>
          </div>
        ))}
      </div>
    </DrawerShell>
  );
}

export function PlatformTenantDetailDrawer() {
  const { state, closeDrawer, openDrawer } = useAdminShell();
  const open = state.drawer.drawerId === "platform-tenant-detail";
  const id = state.drawer.payload?.id as string | undefined;
  const t = PLATFORM_TENANTS.find((t) => t.id === id) ?? PLATFORM_TENANTS[0];
  const canImpersonate = HQ_ROLE_META[state.hqRole].canImpersonate;
  return (
    <DrawerShell
      open={open}
      onClose={closeDrawer}
      title={t.name}
      description={`${ENTITY_TYPE_META[t.entityType].label} · ${PLAN_META[t.plan].label} · ${t.seats} seats · ${t.talentCount} ${
        t.entityType === "hub" ? "members" : "talent"
      } · MRR ${t.mrr}`}
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
      <div
        style={{
          padding: 12,
          background: "rgba(11,11,13,0.03)",
          border: `1px solid ${COLORS.borderSoft}`,
          borderRadius: 10,
          marginBottom: 10,
          fontFamily: FONTS.body,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            marginBottom: 6,
          }}
        >
          <span style={{ fontSize: 11, opacity: 0.7 }}>
            {t.entityType === "hub" ? "·•·" : "▣"}
          </span>
          <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: 0.6, textTransform: "uppercase" }} className="text-admin-ink">
            {ENTITY_TYPE_META[t.entityType].label} · {ENTITY_TYPE_META[t.entityType].tagline}
          </span>
        </div>
        <div style={{ fontSize: 12, lineHeight: 1.5 }} className="text-admin-ink-muted">
          {ENTITY_TYPE_META[t.entityType].inquiryModel}
        </div>
        <div style={{ fontSize: 12, marginTop: 4 }} className="text-admin-ink-dim">
          Revenue: {ENTITY_TYPE_META[t.entityType].revenueModel}
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <DrawerKv label="Slug" value={t.slug} />
        <DrawerKv label="Entity" value={ENTITY_TYPE_META[t.entityType].label} />
        <DrawerKv label="Plan" value={PLAN_META[t.plan].label} />
        <DrawerKv label="Health" value={t.health} />
        <DrawerKv label="Signed up" value={t.signupAt} />
        <DrawerKv label="Last active" value={t.lastActivity} />
      </div>
      <Divider label="Plan controls" />
      <div className="flex flex-col gap-1.5">
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
      <span style={{ width: 110, fontSize: 11.5, fontWeight: 600, letterSpacing: 0.5, textTransform: "uppercase" }} className="text-admin-ink-muted">
        {label}
      </span>
      <span style={{ flex: 1, fontSize: 13 }} className="text-admin-ink">{value}</span>
    </div>
  );
}

export function PlatformTenantImpersonateDrawer() {
  const { state, closeDrawer, startImpersonation, toast } = useAdminShell();
  const open = state.drawer.drawerId === "platform-tenant-impersonate";
  const id = state.drawer.payload?.id as string | undefined;
  const t = PLATFORM_TENANTS.find((t) => t.id === id) ?? PLATFORM_TENANTS[0];
  return (
    <DrawerShell
      open={open}
      onClose={closeDrawer}
      title="Impersonate tenant"
      description={`Preview ${t.name} through the tenant shell. This session is local and read-only.`}
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
                asEntityType: t.entityType,
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
          This preview changes only your HQ shell session. It does not write tenant data, notify the tenant, or create an audit-log entry.
        </span>
      </div>
      <Divider label="What you'll see" />
      <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 6, fontFamily: FONTS.body, fontSize: 13 }} className="text-admin-ink">
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
  const { state, closeDrawer, toast } = useAdminShell();
  const open = state.drawer.drawerId === "platform-tenant-suspend";
  const id = state.drawer.payload?.id as string | undefined;
  const t = PLATFORM_TENANTS.find((t) => t.id === id) ?? PLATFORM_TENANTS[0];
  const emailSuspendRequest = () => {
    requestPlatformSupport(toast, "Tulala tenant suspension request", [
      `Tenant: ${t.name}`,
      `Tenant ID: ${t.id}`,
      `Slug: ${t.slug}`,
      "Please review this suspension request and confirm the operational steps before any tenant access changes.",
    ]);
  };
  return (
    <DrawerShell
      open={open}
      onClose={closeDrawer}
      title="Suspend tenant"
      description={`Email support to start a reviewed suspension request for ${t.name}.`}
      footer={
        <>
          <SecondaryButton onClick={closeDrawer}>Cancel</SecondaryButton>
          <PrimaryButton onClick={emailSuspendRequest}>Email suspension request</PrimaryButton>
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
        This drawer does not lock tenant access by itself. Support must confirm owner notice, billing state, and rollback plan.
      </div>
    </DrawerShell>
  );
}

export function PlatformTenantPlanOverrideDrawer() {
  const { state, closeDrawer, toast } = useAdminShell();
  const open = state.drawer.drawerId === "platform-tenant-plan-override";
  const id = state.drawer.payload?.id as string | undefined;
  const t = PLATFORM_TENANTS.find((t) => t.id === id) ?? PLATFORM_TENANTS[0];
  const [selectedPlan, setSelectedPlan] = useState<PlatformTenant["plan"]>(t.plan);
  useEffect(() => {
    if (open) setSelectedPlan(t.plan);
  }, [open, t.plan]);
  const emailPlanOverrideRequest = () => {
    requestPlatformSupport(toast, "Tulala plan override request", [
      `Tenant: ${t.name}`,
      `Tenant ID: ${t.id}`,
      `Current plan: ${t.plan}`,
      `Requested plan: ${selectedPlan}`,
      "Please review billing impact and apply the override only after approval.",
    ]);
  };
  return (
    <DrawerShell
      open={open}
      onClose={closeDrawer}
      title="Override plan"
      description="Email support to request a reviewed plan override."
      footer={
        <>
          <SecondaryButton onClick={closeDrawer}>Cancel</SecondaryButton>
          <PrimaryButton onClick={emailPlanOverrideRequest}>Email override request</PrimaryButton>
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
            <input type="radio" name="plan-override" checked={selectedPlan === p} onChange={() => setSelectedPlan(p)} />
            <span style={{ flex: 1, fontSize: 13, fontWeight: 500 }} className="text-admin-ink">
              {PLAN_META[p].label}
            </span>
            <span style={{ fontSize: 11.5 }} className="text-admin-ink-muted">{PLAN_META[p].theme}</span>
          </label>
        ))}
      </div>
    </DrawerShell>
  );
}

export function PlatformUserDetailDrawer() {
  const { state, closeDrawer, openDrawer } = useAdminShell();
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
      <div className="flex flex-col gap-1.5">
        <DrawerKv label="Primary tenant" value={u.primaryTenant} />
        <DrawerKv label="Tenants" value={String(u.tenants)} />
        <DrawerKv label="Type" value={u.isTalent ? "Talent" : "Booker / admin"} />
        <DrawerKv label="Last seen" value={u.lastSeen} />
      </div>
    </DrawerShell>
  );
}

export function PlatformUserMergeDrawer() {
  const { state, closeDrawer, toast } = useAdminShell();
  const open = state.drawer.drawerId === "platform-user-merge";
  const emailMergeRequest = () => {
    requestPlatformSupport(toast, "Tulala account merge request", [
      "Please review this account merge request.",
      "The drawer currently has no live merge action or selected canonical target.",
    ]);
  };
  return (
    <DrawerShell
      open={open}
      onClose={closeDrawer}
      title="Merge accounts"
      description="Email support to start a reviewed account merge."
      footer={
        <>
          <SecondaryButton onClick={closeDrawer}>Cancel</SecondaryButton>
          <PrimaryButton onClick={emailMergeRequest}>Email merge request</PrimaryButton>
        </>
      }
    >
      <div style={{ fontFamily: FONTS.body, fontSize: 13, lineHeight: 1.55 }} className="text-admin-ink-muted">
        Merges are irreversible and need a canonical target plus audit approval before support changes account records.
      </div>
    </DrawerShell>
  );
}

export function PlatformUserResetDrawer() {
  const { state, closeDrawer, toast } = useAdminShell();
  const open = state.drawer.drawerId === "platform-user-reset";
  const emailResetRequest = () => {
    requestPlatformSupport(toast, "Tulala password reset request", [
      "Please send a password reset link for the selected platform user.",
      "This drawer has no live auth-email action yet.",
    ]);
  };
  return (
    <DrawerShell
      open={open}
      onClose={closeDrawer}
      title="Send reset email"
      description="Email support to request a password reset link."
      footer={
        <>
          <SecondaryButton onClick={closeDrawer}>Cancel</SecondaryButton>
          <PrimaryButton onClick={emailResetRequest}>Email reset request</PrimaryButton>
        </>
      }
    >
      <div style={{ fontFamily: FONTS.body, fontSize: 13, lineHeight: 1.55 }} className="text-admin-ink-muted">
        Support can verify the user record and trigger the auth provider email from the operational console.
      </div>
    </DrawerShell>
  );
}

export function PlatformHubSubmissionDrawer() {
  const { state, closeDrawer, toast } = useAdminShell();
  const open = state.drawer.drawerId === "platform-hub-submission";
  const id = state.drawer.payload?.id as string | undefined;
  const s = HUB_SUBMISSIONS.find((s) => s.id === id) ?? HUB_SUBMISSIONS[0];
  const emailHubDecision = (decision: string) => {
    requestPlatformSupport(toast, `Tulala hub submission ${decision} request`, [
      `Talent: ${s.talentName}`,
      `Agency: ${s.agency}`,
      `Submission ID: ${s.id}`,
      `Requested decision: ${decision}`,
    ]);
  };
  return (
    <DrawerShell
      open={open}
      onClose={closeDrawer}
      title={s.talentName}
      description={`${s.agency} · submitted ${s.submittedAt}`}
      footer={
        <>
          <SecondaryButton onClick={() => emailHubDecision("decline")}>Email decline request</SecondaryButton>
          <PrimaryButton onClick={() => emailHubDecision("feature")}>Email feature request</PrimaryButton>
        </>
      }
    >
      <div style={{ aspectRatio: "16 / 9", borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 80 }} className="bg-admin-surface-alt">
        ✨
      </div>
      <Divider label="Decision" />
      <p style={{ fontFamily: FONTS.body, fontSize: 13, lineHeight: 1.55 }} className="text-admin-ink-muted">
        Feature on the Tulala hub for 30 days. Featured talent appear at the top of search.
        Decline if profile incomplete or media doesn&apos;t meet quality bar.
      </p>
    </DrawerShell>
  );
}

export function PlatformHubRulesDrawer() {
  const { state, closeDrawer, toast } = useAdminShell();
  const open = state.drawer.drawerId === "platform-hub-rules";
  const emailRulesRequest = () => {
    requestPlatformSupport(toast, "Tulala hub rules change request", [
      "Please review a hub rules change request.",
      "Current visible baseline: featured rotation 30 days; ranking completeness x recency x engagement.",
    ]);
  };
  return (
    <DrawerShell
      open={open}
      onClose={closeDrawer}
      title="Hub rules"
      description="Current rotation, ranking weights, and disqualification policy."
      footer={
        <>
          <SecondaryButton onClick={closeDrawer}>Cancel</SecondaryButton>
          <PrimaryButton onClick={emailRulesRequest}>Email change request</PrimaryButton>
        </>
      }
    >
      <div style={{ fontFamily: FONTS.body, fontSize: 13, lineHeight: 1.6 }} className="text-admin-ink">
        <p>Featured rotation: 30 days · Ranking: completeness × recency × engagement.</p>
      </div>
    </DrawerShell>
  );
}

export function PlatformBillingInvoiceDrawer() {
  const { state, closeDrawer, openDrawer } = useAdminShell();
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
      <div className="flex flex-col gap-1.5">
        <DrawerKv label="Status" value={i.status} />
        <DrawerKv label="Plan" value={PLAN_META[i.plan].label} />
        <DrawerKv label="Date" value={i.date} />
        <DrawerKv label="Amount" value={i.amount} />
      </div>
    </DrawerShell>
  );
}

export function PlatformRefundDrawer() {
  const { state, closeDrawer, toast } = useAdminShell();
  const open = state.drawer.drawerId === "platform-refund";
  const canRefund = HQ_ROLE_META[state.hqRole].canRefund;
  const invoiceId = state.drawer.payload?.invoiceId as string | undefined;
  const tenantId = state.drawer.payload?.tenantId as string | undefined;
  const emailRefundRequest = () => {
    requestPlatformSupport(toast, "Tulala refund review request", [
      `Invoice ID: ${invoiceId ?? "not provided"}`,
      `Tenant ID: ${tenantId ?? "not provided"}`,
      `HQ role: ${state.hqRole}`,
      "Please review payment status and issue any Stripe refund from the billing system if approved.",
    ]);
  };
  return (
    <DrawerShell
      open={open}
      onClose={closeDrawer}
      title="Issue refund"
      description={canRefund ? "Email support to start a reviewed refund." : "Refund requests require billing role."}
      footer={
        canRefund ? (
          <>
            <SecondaryButton onClick={closeDrawer}>Cancel</SecondaryButton>
            <PrimaryButton onClick={emailRefundRequest}>Email refund request</PrimaryButton>
          </>
        ) : (
          <SecondaryButton onClick={closeDrawer}>Close</SecondaryButton>
        )
      }
    >
      <div style={{ fontFamily: FONTS.body, fontSize: 13, lineHeight: 1.55 }} className="text-admin-ink-muted">
        {canRefund
          ? "This drawer does not reverse a Stripe charge by itself. Billing must verify the invoice and apply the refund in the payment system."
          : "Switch your HQ role to Billing or Exec to issue refunds."}
      </div>
    </DrawerShell>
  );
}

export function PlatformDunningDrawer() {
  const { state, closeDrawer, toast } = useAdminShell();
  const open = state.drawer.drawerId === "platform-dunning";
  const invoiceId = state.drawer.payload?.invoiceId as string | undefined;
  const emailDunningRequest = () => {
    requestPlatformSupport(toast, "Tulala dunning retry request", [
      `Invoice ID: ${invoiceId ?? "not provided"}`,
      "Please review the failed payment and manually retry or adjust the dunning queue.",
    ]);
  };
  return (
    <DrawerShell
      open={open}
      onClose={closeDrawer}
      title="Dunning"
      description="Retry rules and follow-up emails for failed payments."
      footer={
        <PrimaryButton onClick={emailDunningRequest}>Email retry request</PrimaryButton>
      }
    >
      <div style={{ fontFamily: FONTS.body, fontSize: 13, lineHeight: 1.6 }} className="text-admin-ink">
        Retry sequence: day 1 → day 3 → day 7. After day 14 the tenant is marked at-risk.
      </div>
    </DrawerShell>
  );
}

export function PlatformFeatureFlagDrawer() {
  const { state, closeDrawer, toast } = useAdminShell();
  const open = state.drawer.drawerId === "platform-feature-flag";
  const id = state.drawer.payload?.id as string | undefined;
  const f = FEATURE_FLAGS.find((f) => f.id === id) ?? FEATURE_FLAGS[0];
  const [selectedState, setSelectedState] = useState<FeatureFlag["state"]>(f.state);
  useEffect(() => {
    if (open) setSelectedState(f.state);
  }, [f.state, open]);
  const emailFlagRequest = () => {
    requestPlatformSupport(toast, "Tulala feature flag change request", [
      `Flag: ${f.name}`,
      `Flag ID: ${f.id}`,
      `Current state: ${f.state}`,
      `Requested state: ${selectedState}`,
      f.rollout ? `Current rollout: ${f.rollout}` : "Current rollout: none",
    ]);
  };
  return (
    <DrawerShell
      open={open}
      onClose={closeDrawer}
      title={f.name}
      description={f.description}
      footer={
        <>
          <SecondaryButton onClick={closeDrawer}>Cancel</SecondaryButton>
          <PrimaryButton onClick={emailFlagRequest}>Email flag request</PrimaryButton>
        </>
      }
    >
      <div className="flex flex-col gap-1.5">
        <DrawerKv label="State" value={f.state} />
        <DrawerKv label="Owner" value={f.owner} />
        {f.rollout && <DrawerKv label="Rollout" value={f.rollout} />}
      </div>
      <Divider label="Set state" />
      <div className="flex gap-2">
        {(["off", "rollout", "on"] as const).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setSelectedState(s)}
            style={{
              flex: 1,
              padding: "10px 12px",
              background: selectedState === s ? COLORS.fill : "#fff",
              color: selectedState === s ? "#fff" : COLORS.ink,
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
  const { state, closeDrawer, toast } = useAdminShell();
  const open = state.drawer.drawerId === "platform-moderation-item";
  const id = state.drawer.payload?.id as string | undefined;
  const m = MODERATION_QUEUE.find((m) => m.id === id) ?? MODERATION_QUEUE[0];
  const emailModerationRequest = (action: string) => {
    requestPlatformSupport(toast, `Tulala moderation ${action} request`, [
      `Subject: ${m.subject}`,
      `Moderation ID: ${m.id}`,
      `Kind: ${m.kind}`,
      `Reason: ${m.reason}`,
      `Severity: ${m.severity}`,
      `Requested action: ${action}`,
    ]);
  };
  return (
    <DrawerShell
      open={open}
      onClose={closeDrawer}
      title="Moderation item"
      description={m.subject}
      footer={
        <>
          <SecondaryButton onClick={() => emailModerationRequest("clear")}>Email clear request</SecondaryButton>
          <PrimaryButton onClick={() => emailModerationRequest("action")}>Email action request</PrimaryButton>
        </>
      }
    >
      <div className="flex flex-col gap-1.5">
        <DrawerKv label="Kind" value={m.kind} />
        <DrawerKv label="Reason" value={m.reason} />
        <DrawerKv label="Severity" value={m.severity} />
        <DrawerKv label="Reported" value={m.reportedAt} />
      </div>
    </DrawerShell>
  );
}

export function PlatformSystemJobDrawer() {
  const { state, closeDrawer, toast } = useAdminShell();
  const open = state.drawer.drawerId === "platform-system-job";
  const id = state.drawer.payload?.id as string | undefined;
  const j = SYSTEM_JOBS.find((j) => j.id === id) ?? SYSTEM_JOBS[0];
  const emailJobRequest = (action: string) => {
    requestPlatformSupport(toast, `Tulala system job ${action} request`, [
      `Job: ${j.name}`,
      `Job ID: ${j.id}`,
      `State: ${j.state}`,
      `Last run: ${j.lastRun}`,
      `Requested action: ${action}`,
    ]);
  };
  return (
    <DrawerShell
      open={open}
      onClose={closeDrawer}
      title={j.name}
      description={`Last run ${j.lastRun} · duration ${j.duration}`}
      footer={
        <>
          <SecondaryButton onClick={() => emailJobRequest("logs")}>Email logs request</SecondaryButton>
          <PrimaryButton onClick={() => emailJobRequest("re-run")}>Email re-run request</PrimaryButton>
        </>
      }
    >
      <div className="flex flex-col gap-1.5">
        <DrawerKv label="State" value={j.state} />
      </div>
    </DrawerShell>
  );
}

export function PlatformIncidentDrawer() {
  const { state, closeDrawer, toast } = useAdminShell();
  const open = state.drawer.drawerId === "platform-incident";
  const id = state.drawer.payload?.id as string | undefined;
  const i = PLATFORM_INCIDENTS.find((i) => i.id === id) ?? PLATFORM_INCIDENTS[0];
  const emailIncidentRequest = (action: string) => {
    requestPlatformSupport(toast, `Tulala incident ${action} request`, [
      `Incident: ${i.title}`,
      `Incident ID: ${i.id}`,
      `Severity: ${i.severity}`,
      `Current state: ${i.state}`,
      `Started: ${i.startedAt}`,
      `Requested action: ${action}`,
    ]);
  };
  return (
    <DrawerShell
      open={open}
      onClose={closeDrawer}
      title={i.title}
      description={`${i.severity.toUpperCase()} · ${i.state} · started ${i.startedAt}`}
      footer={
        <>
          <SecondaryButton onClick={() => emailIncidentRequest("status update")}>Email status request</SecondaryButton>
          <PrimaryButton onClick={() => emailIncidentRequest("resolution")}>Email resolution request</PrimaryButton>
        </>
      }
    >
      <div style={{ fontFamily: FONTS.body, fontSize: 13, lineHeight: 1.55 }} className="text-admin-ink-muted">
        This drawer does not post to the public status page. Support must verify monitoring and publish any status update.
      </div>
    </DrawerShell>
  );
}

export function PlatformSupportTicketDrawer() {
  const { state, closeDrawer, toast } = useAdminShell();
  const open = state.drawer.drawerId === "platform-support-ticket";
  const id = state.drawer.payload?.id as string | undefined;
  const t = SUPPORT_TICKETS.find((t) => t.id === id) ?? SUPPORT_TICKETS[0];
  const emailTicketRequest = (action: string) => {
    requestPlatformSupport(toast, `Tulala support ticket ${action} request`, [
      `Ticket: ${t.subject}`,
      `Ticket ID: ${t.id}`,
      `Tenant: ${t.tenant}`,
      `Reporter: ${t.reportedBy}`,
      `Current state: ${t.state}`,
      `Requested action: ${action}`,
    ]);
  };
  return (
    <DrawerShell
      open={open}
      onClose={closeDrawer}
      title={t.subject}
      description={`${t.tenant} · ${t.reportedBy} · ${t.ageHrs}h ago`}
      footer={
        <>
          <SecondaryButton onClick={() => emailTicketRequest("reply")}>Email reply request</SecondaryButton>
          <PrimaryButton onClick={() => emailTicketRequest("resolution")}>Email resolution request</PrimaryButton>
        </>
      }
    >
      <div className="flex flex-col gap-1.5">
        <DrawerKv label="State" value={t.state} />
        <DrawerKv label="Tenant" value={t.tenant} />
        <DrawerKv label="Reporter" value={t.reportedBy} />
      </div>
    </DrawerShell>
  );
}

export function PlatformAuditExportDrawer() {
  const { state, closeDrawer, toast } = useAdminShell();
  const open = state.drawer.drawerId === "platform-audit-export";
  const emailAuditRequest = () => {
    requestPlatformSupport(toast, "Tulala audit export request", [
      "Please prepare the last 90 days of HQ actions as CSV.",
      "Requested scope: impersonations, refunds, plan overrides, flag changes, suspensions.",
    ]);
  };
  return (
    <DrawerShell
      open={open}
      onClose={closeDrawer}
      title="Audit export"
      description="Export the last 90 days of HQ actions as CSV."
      footer={
        <PrimaryButton onClick={emailAuditRequest}>Email export request</PrimaryButton>
      }
    >
      <div style={{ fontFamily: FONTS.body, fontSize: 13, lineHeight: 1.55 }} className="text-admin-ink-muted">
        Includes impersonations, refunds, plan overrides, flag changes, suspensions.
      </div>
    </DrawerShell>
  );
}

export function PlatformHqTeamDrawer() {
  const { state, closeDrawer, toast } = useAdminShell();
  const open = state.drawer.drawerId === "platform-hq-team";
  const emailInviteRequest = () => {
    requestPlatformSupport(toast, "Tulala HQ team invite request", [
      "Please review a new HQ team invite request.",
      "The drawer currently has no member email input or live invite action.",
    ]);
  };
  return (
    <DrawerShell
      open={open}
      onClose={closeDrawer}
      title="HQ team"
      description="Tulala employees with HQ access."
      footer={
        <PrimaryButton onClick={emailInviteRequest}>Email invite request</PrimaryButton>
      }
    >
      <div className="flex flex-col gap-1.5">
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
            <div className="flex-1 min-w-0">
              <div style={{ fontSize: 13, fontWeight: 500 }} className="text-admin-ink">{m.name}</div>
              <div style={{ fontSize: 11.5, marginTop: 2 }} className="text-admin-ink-muted">{m.email}</div>
            </div>
            <span style={{ padding: "2px 8px", background: "rgba(11,11,13,0.04)", fontSize: 10.5, fontWeight: 600, letterSpacing: 0.4, textTransform: "uppercase", borderRadius: 999 }} className="text-admin-ink">
              {m.role}
            </span>
          </div>
        ))}
      </div>
    </DrawerShell>
  );
}

export function PlatformRegionConfigDrawer() {
  const { state, closeDrawer, toast } = useAdminShell();
  const open = state.drawer.drawerId === "platform-region-config";
  const emailRegionRequest = () => {
    requestPlatformSupport(toast, "Tulala region config request", [
      "Please review a region configuration change request.",
      "Current visible baseline: EU eu-west-1 Stripe EU; NA us-east-1 Stripe US; APAC ap-southeast-1 Stripe APAC.",
    ]);
  };
  return (
    <DrawerShell
      open={open}
      onClose={closeDrawer}
      title="Region config"
      description="Routing rules per region (data residency, payment gateway, CDN)."
      footer={
        <PrimaryButton onClick={emailRegionRequest}>Email change request</PrimaryButton>
      }
    >
      <div className="flex flex-col gap-1.5">
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
            <span style={{ padding: "2px 8px", color: "#fff", fontSize: 10.5, fontWeight: 700, letterSpacing: 0.5, borderRadius: 6 }} className="bg-admin-fill">
              {r.region}
            </span>
            <span style={{ flex: 1, fontSize: 13 }} className="text-admin-ink">
              {r.db} · {r.payment}
            </span>
          </div>
        ))}
      </div>
    </DrawerShell>
  );
}
