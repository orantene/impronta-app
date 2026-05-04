// Phase 3.11 — Platform HQ · Today
// HQ pulse: platform health, incidents queue, recent signups.

import Link from "next/link";
import { loadPlatformStats, loadRecentSignups } from "../../platform-data";

// ─── HQ design tokens ─────────────────────────────────────────────────────────

const HQ = {
  card: "#16161A",
  cardSoft: "rgba(255,255,255,0.04)",
  border: "rgba(255,255,255,0.10)",
  borderSoft: "rgba(255,255,255,0.06)",
  ink: "#F5F2EB",
  inkMuted: "rgba(245,242,235,0.62)",
  inkDim: "rgba(245,242,235,0.38)",
  green: "#5DD3A0",
  amber: "#9BA8B7",
  red: "#F36772",
} as const;

const F = '"Inter", system-ui, sans-serif';
const FD = 'var(--font-geist-sans), "Inter", -apple-system, system-ui, sans-serif';

// ─── Sub-components ───────────────────────────────────────────────────────────

function PageHeader({
  eyebrow,
  title,
  subtitle,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
}) {
  return (
    <div style={{ marginBottom: 24 }}>
      {eyebrow && (
        <p
          style={{
            fontFamily: F,
            fontSize: 10.5,
            fontWeight: 600,
            letterSpacing: 1.4,
            textTransform: "uppercase",
            color: HQ.inkMuted,
            margin: "0 0 6px",
          }}
        >
          {eyebrow}
        </p>
      )}
      <h1
        style={{
          fontFamily: FD,
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
            fontFamily: F,
            fontSize: 13,
            color: HQ.inkMuted,
            margin: "5px 0 0",
            lineHeight: 1.5,
            maxWidth: 640,
          }}
        >
          {subtitle}
        </p>
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  caption,
  tone = "ink",
  href,
}: {
  label: string;
  value: React.ReactNode;
  caption?: string;
  tone?: "ink" | "green" | "amber" | "red" | "dim";
  href?: string;
}) {
  const accent =
    tone === "green"
      ? HQ.green
      : tone === "amber"
      ? HQ.amber
      : tone === "red"
      ? HQ.red
      : tone === "dim"
      ? HQ.inkDim
      : HQ.ink;

  const inner = (
    <>
      <span
        style={{
          fontFamily: F,
          fontSize: 11.5,
          color: HQ.inkMuted,
          fontWeight: 500,
          letterSpacing: 0.05,
        }}
      >
        {label}
      </span>
      <span
        style={{
          fontFamily: FD,
          fontSize: 32,
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
        <span style={{ fontFamily: F, fontSize: 11.5, color: HQ.inkMuted }}>
          {caption}
        </span>
      )}
    </>
  );

  const shared: React.CSSProperties = {
    background: HQ.card,
    border: `1px solid ${HQ.borderSoft}`,
    borderRadius: 12,
    padding: 18,
    display: "flex",
    flexDirection: "column",
    gap: 6,
    minHeight: 120,
    textDecoration: "none",
    transition: "border-color 120ms, box-shadow 120ms",
  };

  if (href) {
    return (
      <Link href={href} style={{ ...shared, cursor: "pointer" }}>
        {inner}
      </Link>
    );
  }

  return <div style={shared}>{inner}</div>;
}

function HqCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      style={{
        background: HQ.card,
        border: `1px solid ${HQ.borderSoft}`,
        borderRadius: 12,
        padding: 16,
        fontFamily: F,
      }}
    >
      <div style={{ marginBottom: 10 }}>
        <span
          style={{
            fontSize: 10.5,
            color: HQ.inkMuted,
            fontWeight: 600,
            letterSpacing: 1.2,
            textTransform: "uppercase",
          }}
        >
          {title}
        </span>
        {subtitle && (
          <p style={{ margin: "3px 0 0", fontSize: 12.5, color: HQ.inkMuted }}>
            {subtitle}
          </p>
        )}
      </div>
      {children}
    </section>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function PlatformTodayPage() {
  const [stats, recentSignups] = await Promise.all([
    loadPlatformStats(),
    loadRecentSignups(5),
  ]);

  return (
    <>
      <PageHeader
        eyebrow="Tulala HQ"
        title="Today"
        subtitle="Platform health, tenant signups, and queues that need eyes today."
      />

      {/* ── Stat grid ── */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: 12,
          marginBottom: 24,
        }}
      >
        <StatCard
          label="Active tenants"
          value={stats.activeTenants}
          caption="on the platform"
          tone="green"
          href="/platform/admin/tenants"
        />
        <StatCard
          label="Total users"
          value={stats.totalUsers}
          caption="registered accounts"
          tone="ink"
          href="/platform/admin/users"
        />
        <StatCard
          label="Total tenants"
          value={stats.totalTenants}
          caption="agencies + hubs"
          tone="ink"
          href="/platform/admin/tenants"
        />
        <StatCard
          label="Talent profiles"
          value={stats.totalTalent}
          caption="across the network"
          tone="ink"
          href="/platform/admin/network"
        />
      </div>

      {/* ── Two-col cards ── */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(2, 1fr)",
          gap: 12,
        }}
      >
        {/* Recent signups */}
        <HqCard
          title="Recent signups"
          subtitle={`${recentSignups.length} most recent tenants`}
        >
          {recentSignups.length === 0 ? (
            <p style={{ color: HQ.inkMuted, fontSize: 13, padding: "10px 0" }}>
              No signups yet.
            </p>
          ) : (
            recentSignups.map((t) => (
              <div
                key={t.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "9px 0",
                  borderTop: `1px solid ${HQ.borderSoft}`,
                  fontFamily: F,
                }}
              >
                <span style={{ flex: 1, fontSize: 13, color: HQ.ink, fontWeight: 500 }}>
                  {t.name}
                </span>
                <span
                  style={{
                    padding: "2px 7px",
                    background: HQ.cardSoft,
                    color: HQ.inkMuted,
                    fontSize: 10.5,
                    fontWeight: 600,
                    letterSpacing: 0.4,
                    textTransform: "uppercase",
                    borderRadius: 999,
                  }}
                >
                  {t.plan}
                </span>
                <span style={{ fontSize: 11.5, color: HQ.inkDim }}>{t.createdAt}</span>
              </div>
            ))
          )}
          <div style={{ marginTop: 10 }}>
            <Link
              href="/platform/admin/tenants"
              style={{
                fontFamily: F,
                fontSize: 12,
                color: HQ.amber,
                fontWeight: 600,
                textDecoration: "none",
              }}
            >
              View all tenants →
            </Link>
          </div>
        </HqCard>

        {/* Quick links */}
        <HqCard title="Platform sections" subtitle="Jump to any section">
          {[
            { href: "/platform/admin/tenants",   label: "Tenants",     desc: "All agencies and hubs" },
            { href: "/platform/admin/users",      label: "Users",       desc: "All registered accounts" },
            { href: "/platform/admin/network",    label: "Network",     desc: "Hub and discovery surface" },
            { href: "/platform/admin/billing",    label: "Billing",     desc: "MRR, invoices, dunning" },
            { href: "/platform/admin/operations", label: "Operations",  desc: "Feature flags and system jobs" },
            { href: "/platform/admin/settings",   label: "Settings",    desc: "HQ team and audit trail" },
          ].map((item) => (
            <Link
              key={item.href}
              href={item.href}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "10px 0",
                borderTop: `1px solid ${HQ.borderSoft}`,
                textDecoration: "none",
                fontFamily: F,
                color: HQ.ink,
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 500 }}>{item.label}</div>
                <div style={{ fontSize: 11.5, color: HQ.inkMuted, marginTop: 1 }}>
                  {item.desc}
                </div>
              </div>
              <span style={{ fontSize: 13, color: HQ.inkDim }}>›</span>
            </Link>
          ))}
        </HqCard>
      </div>
    </>
  );
}
