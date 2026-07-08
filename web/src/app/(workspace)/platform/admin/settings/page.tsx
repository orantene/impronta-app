// Phase 3.11 — Platform HQ · Settings
// HQ team, audit trail, region config.

import { getCachedActorSession } from "@/lib/server/request-cache";
import { loadPlatformSuperAdmins } from "../../platform-data";
import { loadPlatformOperatingCurrency } from "@/lib/platform/operating-currency";
import { loadPlatformCommercialDefaults } from "@/lib/platform/commercial-defaults";
import { loadActivePayoutSystem } from "@/lib/payments/active-payout-system";
import { PlatformCurrencyCard } from "./PlatformCurrencyCard";
import { PlatformCommercialDefaultsCard } from "./PlatformCommercialDefaultsCard";
import { PlatformPayoutSystemCard } from "./PlatformPayoutSystemCard";
import { SettingsSectionIcon } from "@/components/admin/settings/settings-section-icons";
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
} as const;

const F = '"Inter", system-ui, sans-serif';
const FD = 'var(--font-geist-sans), "Inter", -apple-system, system-ui, sans-serif';

function HqCard({
  title,
  subtitle,
  iconId,
  children,
}: {
  title: string;
  subtitle?: string;
  iconId?: string;
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
      <div className="mb-2.5" style={{ display: "flex", alignItems: "flex-start", gap: 11 }}>
        {iconId && <SettingsSectionIcon sectionId={iconId} tone="dark" size={28} />}
        <div style={{ minWidth: 0 }}>
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
      </div>
      {children}
    </section>
  );
}

function SettingRow({
  label,
  value,
  tone = "normal",
}: {
  label: string;
  value: string;
  tone?: "normal" | "green" | "muted";
}) {
  const valueColor =
    tone === "green" ? HQ.green : tone === "muted" ? HQ.inkDim : HQ.inkMuted;
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "10px 0",
        borderTop: `1px solid ${HQ.borderSoft}`,
        fontFamily: F,
      }}
    >
      <span style={{ flex: 1, fontSize: 13, color: HQ.ink }}>{label}</span>
      <span style={{ fontSize: 13, color: valueColor }}>{value}</span>
    </div>
  );
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

