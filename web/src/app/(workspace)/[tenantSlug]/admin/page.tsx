// Phase 3 — workspace Overview page.
// Server Component — no "use client".
//
// Matches the prototype's topbar-layout Overview design:
//   - WorkspaceActivationBanner (dismissable onboarding checklist)
//   - TodaysFocusCard (urgency signal from real inquiry data)
//   - Personalized greeting (client component, browser local time)
//   - Stat strip: rostered / open inquiries / team / pending
//   - 2-col primary card grid (What needs you + Pipeline)
//   - 3-col secondary card grid (Drafts, Awaiting, Activity + Operations/Production)
//   - Quick-action tiles: Talent, Work, Clients, Settings

import { notFound } from "next/navigation";
import Link from "next/link";
import { getTenantScopeBySlug } from "@/lib/saas/scope";
import { getCachedActorSession } from "@/lib/server/request-cache";
import { loadWorkspaceOverviewMetrics } from "../_data-bridge";
import { OverviewGreeting } from "./overview-greeting";
import { TodaysFocusCard } from "./todays-focus-card";
import { WorkspaceActivationBanner } from "./activation-banner";

export const dynamic = "force-dynamic";

type PageParams = Promise<{ tenantSlug: string }>;

// ─── Design tokens ────────────────────────────────────────────────────────────

const C = {
  ink:        "#0B0B0D",
  inkMuted:   "rgba(11,11,13,0.55)",
  inkDim:     "rgba(11,11,13,0.35)",
  border:     "rgba(24,24,27,0.08)",
  borderSoft: "rgba(24,24,27,0.06)",
  cardBg:     "#ffffff",
  accent:     "#0F4F3E",
  accentSoft: "rgba(15,79,62,0.06)",
  green:      "#2E7D5B",
  amber:      "#8A6F1A",
  amberSoft:  "rgba(138,111,26,0.08)",
  blue:       "#2B5F8A",
  blueSoft:   "rgba(43,95,138,0.07)",
  coral:      "#B04A22",
  indigo:     "#3B5E9E",
  indigoSoft: "rgba(59,94,158,0.07)",
} as const;

const FONT = '"Inter", system-ui, sans-serif';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function userDisplayName(
  email: string | null | undefined,
  meta: Record<string, unknown> | undefined,
): string {
  if (meta?.full_name && typeof meta.full_name === "string") return meta.full_name;
  if (meta?.name && typeof meta.name === "string") return meta.name;
  if (email) return email.split("@")[0].replace(/[._-]/g, " ");
  return "you";
}

function titleCase(s: string): string {
  return s.replace(/\b\w/g, (c) => c.toUpperCase());
}

// ─── Stat item ────────────────────────────────────────────────────────────────

function StatItem({
  dot,
  label,
  value,
  href,
  tenantSlug,
}: {
  dot: string;
  label: string;
  value: number;
  href: string;
  tenantSlug: string;
}) {
  return (
    <Link
      href={`/${tenantSlug}/admin/${href}`}
      style={{ display: "flex", flexDirection: "column", gap: 6, textDecoration: "none", minWidth: 80 }}
    >
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          fontFamily: FONT,
          fontSize: 11,
          fontWeight: 500,
          color: C.inkDim,
          letterSpacing: 0.1,
        }}
      >
        <span
          aria-hidden
          style={{ width: 6, height: 6, borderRadius: "50%", background: dot, flexShrink: 0 }}
        />
        {label}
      </span>
      <span style={{ fontFamily: FONT, fontSize: 32, fontWeight: 600, color: C.ink, letterSpacing: -1, lineHeight: 1 }}>
        {value}
      </span>
    </Link>
  );
}

// ─── Quick-action tile ────────────────────────────────────────────────────────

function QuickTile({
  label,
  description,
  href,
}: {
  label: string;
  description: string;
  href: string;
}) {
  return (
    <Link
      href={href}
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 6,
        background: C.cardBg,
        border: `1px solid ${C.border}`,
        borderRadius: 12,
        padding: "16px 18px",
        textDecoration: "none",
        transition: "border-color 120ms",
      }}
    >
      <span style={{ fontFamily: FONT, fontSize: 13, fontWeight: 600, color: C.ink, letterSpacing: -0.1 }}>
        {label} →
      </span>
      <span style={{ fontFamily: FONT, fontSize: 12, color: C.inkMuted, lineHeight: 1.4 }}>
        {description}
      </span>
    </Link>
  );
}

// ─── Primary card (2-up grid, prominent) ─────────────────────────────────────

