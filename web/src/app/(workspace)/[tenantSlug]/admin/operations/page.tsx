// Phase 3 — workspace Operations page.
// Static tools hub matching the prototype's OperationsPage() structure.
// No real data required — this is a navigation surface to feature sub-pages.

import { notFound } from "next/navigation";
import { getTenantScopeBySlug } from "@/lib/saas/scope";
import { userHasCapability } from "@/lib/access";

export const dynamic = "force-dynamic";
type PageParams = Promise<{ tenantSlug: string }>;

// ─── Design tokens ────────────────────────────────────────────────────────────

const C = {
  ink:        "#0B0B0D",
  inkMuted:   "rgba(11,11,13,0.55)",
  inkDim:     "rgba(11,11,13,0.35)",
  border:     "rgba(24,24,27,0.08)",
  borderSoft: "rgba(24,24,27,0.06)",
  surface:    "#FAFAF7",
  white:      "#ffffff",
  accent:     "#0F4F3E",
  accentSoft: "rgba(15,79,62,0.07)",
  indigo:     "#3B5E9E",
  indigoSoft: "rgba(59,94,158,0.07)",
  amber:      "#8A6F1A",
  amberSoft:  "rgba(212,160,23,0.07)",
  coral:      "#B04A22",
  coralSoft:  "rgba(176,74,34,0.07)",
  royal:      "#5B3C8C",
  royalSoft:  "rgba(91,60,140,0.07)",
} as const;

const FONT = '"Inter", system-ui, sans-serif';

// ─── Section component ────────────────────────────────────────────────────────

function Section({
  tone,
  toneText,
  toneSoft,
  title,
  description,
  children,
}: {
  tone: string;
  toneText: string;
  toneSoft: string;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div style={{ marginBottom: 32 }}>
      {/* Section header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          marginBottom: 4,
        }}
      >
        <span
          aria-hidden
          style={{
            width: 8,
            height: 8,
            borderRadius: "50%",
            background: tone,
            flexShrink: 0,
          }}
        />
        <h2
          style={{
            fontFamily: FONT,
            fontSize: 15,
            fontWeight: 600,
            color: C.ink,
            margin: 0,
            letterSpacing: -0.1,
          }}
        >
          {title}
        </h2>
      </div>
      <p
        style={{
          fontFamily: FONT,
          fontSize: 12,
          color: C.inkMuted,
          marginBottom: 12,
          marginLeft: 18,
          lineHeight: 1.4,
        }}
      >
        {description}
      </p>
      {/* Tool rows */}
      <div
        style={{
          background: C.white,
          border: `1px solid ${C.borderSoft}`,
          borderRadius: 12,
          overflow: "hidden",
        }}
      >
        {children}
      </div>
    </div>
  );
}

// ─── Tool row component ───────────────────────────────────────────────────────

function ToolRow({
  tone,
  toneSoft,
  icon,
  title,
  description,
  href,
  comingSoon,
}: {
  tone: string;
  toneSoft: string;
  icon: string;
  title: string;
  description: string;
  href?: string;
  comingSoon?: boolean;
}) {
  return (
    <a
      href={href ?? "#"}
      aria-disabled={!href}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 14,
        padding: "14px 18px",
        borderTop: "1px solid transparent",
        textDecoration: "none",
        cursor: href ? "pointer" : "default",
        transition: "background 0.12s",
        opacity: comingSoon ? 0.6 : 1,
      }}
      onMouseEnter={
        href
          ? (e) => (e.currentTarget.style.background = "rgba(11,11,13,0.025)")
          : undefined
      }
      onMouseLeave={
        href
          ? (e) => (e.currentTarget.style.background = "transparent")
          : undefined
      }
    >
      {/* Icon badge */}
      <div
        style={{
          width: 34,
          height: 34,
          borderRadius: 8,
          background: toneSoft,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 16,
          flexShrink: 0,
        }}
      >
        {icon}
      </div>
      {/* Text */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontFamily: FONT,
            fontSize: 13.5,
            fontWeight: 600,
            color: C.ink,
            letterSpacing: -0.1,
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          {title}
          {comingSoon && (
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                padding: "1px 6px",
                borderRadius: 999,
                background: "rgba(11,11,13,0.05)",
                color: C.inkDim,
                fontSize: 10,
                fontWeight: 600,
                letterSpacing: 0.3,
                textTransform: "uppercase" as const,
                fontFamily: FONT,
              }}
            >
              Soon
            </span>
          )}
        </div>
        <div
          style={{
            fontFamily: FONT,
            fontSize: 12,
            color: C.inkMuted,
            marginTop: 1,
            lineHeight: 1.4,
          }}
        >
          {description}
        </div>
      </div>
      {/* Chevron for linked items */}
      {href && (
        <span style={{ fontSize: 16, color: C.inkDim, flexShrink: 0 }}>›</span>
      )}
    </a>
  );
}

// ─── Separator within a section ───────────────────────────────────────────────

