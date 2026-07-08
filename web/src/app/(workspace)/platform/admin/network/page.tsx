// Phase 3.11 — Platform HQ · Network
// Tulala discovery hub: featured talent, moderation queue, hub rules.

import { loadPlatformNetworkStats } from "../../platform-data";
import { getRequestLocale } from "@/i18n/request-locale";
import { createTranslator } from "@/i18n/messages";
import { interpolate } from "@/i18n/interpolate";

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
      <div className="mb-2.5">
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
  const locale = await getRequestLocale();
  const t = createTranslator(locale);
  const stats = await loadPlatformNetworkStats();
  const publishedRatio =
    stats.totalTalent > 0
      ? Math.round((stats.publishedTalent / stats.totalTalent) * 100)
      : 0;

  return (
    <>
      {/* Page header */}
      <div className="mb-6">
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
          {t("dashboard.platform.network.title")}
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
          {t("dashboard.platform.network.subtitle")}
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
        <StatBox
          label={t("dashboard.platform.network.totalTalent")}
          value={stats.totalTalent}
          caption={t("dashboard.platform.network.totalTalentCaption")}
          tone="ink"
        />
        <StatBox
          label={t("dashboard.platform.network.published")}
          value={stats.publishedTalent}
          caption={interpolate(t("dashboard.platform.network.publishedCaption"), {
            pct: publishedRatio,
          })}
          tone="green"
        />
        <StatBox
          label={t("dashboard.platform.network.drafts")}
          value={stats.draftTalent}
          caption={t("dashboard.platform.network.draftsCaption")}
          tone="amber"
        />
        <StatBox
          label={t("dashboard.platform.network.invited")}
          value={stats.invitedTalent}
          caption={t("dashboard.platform.network.invitedCaption")}
          tone="purple"
        />
        <StatBox
          label={t("dashboard.platform.network.claimed")}
          value={stats.claimedTalent}
          caption={t("dashboard.platform.network.claimedCaption")}
          tone="ink"
        />
        <StatBox
          label={t("dashboard.platform.network.hosting")}
          value={stats.agenciesActive + stats.hubsActive}
          caption={interpolate(t("dashboard.platform.network.hostingCaption"), {
            agencies: stats.agenciesActive,
            hubs: stats.hubsActive,
          })}
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
          title={t("dashboard.platform.network.submissionsTitle")}
          subtitle={t("dashboard.platform.network.submissionsSubtitle")}
        >
          <EmptyState message={t("dashboard.platform.network.submissionsEmpty")} />
        </HqCard>

        <HqCard title={t("dashboard.platform.network.moderationTitle")}>
          <EmptyState message={t("dashboard.platform.network.moderationEmpty")} />
        </HqCard>
      </div>

      <div style={{ height: 12 }} />

      {/* Hub rules card */}
      <HqCard
        title={t("dashboard.platform.network.hubRulesTitle")}
        subtitle={t("dashboard.platform.network.hubRulesSubtitle")}
      >
        <div style={{ padding: "12px 0" }}>
          {[
            {
              label: t("dashboard.platform.network.featuredCriteriaLabel"),
              desc: t("dashboard.platform.network.featuredCriteriaDesc"),
            },
            {
              label: t("dashboard.platform.network.rankingSignalsLabel"),
              desc: t("dashboard.platform.network.rankingSignalsDesc"),
            },
            {
              label: t("dashboard.platform.network.moderationPolicyLabel"),
              desc: t("dashboard.platform.network.moderationPolicyDesc"),
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