function PrimaryCard({
  title,
  description,
  meta,
  affordance,
  href,
  tone,
  toneSoft,
}: {
  title: string;
  description: string;
  meta?: string;
  affordance: string;
  href: string;
  tone?: string;
  toneSoft?: string;
}) {
  return (
    <Link
      href={href}
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 10,
        background: C.cardBg,
        border: `1px solid ${C.borderSoft}`,
        borderRadius: 14,
        padding: "20px 20px 16px",
        textDecoration: "none",
        transition: "border-color 120ms, box-shadow 120ms",
      }}
    >
      <div
        style={{
          fontFamily: FONT,
          fontSize: 14,
          fontWeight: 700,
          color: C.ink,
          letterSpacing: -0.2,
        }}
      >
        {title}
      </div>
      <div
        style={{
          fontFamily: FONT,
          fontSize: 12.5,
          color: C.inkMuted,
          lineHeight: 1.5,
          flex: 1,
        }}
      >
        {description}
      </div>
      {meta && (
        <div style={{ fontFamily: FONT, fontSize: 11, color: tone ?? C.inkDim, fontWeight: 500 }}>
          {meta}
        </div>
      )}
      <div
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          fontFamily: FONT,
          fontSize: 12,
          fontWeight: 600,
          color: tone ?? C.accent,
          letterSpacing: -0.05,
        }}
      >
        {affordance} →
      </div>
    </Link>
  );
}

// ─── Secondary card (3-col grid) ─────────────────────────────────────────────

function SecondaryCard({
  title,
  description,
  meta,
  affordance,
  href,
}: {
  title: string;
  description: string;
  meta?: string;
  affordance: string;
  href: string;
}) {
  return (
    <Link
      href={href}
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 6,
        background: C.cardBg,
        border: `1px solid ${C.borderSoft}`,
        borderRadius: 12,
        padding: "16px 16px 14px",
        textDecoration: "none",
        transition: "border-color 120ms",
      }}
    >
      <div style={{ fontFamily: FONT, fontSize: 13, fontWeight: 600, color: C.ink, letterSpacing: -0.1 }}>
        {title}
      </div>
      <div style={{ fontFamily: FONT, fontSize: 12, color: C.inkMuted, lineHeight: 1.4, flex: 1 }}>
        {description}
      </div>
      {meta && (
        <div style={{ fontFamily: FONT, fontSize: 11, color: C.inkMuted, fontWeight: 500 }}>
          {meta}
        </div>
      )}
      <div style={{ fontFamily: FONT, fontSize: 11.5, fontWeight: 600, color: C.accent, marginTop: 2 }}>
        {affordance} →
      </div>
    </Link>
  );
}

// ─── Nav tile (Operations / Production pointers) ──────────────────────────────

