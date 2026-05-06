// Phase 3.11 — Platform HQ · Network
// Tulala discovery hub: featured talent, moderation queue, hub rules.

import { loadPlatformNetworkStats } from "../../platform-data";

export const dynamic = "force-dynamic";

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

function EmptyState({ message }: { message: string }) {
  return (
    <div
      style={{
        padding: "24px 0",
        textAlign: "center",
        color: HQ.inkMuted,
        fontSize: 13,
        fontFamily: F,
      }}
    >
      {message}
    </div>
  );
}

function StatBox({
  label,
  value,
  caption,
  tone = "ink",
}: {
  label: string;
  value: number | string;
  caption?: string;
  tone?: "ink" | "green" | "amber" | "red" | "purple" | "dim";
}) {
  const accent =
    tone === "green"
      ? HQ.green
      : tone === "amber"
      ? HQ.amber
      : tone === "red"
      ? HQ.red
      : tone === "purple"
      ? "#A07AE0"
      : tone === "dim"
      ? HQ.inkDim
      : HQ.ink;
  return (
    <div
      style={{
        background: HQ.card,
        border: `1px solid ${HQ.borderSoft}`,
        borderRadius: 12,
        padding: 16,
        display: "flex",
        flexDirection: "column",
        gap: 4,
      }}
    >
      <span style={{ fontFamily: F, fontSize: 10.5, color: HQ.inkMuted, fontWeight: 600, letterSpacing: 0.6, textTransform: "uppercase" as const }}>
        {label}
      </span>
      <span
        style={{
          fontFamily: FD,
          fontSize: 26,
          fontWeight: 500,
          letterSpacing: -0.5,
          color: accent,
          lineHeight: 1.05,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {value}
      </span>
      {caption && (
        <span style={{ fontFamily: F, fontSize: 11, color: HQ.inkMuted }}>
          {caption}
        </span>
      )}
    </div>
  );
}

export default async function PlatformNetworkPage() {
  const stats = await loadPlatformNetworkStats();
  const publishedRatio =
    stats.totalTalent > 0
      ? Math.round((stats.publishedTalent / stats.totalTalent) * 100)
      : 0;

  return (
    <>
      {/* Page header */}
      <div style={{ marginBottom: 24 }}>
        <h1
          style={{
            fontFamily: FD,
            fontSize: 24,
            fontWeight: 600,
            letterSpacing: -0.4,
            color: HQ.ink,
            margin: 0,
          }}
        >
          Network
        </h1>
        <p
          style={{
            fontFamily: F,
            fontSize: 13,
            color: HQ.inkMuted,
            margin: "5px 0 0",
            maxWidth: 640,
          }}
        >
          The discovery surface that sits across every tenant. Curate featured talent,
          run moderation, and tune ranking.
        </p>
      </div>

      {/* Stats grid — real network state */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
          gap: 12,
          marginBottom: 16,
        }}
      >
        <StatBox label="Total talent" value={stats.totalTalent} caption="across the network" tone="ink" />
        <StatBox
          label="Published"
          value={stats.publishedTalent}
          caption={`${publishedRatio}% live`}
          tone="green"
        />
        <StatBox label="Drafts" value={stats.draftTalent} caption="awaiting publish" tone="amber" />
        <StatBox label="Invited" value={stats.invitedTalent} caption="pending claim" tone="purple" />
        <StatBox label="Claimed" value={stats.claimedTalent} caption="user_id linked" tone="ink" />
        <StatBox
          label="Hosting"
          value={stats.agenciesActive + stats.hubsActive}
          caption={`${stats.agenciesActive} agencies · ${stats.hubsActive} hubs`}
          tone="ink"
        />
      </div>

      {/* Two-col grid */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(2, 1fr)",
          gap: 12,
        }}
      >
        <HqCard
          title="Hub submissions awaiting review"
          subtitle="Talent agencies submit to be featured on the network hub."
        >
          <EmptyState message="No submissions pending review." />
        </HqCard>

        <HqCard title="Moderation queue">
          <EmptyState message="No items in the moderation queue." />
        </HqCard>
      </div>

      <div style={{ height: 12 }} />

      {/* Hub rules card */}
      <HqCard
        title="Hub rules"
        subtitle="Criteria for featured talent, ranking weights, and moderation policies."
      >
        <div style={{ padding: "12px 0" }}>
          {[
            {
              label: "Featured criteria",
              desc: "Active agency, complete profile, verified identity, ≥3 published bookings.",
            },
            {
              label: "Ranking signals",
              desc: "Recency, booking velocity, profile completeness, trust tier.",
            },
            {
              label: "Moderation policy",
              desc: "Profiles flagged by 3+ unique reporters are auto-hidden pending review.",
            },
          ].map((rule) => (
            <div
              key={rule.label}
              style={{
                padding: "10px 0",
                borderTop: `1px solid ${HQ.borderSoft}`,
                fontFamily: F,
              }}
            >
              <div
                style={{
                  fontSize: 13,
                  fontWeight: 500,
                  color: HQ.ink,
                  marginBottom: 3,
                }}
              >
                {rule.label}
              </div>
              <div style={{ fontSize: 12.5, color: HQ.inkMuted }}>{rule.desc}</div>
            </div>
          ))}
        </div>
      </HqCard>
    </>
  );
}
