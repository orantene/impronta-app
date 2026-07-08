// Phase 3.11 — Platform HQ · Today
// HQ pulse: platform health, incidents queue, recent signups.

import Link from "next/link";
import {
  loadLeadStats,
  loadOrphanPaidFreeWorkspaces,
  loadPlatformStats,
  loadRecentLeads,
  loadRecentSignups,
  type PlatformLeadRow,
} from "../../platform-data";
import { loadPlatformNotifications } from "../../platform-notifications";
import { getRequestLocale } from "@/i18n/request-locale";
import { createTranslator } from "@/i18n/messages";
import { interpolate } from "@/i18n/interpolate";

type Translate = (key: string) => string;

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
    <div className="mb-6">
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

// ─── Page ─────────────────────────────────────────────────────────────────────

// ─── Lead pill helpers ────────────────────────────────────────────────────────

const TIER_LABEL_KEY: Record<string, string> = {
  free: "dashboard.platform.tier.free",
  studio: "dashboard.platform.tier.studio",
  agency: "dashboard.platform.tier.agency",
  network: "dashboard.platform.tier.network",
};

function tierLabel(tier: PlatformLeadRow["tierInterest"], t: Translate): string {
  if (!tier) return "—";
  const key = TIER_LABEL_KEY[tier];
  return key ? t(key) : tier.charAt(0).toUpperCase() + tier.slice(1);
}

const LEAD_STATUS_KEY: Record<string, string> = {
  new: "dashboard.platform.leadStatus.new",
  contacted: "dashboard.platform.leadStatus.contacted",
  onboarded: "dashboard.platform.leadStatus.onboarded",
  archived: "dashboard.platform.leadStatus.archived",
  spam: "dashboard.platform.leadStatus.spam",
};

function statusLabel(status: string, t: Translate): string {
  const key = LEAD_STATUS_KEY[status];
  return key ? t(key) : status;
}

function tierTone(t: PlatformLeadRow["tierInterest"]): string {
  switch (t) {
    case "network":
      return "#C9A86A";
    case "agency":
      return "#9EB6E5";
    case "studio":
      return "#7FC8B0";
    case "free":
      return HQ.inkMuted;
    default:
      return HQ.inkDim;
  }
}

function statusTone(s: string): string {
  switch (s) {
    case "onboarded":
      return HQ.green;
    case "contacted":
      return "#9EB6E5";
    case "archived":
    case "spam":
      return HQ.red;
    default:
      return HQ.inkMuted;
  }
}