function Divider() {
  return (
    <div
      style={{
        height: 1,
        background: C.borderSoft,
        marginLeft: 18,
      }}
    />
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function WorkspaceOperationsPage({
  params,
}: {
  params: PageParams;
}) {
  const { tenantSlug } = await params;
  const scope = await getTenantScopeBySlug(tenantSlug);
  if (!scope) notFound();
  const canView = await userHasCapability("agency.workspace.view", scope.tenantId);
  if (!canView) notFound();

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 0, maxWidth: 760 }}>

      {/* ── Header ── */}
      <div style={{ marginBottom: 28 }}>
        <p
          style={{
            fontFamily: FONT,
            fontSize: 11,
            fontWeight: 600,
            color: C.inkMuted,
            letterSpacing: 0.8,
            textTransform: "uppercase",
            marginBottom: 4,
          }}
        >
          Workspace
        </p>
        <h1
          style={{
            fontFamily: FONT,
            fontSize: 26,
            fontWeight: 600,
            color: C.ink,
            letterSpacing: -0.4,
            margin: 0,
          }}
        >
          Operations
        </h1>
        <p
          style={{
            fontFamily: FONT,
            fontSize: 12.5,
            color: C.inkMuted,
            marginTop: 4,
            lineHeight: 1.4,
          }}
        >
          Analytics, queues, SLAs, automations, and team workload.
        </p>
      </div>

      {/* ── Analytics ── */}
      <Section
        tone={C.indigo}
        toneText={C.indigo}
        toneSoft={C.indigoSoft}
        title="Analytics"
        description="Revenue, conversion, and team performance."
      >
        <ToolRow tone={C.indigo} toneSoft={C.indigoSoft} icon="📈" title="Revenue" description="Monthly revenue, top clients, and trend." comingSoon />
        <Divider />
        <ToolRow tone={C.indigo} toneSoft={C.indigoSoft} icon="🔀" title="Conversion funnel" description="Inquiry → offer → booking conversion." comingSoon />
        <Divider />
        <ToolRow tone={C.indigo} toneSoft={C.indigoSoft} icon="⭐" title="Top performers" description="Most-booked talent and best clients." comingSoon />
        <Divider />
        <ToolRow tone={C.indigo} toneSoft={C.indigoSoft} icon="👥" title="Team workload" description="Per-coordinator queue depth and SLA risk." comingSoon />
      </Section>

      {/* ── Workflow ── */}
      <Section
        tone={C.accent}
        toneText={C.accent}
        toneSoft={C.accentSoft}
        title="Workflow"
        description="Coordinator queue, response timers, and automation rules."
      >
        <ToolRow tone={C.accent} toneSoft={C.accentSoft} icon="📋" title="My queue" description="Items assigned to you, sorted by priority." href={`/${tenantSlug}/admin/work`} />
        <Divider />
        <ToolRow tone={C.accent} toneSoft={C.accentSoft} icon="⏱" title="SLA timers" description="Response-time clocks and escalation paths." comingSoon />
        <Divider />
        <ToolRow tone={C.accent} toneSoft={C.accentSoft} icon="⚡" title="Automation rules" description="Trigger actions on status, deadlines, or fields." comingSoon />
        <Divider />
        <ToolRow tone={C.accent} toneSoft={C.accentSoft} icon="💬" title="Saved replies" description="Canned response library for inbox threads." comingSoon />
        <Divider />
        <ToolRow tone={C.accent} toneSoft={C.accentSoft} icon="✈️" title="Vacation handover" description="Delegate your queue while you're away." comingSoon />
        <Divider />
        <ToolRow tone={C.accent} toneSoft={C.accentSoft} icon="🔄" title="On-call rotation" description="Weekly schedule and escalation ladder." comingSoon />
      </Section>

      {/* ── Comms & growth ── */}
      <Section
        tone={C.amber}
        toneText={C.amber}
        toneSoft={C.amberSoft}
        title="Comms & growth"
        description="Outbound email, sequences, and the referral programme."
      >
        <ToolRow tone={C.amber} toneSoft={C.amberSoft} icon="📧" title="Email templates" description="Outbound templates with merge fields." comingSoon />
        <Divider />
        <ToolRow tone={C.amber} toneSoft={C.amberSoft} icon="📨" title="Email sequences" description="Multi-step automated follow-ups." comingSoon />
        <Divider />
        <ToolRow tone={C.amber} toneSoft={C.amberSoft} icon="🔗" title="Invite flow" description="Send pre-filled talent invite links." href={`/${tenantSlug}/admin/roster`} />
        <Divider />
        <ToolRow tone={C.amber} toneSoft={C.amberSoft} icon="🎁" title="Referrals" description="Track referrals, conversions, and credits." comingSoon />
      </Section>

      {/* ── Admin tools ── */}
      <Section
        tone={C.royal}
        toneText={C.royal}
        toneSoft={C.royalSoft}
        title="Admin tools"
        description="Bulk operations, AI workspace, telemetry, and feature controls."
      >
        <ToolRow tone={C.royal} toneSoft={C.royalSoft} icon="📤" title="CSV import" description="Bulk import talent, clients, or bookings." comingSoon />
        <Divider />
        <ToolRow tone={C.royal} toneSoft={C.royalSoft} icon="↔️" title="Migration assistant" description="Move data from your current platform." comingSoon />
        <Divider />
        <ToolRow tone={C.royal} toneSoft={C.royalSoft} icon="✨" title="AI workspace" description="Providers, usage controls, and console." comingSoon />
        <Divider />
        <ToolRow tone={C.royal} toneSoft={C.royalSoft} icon="🎛" title="Feature controls" description="Turn platform features on or off per workspace." href={`/${tenantSlug}/admin/settings`} />
      </Section>

    </div>
  );
}