function NavTile({
  icon,
  title,
  description,
  href,
}: {
  icon: string;
  title: string;
  description: string;
  href: string;
}) {
  return (
    <Link
      href={href}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 14,
        padding: "16px 18px",
        background: C.cardBg,
        border: `1px solid ${C.borderSoft}`,
        borderRadius: 14,
        textDecoration: "none",
        transition: "border-color 120ms",
      }}
    >
      <div
        style={{
          width: 40,
          height: 40,
          borderRadius: 10,
          background: C.accentSoft,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 20,
          flexShrink: 0,
        }}
      >
        {icon}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontFamily: FONT, fontSize: 14, fontWeight: 700, color: C.ink, letterSpacing: -0.1 }}>
          {title}
        </div>
        <div style={{ fontFamily: FONT, fontSize: 12, color: C.inkMuted, marginTop: 2, lineHeight: 1.3 }}>
          {description}
        </div>
      </div>
      <span style={{ fontSize: 16, color: C.inkDim, flexShrink: 0 }}>›</span>
    </Link>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function WorkspaceAdminOverviewPage({
  params,
}: {
  params: PageParams;
}) {
  const { tenantSlug } = await params;

  const [scope, session, metrics] = await Promise.all([
    getTenantScopeBySlug(tenantSlug),
    getCachedActorSession(),
    (async () => {
      const s = await getTenantScopeBySlug(tenantSlug);
      if (!s) return null;
      return loadWorkspaceOverviewMetrics(s.tenantId);
    })(),
  ]);

  if (!scope) notFound();

  const userName = titleCase(
    userDisplayName(
      session.user?.email,
      session.user?.user_metadata as Record<string, unknown> | undefined,
    ),
  );

  const m = metrics ?? {
    rosterTotal: 0,
    rosterPublished: 0,
    openInquiries: 0,
    teamMembers: 0,
    pendingApprovals: 0,
    awaitingClientCount: 0,
    draftInquiryCount: 0,
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 32 }}>

      {/* ── Activation banner (dismissable, client) ── */}
      <WorkspaceActivationBanner
        tenantSlug={tenantSlug}
        hasRoster={m.rosterTotal > 0}
        hasInquiry={m.openInquiries > 0}
      />

      {/* ── Today's focus card (client, only shows when there's urgency) ── */}
      <TodaysFocusCard
        awaitingClientCount={m.awaitingClientCount}
        draftCount={m.draftInquiryCount}
        tenantSlug={tenantSlug}
      />

      {/* ── Greeting row ── */}
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 16,
          flexWrap: "wrap",
        }}
      >
        <OverviewGreeting userName={userName} />

        <Link
          href={`/${tenantSlug}/admin/work`}
          style={{
            display: "inline-flex",
            alignItems: "center",
            height: 36,
            padding: "0 16px",
            borderRadius: 8,
            background: C.accent,
            color: "#fff",
            fontFamily: FONT,
            fontSize: 13,
            fontWeight: 600,
            textDecoration: "none",
            letterSpacing: -0.1,
            flexShrink: 0,
          }}
        >
          + New inquiry
        </Link>
      </div>

      {/* ── Stat strip ── */}
      <div
        style={{
          display: "flex",
          gap: 40,
          flexWrap: "wrap",
          paddingBottom: 24,
          borderBottom: `1px solid ${C.border}`,
        }}
      >
        <StatItem dot={C.green}  label="Rostered"       value={m.rosterTotal}      href="roster"   tenantSlug={tenantSlug} />
        <StatItem dot={C.amber}  label="Open inquiries" value={m.openInquiries}     href="work"     tenantSlug={tenantSlug} />
        <StatItem dot={C.blue}   label="Team"           value={m.teamMembers}       href="settings" tenantSlug={tenantSlug} />
        {m.pendingApprovals > 0 && (
          <StatItem dot={C.coral} label="Pending approvals" value={m.pendingApprovals} href="roster" tenantSlug={tenantSlug} />
        )}
        {m.awaitingClientCount > 0 && (
          <StatItem dot="#D4A017" label="Awaiting client" value={m.awaitingClientCount} href="work" tenantSlug={tenantSlug} />
        )}
      </div>

      {/* ── Primary 2-col card row ── */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
          gap: 12,
        }}
      >
        <PrimaryCard
          title="What needs you today"
          description={
            m.awaitingClientCount + m.draftInquiryCount > 0
              ? `${m.awaitingClientCount} ${m.awaitingClientCount === 1 ? "inquiry" : "inquiries"} awaiting client decision and ${m.draftInquiryCount} ${m.draftInquiryCount === 1 ? "draft hasn't" : "drafts haven't"} been sent.`
              : "You're all caught up — no urgent actions right now."
          }
          meta={
            m.awaitingClientCount + m.draftInquiryCount > 0
              ? `${m.awaitingClientCount + m.draftInquiryCount} item${m.awaitingClientCount + m.draftInquiryCount === 1 ? "" : "s"} need attention`
              : undefined
          }
          affordance="Open pipeline"
          href={`/${tenantSlug}/admin/work`}
          tone={m.awaitingClientCount + m.draftInquiryCount > 0 ? "#8A6F1A" : C.accent}
        />
        <PrimaryCard
          title="Workflow"
          description="Every inquiry grouped by where it's stuck — from first brief to confirmed booking."
          meta={
            m.openInquiries > 0
              ? `${m.openInquiries} active · ${m.awaitingClientCount} awaiting client`
              : "No open inquiries"
          }
          affordance="Open workflow"
          href={`/${tenantSlug}/admin/work`}
        />
      </div>

      {/* ── Secondary 3-col card row ── */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
          gap: 10,
        }}
      >
        <SecondaryCard
          title="Drafts & holds"
          description="Inquiries you started but haven't sent."
          meta={`${m.draftInquiryCount} item${m.draftInquiryCount === 1 ? "" : "s"}`}
          affordance="Review"
          href={`/${tenantSlug}/admin/work`}
        />
        <SecondaryCard
          title="Sent — waiting"
          description="Offers sent. Waiting on the client to confirm."
          meta={`${m.awaitingClientCount} item${m.awaitingClientCount === 1 ? "" : "s"}`}
          affordance="Review"
          href={`/${tenantSlug}/admin/work`}
        />
        <SecondaryCard
          title="Talent roster"
          description="Manage your talent, drafts, and approvals."
          meta={`${m.rosterTotal} rostered · ${m.rosterPublished} published`}
          affordance="Open roster"
          href={`/${tenantSlug}/admin/roster`}
        />
        <SecondaryCard
          title="Clients"
          description="Client accounts and booking history."
          affordance="Open clients"
          href={`/${tenantSlug}/admin/clients`}
        />
      </div>

      {/* ── Nav tiles: Operations + Production ── */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
          gap: 12,
          marginTop: 4,
        }}
      >
        <NavTile
          icon="⚡"
          title="Operations"
          description="Analytics, queues, automations, comms."
          href={`/${tenantSlug}/admin/operations`}
        />
        <NavTile
          icon="🎬"
          title="Production"
          description="Casting, crew, on-set, rights & safety."
          href={`/${tenantSlug}/admin/production`}
        />
      </div>

    </div>
  );
}
