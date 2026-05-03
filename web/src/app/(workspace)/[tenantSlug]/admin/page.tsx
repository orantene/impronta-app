// Phase 3 — workspace Overview page.
// Server Component — no "use client".
//
// Matches the prototype's topbar-layout Overview design:
//   - Personalized greeting (client component, browser local time)
//   - Stat strip: rostered / open inquiries / team / pending
//   - Quick-action tiles: Talent, Work, Clients, Settings

import { notFound } from "next/navigation";
import Link from "next/link";
import { getTenantScopeBySlug } from "@/lib/saas/scope";
import { getCachedActorSession } from "@/lib/server/request-cache";
import { loadWorkspaceOverviewMetrics } from "../_data-bridge";
import { OverviewGreeting } from "./overview-greeting";

export const dynamic = "force-dynamic";

type PageParams = Promise<{ tenantSlug: string }>;

// ─── Design tokens (matching layout.tsx) ─────────────────────────────────────

const C = {
  ink:        "#0B0B0D",
  inkMuted:   "rgba(11,11,13,0.55)",
  inkDim:     "rgba(11,11,13,0.35)",
  border:     "rgba(24,24,27,0.08)",
  cardBg:     "#ffffff",
  accent:     "#0F4F3E",
  green:      "#2E7D5B",
  amber:      "#8A6F1A",
  blue:       "#2B5F8A",
  coral:      "#B04A22",
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

// Capitalise first letter of each word
function titleCase(s: string): string {
  return s.replace(/\b\w/g, (c) => c.toUpperCase());
}

// ─── Stat item (one column in the strip) ─────────────────────────────────────

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
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 6,
        textDecoration: "none",
        minWidth: 80,
      }}
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
          style={{
            width: 6,
            height: 6,
            borderRadius: "50%",
            background: dot,
            flexShrink: 0,
          }}
        />
        {label}
      </span>
      <span
        style={{
          fontFamily: FONT,
          fontSize: 32,
          fontWeight: 600,
          color: C.ink,
          letterSpacing: -1,
          lineHeight: 1,
        }}
      >
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
      <span
        style={{
          fontFamily: FONT,
          fontSize: 13,
          fontWeight: 600,
          color: C.ink,
          letterSpacing: -0.1,
        }}
      >
        {label} →
      </span>
      <span
        style={{
          fontFamily: FONT,
          fontSize: 12,
          color: C.inkMuted,
          lineHeight: 1.4,
        }}
      >
        {description}
      </span>
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
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 32 }}>

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
        <StatItem
          dot={C.green}
          label="Rostered"
          value={m.rosterTotal}
          href="roster"
          tenantSlug={tenantSlug}
        />
        <StatItem
          dot={C.amber}
          label="Open inquiries"
          value={m.openInquiries}
          href="work"
          tenantSlug={tenantSlug}
        />
        <StatItem
          dot={C.blue}
          label="Team"
          value={m.teamMembers}
          href="settings"
          tenantSlug={tenantSlug}
        />
        {m.pendingApprovals > 0 && (
          <StatItem
            dot={C.coral}
            label="Pending approvals"
            value={m.pendingApprovals}
            href="roster?filter=pending"
            tenantSlug={tenantSlug}
          />
        )}
      </div>

      {/* ── Quick actions grid ── */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
          gap: 12,
        }}
      >
        <QuickTile
          label="Talent"
          description={`${m.rosterTotal} rostered · ${m.rosterPublished} published`}
          href={`/${tenantSlug}/admin/roster`}
        />
        <QuickTile
          label="Work"
          description={
            m.openInquiries > 0
              ? `${m.openInquiries} open ${m.openInquiries === 1 ? "inquiry" : "inquiries"}`
              : "No open inquiries"
          }
          href={`/${tenantSlug}/admin/work`}
        />
        <QuickTile
          label="Clients"
          description="Client directory and contacts"
          href={`/${tenantSlug}/admin/clients`}
        />
        <QuickTile
          label="Settings"
          description={`${m.teamMembers} team ${m.teamMembers === 1 ? "member" : "members"}`}
          href={`/${tenantSlug}/admin/settings`}
        />
      </div>

    </div>
  );
}