export default async function PlatformSettingsPage() {
  const locale = await getRequestLocale();
  const t = createTranslator(locale);
  const session = await getCachedActorSession();
  const hqTeam = await loadPlatformSuperAdmins();
  const currentUserId = session.user?.id;
  const operatingCurrency = await loadPlatformOperatingCurrency();
  const commercialDefaults = await loadPlatformCommercialDefaults();
  const activePayoutSystem = await loadActivePayoutSystem();

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
          {t("dashboard.platform.settings.title")}
        </h1>
        <p
          style={{
            fontFamily: F,
            fontSize: 13,
            color: HQ.inkMuted,
            margin: "5px 0 0",
          }}
        >
          {t("dashboard.platform.settings.subtitle")}
        </p>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(2, 1fr)",
          gap: 12,
        }}
      >
        {/* Operating currency — run the platform in one currency (default USD) */}
        <HqCard
          title={t("dashboard.platform.settings.operatingCurrencyTitle")}
          subtitle={t("dashboard.platform.settings.operatingCurrencySubtitle")}
          iconId="plan"
        >
          <PlatformCurrencyCard
            current={{
              operatingCurrency: operatingCurrency.operatingCurrency,
              multiCurrencyDisplayEnabled: operatingCurrency.multiCurrencyDisplayEnabled,
            }}
          />
        </HqCard>

        {/* Active payout system — Connect (default) vs Global Payouts master switch */}
        <HqCard
          title={t("dashboard.platform.settings.payoutSystemTitle")}
          subtitle={t("dashboard.platform.settings.payoutSystemSubtitle")}
          iconId="plan"
        >
          <PlatformPayoutSystemCard current={activePayoutSystem} />
        </HqCard>

        {/* Commercial defaults — base booking terms the resolver falls back to */}
        <HqCard
          title={t("dashboard.platform.settings.commercialDefaultsTitle")}
          subtitle={t("dashboard.platform.settings.commercialDefaultsSubtitle")}
          iconId="commercial-terms"
        >
          <PlatformCommercialDefaultsCard
            current={{
              defaultDepositPct: commercialDefaults.defaultDepositPct,
              defaultRefundPolicy: commercialDefaults.defaultRefundPolicy,
              instantBookDefault: commercialDefaults.instantBookDefault,
            }}
          />
        </HqCard>

        {/* HQ team — all users with platform staff role */}
        <HqCard
          title={interpolate(t("dashboard.platform.settings.hqTeamTitle"), {
            count: hqTeam.length,
          })}
          subtitle={t("dashboard.platform.settings.hqTeamSubtitle")}
          iconId="team"
        >
          {hqTeam.length === 0 ? (
            <div style={{ padding: "16px 0", color: HQ.inkMuted, fontSize: 13, fontFamily: F }}>
              {t("dashboard.platform.settings.hqTeamEmpty")}
            </div>
          ) : (
            hqTeam.map((member) => {
              const isSuperAdmin = member.appRole === "super_admin";
              const isMe = member.id === currentUserId;
              const accent = isSuperAdmin ? HQ.green : HQ.amber;
              const accentBg = isSuperAdmin
                ? "rgba(93,211,160,0.12)"
                : "rgba(155,168,183,0.15)";
              return (
                <div
                  key={member.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "11px 0",
                    borderTop: `1px solid ${HQ.borderSoft}`,
                    fontFamily: F,
                    color: HQ.ink,
                  }}
                >
                  <div
                    style={{
                      width: 30,
                      height: 30,
                      borderRadius: "50%",
                      background: accentBg,
                      color: accent,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 11,
                      fontWeight: 700,
                      flexShrink: 0,
                      letterSpacing: 0.5,
                    }}
                  >
                    {initials(member.displayName)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div style={{ fontSize: 13, fontWeight: 500, display: "flex", alignItems: "center", gap: 6 }}>
                      {member.displayName}
                      {isMe && (
                        <span
                          style={{
                            fontSize: 9.5,
                            color: HQ.inkMuted,
                            background: HQ.cardSoft,
                            padding: "1px 6px",
                            borderRadius: 999,
                            letterSpacing: 0.4,
                            textTransform: "uppercase" as const,
                            fontWeight: 600,
                          }}
                        >
                          {t("dashboard.platform.settings.youBadge")}
                        </span>
                      )}
                    </div>
                    <div
                      style={{
                        fontSize: 11.5,
                        color: HQ.inkMuted,
                        marginTop: 1,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {member.email}
                    </div>
                  </div>
                  <span
                    style={{
                      padding: "2px 8px",
                      background: HQ.cardSoft,
                      color: accent,
                      fontSize: 10.5,
                      fontWeight: 600,
                      letterSpacing: 0.4,
                      textTransform: "uppercase",
                      borderRadius: 999,
                    }}
                  >
                    {member.appRole}
                  </span>
                </div>
              );
            })
          )}
        </HqCard>

        {/* Platform config */}
        <HqCard
          title={t("dashboard.platform.settings.platformConfigTitle")}
          subtitle={t("dashboard.platform.settings.platformConfigSubtitle")}
          iconId="features"
        >
          <SettingRow label={t("dashboard.platform.settings.configPlatform")} value="Tulala" />
          <SettingRow
            label={t("dashboard.platform.settings.configEnvironment")}
            value={process.env.NODE_ENV ?? t("dashboard.platform.settings.configEnvironmentUnknown")}
          />
          <SettingRow label={t("dashboard.platform.settings.configAuthProvider")} value="Supabase" />
          <SettingRow label={t("dashboard.platform.settings.configStorage")} value="Supabase Storage" />
          <SettingRow label={t("dashboard.platform.settings.configBilling")} value="Stripe (Phase 8)" tone="muted" />
        </HqCard>
      </div>

      <div style={{ height: 12 }} />

      {/* Audit trail — placeholder */}
      <HqCard
        title={t("dashboard.platform.settings.auditTrailTitle")}
        subtitle={t("dashboard.platform.settings.auditTrailSubtitle")}
        iconId="audit"
      >
        <div
          style={{
            padding: "24px 0",
            textAlign: "center",
            color: HQ.inkMuted,
            fontSize: 13,
            fontFamily: F,
          }}
        >
          {t("dashboard.platform.settings.auditTrailEmpty")}
        </div>
      </HqCard>
    </>
  );
}