function Pill({ children, color }: { children: React.ReactNode; color: string }) {
  return (
    <span
      style={{
        padding: "2px 7px",
        background: "rgba(255,255,255,0.05)",
        color,
        fontSize: 10.5,
        fontWeight: 600,
        letterSpacing: 0.4,
        textTransform: "uppercase",
        borderRadius: 999,
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </span>
  );
}

export default async function PlatformTodayPage() {
  const [stats, recentSignups, recentLeads, leadStats, orphanGhosts, hqAlerts] = await Promise.all([
    loadPlatformStats(),
    loadRecentSignups(5),
    loadRecentLeads(10),
    loadLeadStats(),
    loadOrphanPaidFreeWorkspaces(25),
    loadPlatformNotifications(12),
  ]);

  const locale = await getRequestLocale();
  const t = createTranslator(locale);

  return (
    <>
      <PageHeader
        eyebrow="Tulala HQ"
        title={t("dashboard.platform.today.title")}
        subtitle={t("dashboard.platform.today.subtitle")}
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
          label={t("dashboard.platform.today.activeTenants")}
          value={stats.activeTenants}
          caption={t("dashboard.platform.today.activeTenantsCaption")}
          tone="green"
          href="/platform/admin/tenants"
        />
        <StatCard
          label={t("dashboard.platform.today.totalUsers")}
          value={stats.totalUsers}
          caption={t("dashboard.platform.today.totalUsersCaption")}
          tone="ink"
          href="/platform/admin/users"
        />
        <StatCard
          label={t("dashboard.platform.today.totalTenants")}
          value={stats.totalTenants}
          caption={t("dashboard.platform.today.totalTenantsCaption")}
          tone="ink"
          href="/platform/admin/tenants"
        />
        <StatCard
          label={t("dashboard.platform.today.talentProfiles")}
          value={stats.totalTalent}
          caption={t("dashboard.platform.today.talentProfilesCaption")}
          tone="ink"
          href="/platform/admin/network"
        />
      </div>

      {/* ── Lead KPI strip ── */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          gap: 12,
          marginBottom: 24,
        }}
      >
        <StatCard
          label={t("dashboard.platform.today.leads7d")}
          value={leadStats.last7d}
          caption={interpolate(t("dashboard.platform.today.leadsAllTime"), { count: leadStats.total })}
          tone="ink"
        />
        <StatCard
          label={t("dashboard.platform.today.leads30d")}
          value={leadStats.last30d}
          caption={t("dashboard.platform.today.leadsSource")}
          tone="ink"
        />
        <StatCard
          label={t("dashboard.platform.today.conversion")}
          value={`${leadStats.conversionPct}%`}
          caption={interpolate(t("dashboard.platform.today.conversionCaption"), { count: leadStats.converted })}
          tone={leadStats.conversionPct >= 20 ? "green" : "amber"}
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
        {/* HQ alerts — platform in-app notifications (new workspace, signup-failed, …) */}
        <HqCard
          title={t("dashboard.platform.today.hqAlerts")}
          subtitle={hqAlerts.length === 0 ? t("dashboard.platform.today.hqAlertsNone") : interpolate(t("dashboard.platform.today.recentCount"), { count: hqAlerts.length })}
        >
          {hqAlerts.length === 0 ? (
            <p style={{ color: HQ.inkMuted, fontSize: 13, padding: "10px 0" }}>
              {t("dashboard.platform.today.hqAlertsEmpty")}
            </p>
          ) : (
            hqAlerts.map((n) => (
              <div
                key={n.id}
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 10,
                  padding: "9px 0",
                  borderTop: `1px solid ${HQ.borderSoft}`,
                  fontFamily: F,
                }}
              >
                <span
                  aria-hidden
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: "50%",
                    marginTop: 6,
                    background: n.read ? HQ.inkDim : HQ.green,
                    flexShrink: 0,
                  }}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, color: HQ.ink, fontWeight: 500 }}>{n.title}</div>
                  {n.body && (
                    <div style={{ fontSize: 11.5, color: HQ.inkMuted, marginTop: 1 }}>{n.body}</div>
                  )}
                </div>
                <span style={{ fontSize: 11.5, color: HQ.inkDim, whiteSpace: "nowrap" }}>{n.ts}</span>
              </div>
            ))
          )}
        </HqCard>

        {/* Recent signups */}
        <HqCard
          title={t("dashboard.platform.today.recentSignups")}
          subtitle={interpolate(t("dashboard.platform.today.recentSignupsSubtitle"), { count: recentSignups.length })}
        >
          {recentSignups.length === 0 ? (
            <p style={{ color: HQ.inkMuted, fontSize: 13, padding: "10px 0" }}>
              {t("dashboard.platform.today.recentSignupsEmpty")}
            </p>
          ) : (
            recentSignups.map((signup) => (
              <div
                key={signup.id}
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
                  {signup.name}
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
                  {signup.plan}
                </span>
                <span style={{ fontSize: 11.5, color: HQ.inkDim }}>{signup.createdAt}</span>
              </div>
            ))
          )}
          <div className="mt-2.5">
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
              {t("dashboard.platform.today.viewAllTenants")}
            </Link>
          </div>
        </HqCard>

        {/* Recent leads (marketing funnel) */}
        <HqCard
          title={t("dashboard.platform.today.recentLeads")}
          subtitle={interpolate(t("dashboard.platform.today.recentLeadsSubtitle"), { count: recentLeads.length })}
        >
          {recentLeads.length === 0 ? (
            <p style={{ color: HQ.inkMuted, fontSize: 13, padding: "10px 0" }}>
              {t("dashboard.platform.today.recentLeadsEmpty")}
            </p>
          ) : (
            recentLeads.map((l) => {
              // TODO: lead detail — no drawer/detail view exists yet. When a
              // lead is claimed, link to the claimed profile; otherwise render
              // the row as non-interactive.
              const href = l.claimedByProfileId
                ? `/platform/admin/users?profile=${l.claimedByProfileId}`
                : null;
              const row = (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "9px 0",
                    borderTop: `1px solid ${HQ.borderSoft}`,
                    fontFamily: F,
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: 13,
                        color: HQ.ink,
                        fontWeight: 500,
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {l.name || l.email.split("@")[0]}
                    </div>
                    <div
                      style={{
                        fontSize: 11.5,
                        color: HQ.inkMuted,
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {l.email}
                      {l.subdomainWanted ? ` · ${l.subdomainWanted}` : ""}
                    </div>
                  </div>
                  <Pill color={tierTone(l.tierInterest)}>
                    {tierLabel(l.tierInterest, t)}
                  </Pill>
                  <Pill color={statusTone(l.status)}>{statusLabel(l.status, t)}</Pill>
                  <span style={{ fontSize: 11.5, color: HQ.inkDim, minWidth: 56, textAlign: "right" }}>
                    {l.createdAt}
                  </span>
                </div>
              );
              return href ? (
                <Link
                  key={l.id}
                  href={href}
                  style={{ display: "block", textDecoration: "none", color: "inherit" }}
                >
                  {row}
                </Link>
              ) : (
                <div key={l.id}>{row}</div>
              );
            })
          )}
        </HqCard>

        {/* Orphan paid-tier free workspaces — ghosts from crashed paid signups */}
        {orphanGhosts.length > 0 ? (
          <HqCard
            title={t("dashboard.platform.today.orphanTitle")}
            subtitle={interpolate(
              orphanGhosts.length === 1
                ? t("dashboard.platform.today.orphanSubtitleOne")
                : t("dashboard.platform.today.orphanSubtitleMany"),
              { count: orphanGhosts.length },
            )}
          >
            {orphanGhosts.map((g) => {
              const href = `/platform/admin/tenants/${encodeURIComponent(g.tenantId)}`;
              return (
                <Link
                  key={g.tenantId}
                  href={href}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "10px 0",
                    borderTop: `1px solid ${HQ.borderSoft}`,
                    textDecoration: "none",
                    color: "inherit",
                    fontFamily: F,
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: 13,
                        color: HQ.ink,
                        fontWeight: 500,
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {g.slug}
                    </div>
                    <div
                      style={{
                        fontSize: 11.5,
                        color: HQ.inkMuted,
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {g.ownerEmail ?? t("dashboard.platform.today.orphanNoEmail")}
                      {g.leadId ? interpolate(t("dashboard.platform.today.orphanLeadRef"), { id: g.leadId.slice(0, 8) }) : ""}
                    </div>
                  </div>
                  <Pill color={tierTone(g.signupTierInterest)}>{tierLabel(g.signupTierInterest, t)}</Pill>
                  <span
                    style={{
                      fontSize: 11.5,
                      color: HQ.inkDim,
                      minWidth: 56,
                      textAlign: "right",
                    }}
                  >
                    {g.createdAt}
                  </span>
                </Link>
              );
            })}
            <p
              style={{
                margin: "12px 0 0",
                fontSize: 11.5,
                color: HQ.inkDim,
                fontStyle: "italic",
                lineHeight: 1.5,
              }}
            >
              {t("dashboard.platform.today.orphanFootnote")}
            </p>
          </HqCard>
        ) : null}

        {/* Quick links */}
        <HqCard title={t("dashboard.platform.today.sectionsTitle")} subtitle={t("dashboard.platform.today.sectionsSubtitle")}>
          {[
            { href: "/platform/admin/tenants",   label: t("dashboard.platform.nav.tenants"),    desc: t("dashboard.platform.today.sectionTenantsDesc") },
            { href: "/platform/admin/users",      label: t("dashboard.platform.nav.users"),      desc: t("dashboard.platform.today.sectionUsersDesc") },
            { href: "/platform/admin/network",    label: t("dashboard.platform.nav.network"),    desc: t("dashboard.platform.today.sectionNetworkDesc") },
            { href: "/platform/admin/billing",    label: t("dashboard.platform.nav.billing"),    desc: t("dashboard.platform.today.sectionBillingDesc") },
            { href: "/platform/admin/operations", label: t("dashboard.platform.nav.operations"), desc: t("dashboard.platform.today.sectionOperationsDesc") },
            { href: "/platform/admin/settings",   label: t("dashboard.platform.nav.settings"),   desc: t("dashboard.platform.today.sectionSettingsDesc") },
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
              <div className="flex-1 min-w-0">
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
