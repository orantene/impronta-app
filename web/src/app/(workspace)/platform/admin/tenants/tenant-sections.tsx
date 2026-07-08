"use client";

/**
 * Platform Admin — tenant management section stack.
 *
 * The display-oriented sections (Summary, Links, Owner & billing, Analytics,
 * System & audit) plus <TenantSectionStack/>, the ordered stack rendered by
 * both the management drawer and the full-page detail. Interactive sections
 * (Members, Plan override) live in tenant-sections-manage.tsx.
 */

import { useMemo, useState, type ReactNode } from "react";
import {
  HQ,
  HQ_FD,
  HQ_FM,
  Chip,
  PlanChip,
  StatusChip,
  EntityChip,
  MonoId,
  PLAN_TIER_LABEL_KEY,
  WORKSPACE_STATUS_LABEL_KEY,
} from "./hq-kit";
import {
  Accordion,
  Btn,
  fmtDate,
  type OnChanged,
  type SectionProps,
} from "./tenant-section-kit";
import {
  MembersSection,
  PlanOverrideSection,
} from "./tenant-sections-manage";
import {
  DomainSection,
  TenantSettingsSection,
} from "./tenant-sections-control";
import { CommissionSection } from "./tenant-commission-section";
import { CommercialTermsSection } from "./tenant-commercial-terms-section";
import type { TenantManagementDetail } from "../../tenant-management-data";
import { useT } from "@/i18n/use-t";
import { interpolate } from "@/i18n/interpolate";

type Translate = (key: string) => string;

function planChipLabel(t: Translate, plan: string): string | undefined {
  const key = PLAN_TIER_LABEL_KEY[plan];
  return key ? t(key) : undefined;
}

function statusChipLabel(t: Translate, status: string): string | undefined {
  const key = WORKSPACE_STATUS_LABEL_KEY[status];
  return key ? t(key) : undefined;
}

function entityChipLabel(t: Translate, entityType: string): string {
  return entityType === "hub"
    ? t("dashboard.platform.tenants.entity.hub")
    : t("dashboard.platform.tenants.entity.agency");
}

// ─── Shared mini-primitives ────────────────────────────────────────────────────

function StatTile({
  label,
  value,
  caption,
  tone = "ink",
}: {
  label: string;
  value: ReactNode;
  caption?: string;
  tone?: "ink" | "amber" | "green" | "dim";
}) {
  const color =
    tone === "amber"
      ? HQ.amber
      : tone === "green"
        ? HQ.green
        : tone === "dim"
          ? HQ.inkDim
          : HQ.ink;
  return (
    <div
      style={{
        background: HQ.cardSofter,
        border: `1px solid ${HQ.borderSoft}`,
        borderRadius: 10,
        padding: "10px 12px",
        display: "flex",
        flexDirection: "column",
        gap: 3,
      }}
    >
      <span
        style={{
          fontSize: 9.5,
          fontWeight: 700,
          letterSpacing: 0.6,
          textTransform: "uppercase",
          color: HQ.inkDim,
        }}
      >
        {label}
      </span>
      <span
        style={{
          fontSize: 19,
          fontWeight: 500,
          color,
          fontFamily: HQ_FD,
          lineHeight: 1.1,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {value}
      </span>
      {caption && (
        <span style={{ fontSize: 10.5, color: HQ.inkMuted }}>{caption}</span>
      )}
    </div>
  );
}

function KV({ k, v }: { k: string; v: ReactNode }) {
  return (
    <div
      style={{
        display: "flex",
        gap: 12,
        padding: "7px 0",
        borderTop: `1px solid ${HQ.borderSoft}`,
        fontSize: 12.5,
      }}
    >
      <span style={{ width: 130, flexShrink: 0, color: HQ.inkMuted }}>{k}</span>
      <span style={{ flex: 1, minWidth: 0, color: HQ.ink, textAlign: "right" }}>
        {v}
      </span>
    </div>
  );
}

const LOCALE_LABEL_KEY: Record<string, string> = {
  en: "dashboard.platform.tenants.langEnglish",
  es: "dashboard.platform.tenants.langSpanish",
};

function localeLabel(code: string, t: Translate): string {
  const key = LOCALE_LABEL_KEY[code];
  return key ? t(key) : code.toUpperCase();
}

// ─── A. Summary ─────────────────────────────────────────────────────────────────

function SummarySection({ detail, defaultOpen }: SectionProps) {
  const t = useT();
  const atCapacity =
    detail.seats !== null && detail.activeTalentCount >= detail.seats;
  return (
    <Accordion title={t("dashboard.platform.tenants.sectionSummary")} defaultOpen={defaultOpen ?? true}>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(118px, 1fr))",
          gap: 8,
          paddingTop: 10,
        }}
      >
        <StatTile
          label={t("dashboard.platform.tenants.statPlan")}
          value={<PlanChip plan={detail.plan} label={planChipLabel(t, detail.plan)} />}
          caption={entityChipLabel(t, detail.entityType)}
        />
        <StatTile
          label={t("dashboard.platform.tenants.statStatus")}
          value={<StatusChip status={detail.status} label={statusChipLabel(t, detail.status)} />}
        />
        <StatTile
          label={t("dashboard.platform.tenants.statTalents")}
          value={`${detail.activeTalentCount}`}
          caption={interpolate(t("dashboard.platform.tenants.statTalentsCaption"), { count: detail.totalTalentCount })}
          tone={atCapacity ? "amber" : "ink"}
        />
        <StatTile
          label={t("dashboard.platform.tenants.statTalentTypes")}
          value={detail.talentTypeCount}
          caption={t("dashboard.platform.tenants.statTalentTypesCaption")}
        />
        <StatTile
          label={t("dashboard.platform.tenants.statSeatLimit")}
          value={detail.seats === null ? "∞" : detail.seats}
          caption={atCapacity ? t("dashboard.platform.tenants.statSeatAtCapacity") : t("dashboard.platform.tenants.statSeatAvailable")}
          tone={atCapacity ? "amber" : "ink"}
        />
        <StatTile label={t("dashboard.platform.tenants.statStaff")} value={detail.staffCount} caption={t("dashboard.platform.tenants.statStaffCaption")} />
        <StatTile
          label={t("dashboard.platform.tenants.statCreated")}
          value={<span style={{ fontSize: 13 }}>{detail.createdAtLabel}</span>}
        />
        <StatTile
          label={t("dashboard.platform.tenants.statLastUpdated")}
          value={<span style={{ fontSize: 13 }}>{detail.updatedAtLabel}</span>}
        />
      </div>
      {detail.talentTypes.length > 0 && (
        <div
          style={{ display: "flex", flexWrap: "wrap", gap: 5, marginTop: 10 }}
        >
          {detail.talentTypes.map((tType) => (
            <Chip key={tType} outline>
              {tType}
            </Chip>
          ))}
        </div>
      )}
      {detail.signupContext ? (
        <div
          style={{
            marginTop: 12,
            padding: "10px 12px",
            borderRadius: 10,
            background: HQ.cardSofter,
            border: `1px solid ${HQ.borderSoft}`,
            fontSize: 12,
            color: HQ.inkMuted,
            lineHeight: 1.55,
          }}
        >
          <div style={{ fontWeight: 700, color: HQ.ink, marginBottom: 6 }}>
            {t("dashboard.platform.tenants.signupContext")}
          </div>
          {detail.signupContext.audience ? (
            <div>{interpolate(t("dashboard.platform.tenants.signupAudience"), { value: detail.signupContext.audience })}</div>
          ) : null}
          {detail.signupContext.rosterSize ? (
            <div>{interpolate(t("dashboard.platform.tenants.signupRosterSize"), { value: detail.signupContext.rosterSize })}</div>
          ) : null}
          {detail.signupContext.tierInterest ? (
            <div>{interpolate(t("dashboard.platform.tenants.signupTierInterest"), { value: detail.signupContext.tierInterest })}</div>
          ) : null}
          {detail.owner ? (
            <div style={{ marginTop: 6 }}>
              {interpolate(t("dashboard.platform.tenants.signupOwner"), { name: detail.owner.displayName, email: detail.owner.email })}
            </div>
          ) : null}
        </div>
      ) : null}
    </Accordion>
  );
}

// ─── B. Links ────────────────────────────────────────────────────────────────

function LinkRow({ label, url }: { label: string; url: string }) {
  const t = useT();
  const [copied, setCopied] = useState(false);
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "9px 0",
        borderTop: `1px solid ${HQ.borderSoft}`,
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 11,
            color: HQ.inkMuted,
            fontWeight: 600,
            marginBottom: 2,
          }}
        >
          {label}
        </div>
        <div
          style={{
            fontSize: 11.5,
            color: HQ.inkDim,
            fontFamily: HQ_FM,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {url}
        </div>
      </div>
      <Btn
        size="sm"
        onClick={() => {
          void navigator.clipboard?.writeText(url);
          setCopied(true);
          setTimeout(() => setCopied(false), 1400);
        }}
      >
        {copied ? t("dashboard.platform.tenants.copied") : t("dashboard.platform.tenants.copy")}
      </Btn>
      <a
        href={url}
        target="_blank"
        rel="noreferrer"
        style={{ textDecoration: "none" }}
      >
        <Btn size="sm" tone="primary">
          {t("dashboard.platform.tenants.open")}
        </Btn>
      </a>
    </div>
  );
}

function LinksSection({ detail, defaultOpen }: SectionProps) {
  const t = useT();
  const { urls } = detail;
  return (
    <Accordion title={t("dashboard.platform.tenants.sectionLinks")} defaultOpen={defaultOpen ?? true}>
      <LinkRow label={t("dashboard.platform.tenants.linkLabelPublicSite")} url={urls.publicSite} />
      <LinkRow label={t("dashboard.platform.tenants.linkLabelAdminDashboard")} url={urls.adminDashboard} />
      <LinkRow label={t("dashboard.platform.tenants.linkLabelBilling")} url={urls.billing} />
      {urls.customDomain && (
        <LinkRow label={t("dashboard.platform.tenants.linkLabelCustomDomain")} url={urls.customDomain} />
      )}
      <p style={{ fontSize: 10.5, color: HQ.inkDim, margin: "10px 0 0" }}>
        {t("dashboard.platform.tenants.linksNote")}
      </p>
    </Accordion>
  );
}

// ─── C. Owner & billing ──────────────────────────────────────────────────────

function OwnerBillingSection({ detail, defaultOpen }: SectionProps) {
  const t = useT();
  const { owner, billing, override } = detail;
  return (
    <Accordion title={t("dashboard.platform.tenants.sectionOwnerBilling")} defaultOpen={defaultOpen ?? true}>
      <div style={{ paddingTop: 8 }}>
        {owner ? (
          <div
            style={{
              background: HQ.cardSofter,
              border: `1px solid ${HQ.borderSoft}`,
              borderRadius: 10,
              padding: "10px 12px",
            }}
          >
            <div style={{ fontSize: 13, fontWeight: 600, color: HQ.ink }}>
              {owner.displayName}
            </div>
            <div
              style={{
                fontSize: 11.5,
                color: HQ.inkMuted,
                fontFamily: HQ_FM,
                marginTop: 1,
              }}
            >
              {owner.email}
            </div>
            <div
              style={{ marginTop: 6, display: "flex", gap: 6, flexWrap: "wrap" }}
            >
              <Chip bg={HQ.greenSoft} color={HQ.green}>
                {t("dashboard.platform.tenants.ownerBillingResponsible")}
              </Chip>
            </div>
            <div style={{ marginTop: 6 }}>
              <MonoId value={owner.profileId} />
            </div>
          </div>
        ) : (
          <div
            style={{
              background: HQ.redSoft,
              border: "1px solid rgba(243,103,114,0.25)",
              borderRadius: 10,
              padding: "10px 12px",
              fontSize: 12,
              color: HQ.red,
            }}
          >
            {t("dashboard.platform.tenants.noOwnerBilling")}
          </div>
        )}

        <div style={{ marginTop: 4 }}>
          <KV k={t("dashboard.platform.tenants.kvEffectivePlan")} v={<PlanChip plan={billing.effectivePlan} label={planChipLabel(t, billing.effectivePlan)} />} />
          {billing.basePlan && (
            <KV
              k={t("dashboard.platform.tenants.kvBasePlan")}
              v={
                <span
                  style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
                >
                  <PlanChip plan={billing.basePlan} label={planChipLabel(t, billing.basePlan)} />
                  <span style={{ fontSize: 10.5, color: HQ.inkDim }}>
                    {t("dashboard.platform.tenants.underOverride")}
                  </span>
                </span>
              }
            />
          )}
          <KV
            k={t("dashboard.platform.tenants.kvSubscription")}
            v={
              billing.subscriptionStatus
                ? `${billing.subscriptionPlan ?? "—"} · ${billing.subscriptionStatus}`
                : t("dashboard.platform.tenants.noPaidSubscription")
            }
          />
          {billing.currentPeriodEnd && (
            <KV k={t("dashboard.platform.tenants.kvRenewsEnds")} v={fmtDate(billing.currentPeriodEnd)} />
          )}
          {billing.trialEnd && (
            <KV k={t("dashboard.platform.tenants.kvStripeTrialEnds")} v={fmtDate(billing.trialEnd)} />
          )}
          <KV
            k={t("dashboard.platform.tenants.kvStripeCustomer")}
            v={
              billing.stripeCustomerId ? (
                <MonoId value={billing.stripeCustomerId} />
              ) : (
                <span style={{ color: HQ.inkDim }}>{t("dashboard.platform.tenants.none")}</span>
              )
            }
          />
          <KV
            k={t("dashboard.platform.tenants.kvPlanSource")}
            v={
              override
                ? t("dashboard.platform.tenants.planSourceOverride")
                : billing.subscriptionStatus
                  ? t("dashboard.platform.tenants.planSourceStripe")
                  : t("dashboard.platform.tenants.planSourceDefault")
            }
          />
        </div>
      </div>
    </Accordion>
  );
}

// ─── D. Language & localization ─────────────────────────────────────────────

function LanguageLocalizationSection({ detail, defaultOpen }: SectionProps) {
  const t = useT();
  const language = detail.language;
  const activeLocales = language.activeLocales;
  const isDefaultActive = activeLocales.includes(language.defaultLocale);
  const hasLocales = activeLocales.length > 0;
  const isSupportedState =
    hasLocales &&
    isDefaultActive &&
    activeLocales.every((locale) => locale === "en" || locale === "es");
  const readinessTone = isSupportedState ? "green" : "amber";

  return (
    <Accordion title={t("dashboard.platform.tenants.sectionLanguage")} defaultOpen={defaultOpen ?? false}>
      <div style={{ paddingTop: 4 }}>
        <KV k={t("dashboard.platform.tenants.kvDefaultLanguage")} v={localeLabel(language.defaultLocale, t)} />
        <KV
          k={t("dashboard.platform.tenants.kvActiveLanguages")}
          v={
            <span style={{ display: "inline-flex", gap: 5, flexWrap: "wrap", justifyContent: "flex-end" }}>
              {activeLocales.map((locale) => (
                <Chip key={locale} outline>
                  {localeLabel(locale, t)}
                </Chip>
              ))}
            </span>
          }
        />
        <KV
          k={t("dashboard.platform.tenants.kvPublicSwitcher")}
          v={
            language.switcherStatus === "shown"
              ? t("dashboard.platform.tenants.switcherShown")
              : activeLocales.length > 1
                ? t("dashboard.platform.tenants.switcherHiddenPref")
                : t("dashboard.platform.tenants.switcherHiddenOne")
          }
        />
        <KV
          k={t("dashboard.platform.tenants.kvSwitcherPreference")}
          v={language.showLanguageSwitcher ? t("dashboard.platform.tenants.switcherPrefShow") : t("dashboard.platform.tenants.switcherPrefHidden")}
        />
        <KV
          k={t("dashboard.platform.tenants.kvSettingsMode")}
          v={language.mode === "tenant-managed" ? t("dashboard.platform.tenants.settingsModeTenant") : t("dashboard.platform.tenants.settingsModePlatform")}
        />
        <KV
          k={t("dashboard.platform.tenants.kvReadiness")}
          v={
            <Chip bg={readinessTone === "green" ? HQ.greenSoft : HQ.amberSoft} color={readinessTone === "green" ? HQ.green : HQ.amber}>
              {isSupportedState ? t("dashboard.platform.tenants.readinessSupported") : t("dashboard.platform.tenants.readinessNeedsReview")}
            </Chip>
          }
        />
        <KV k={t("dashboard.platform.tenants.statLastUpdated")} v={language.updatedAt ? fmtDate(language.updatedAt) : t("dashboard.platform.tenants.notSet")} />
      </div>
      <p style={{ fontSize: 10.5, color: HQ.inkDim, margin: "10px 0 0" }}>
        {t("dashboard.platform.tenants.languageNote")}
      </p>
    </Accordion>
  );
}

// ─── G. Analytics (preview) ──────────────────────────────────────────────────

function AnalyticsSection({ detail, defaultOpen }: SectionProps) {
  const t = useT();
  const previewMetrics = [
    t("dashboard.platform.tenants.metricRevenue"),
    t("dashboard.platform.tenants.metricTraffic"),
    t("dashboard.platform.tenants.metricProfileViews"),
    t("dashboard.platform.tenants.metricConversionRate"),
    t("dashboard.platform.tenants.metricActiveUsers"),
    t("dashboard.platform.tenants.metricSavedTalents"),
  ];
  return (
    <Accordion title={t("dashboard.platform.tenants.sectionAnalytics")} defaultOpen={defaultOpen ?? false}>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(118px, 1fr))",
          gap: 8,
          paddingTop: 10,
        }}
      >
        <StatTile label={t("dashboard.platform.tenants.statInquiries")} value={detail.inquiryCount} caption={t("dashboard.platform.tenants.lifetime")} />
        <StatTile label={t("dashboard.platform.tenants.statBookings")} value={detail.bookingCount} caption={t("dashboard.platform.tenants.lifetime")} />
        <StatTile
          label={t("dashboard.platform.tenants.statDomains")}
          value={detail.domainCount}
          caption={t("dashboard.platform.tenants.registered")}
        />
      </div>
      <div
        style={{
          marginTop: 10,
          padding: "10px 12px",
          background: HQ.cardSofter,
          border: `1px dashed ${HQ.border}`,
          borderRadius: 10,
        }}
      >
        <div style={{ fontSize: 11.5, color: HQ.inkMuted, fontWeight: 600 }}>
          {t("dashboard.platform.tenants.analyticsNotTracked")}
        </div>
        <div style={{ marginTop: 6, display: "flex", flexWrap: "wrap", gap: 5 }}>
          {previewMetrics.map((m) => (
            <Chip key={m} outline>
              {m}
            </Chip>
          ))}
        </div>
        <p style={{ fontSize: 10.5, color: HQ.inkDim, margin: "8px 0 0" }}>
          {t("dashboard.platform.tenants.analyticsNote")}
        </p>
      </div>
    </Accordion>
  );
}

// ─── H. System & audit ───────────────────────────────────────────────────────

function SystemAuditSection({ detail, defaultOpen }: SectionProps) {
  const t = useT();
  return (
    <Accordion title={t("dashboard.platform.tenants.sectionSystemAudit")} defaultOpen={defaultOpen ?? false}>
      <div style={{ paddingTop: 4 }}>
        <KV k={t("dashboard.platform.tenants.kvWorkspaceId")} v={<MonoId value={detail.id} />} />
        <KV k={t("dashboard.platform.tenants.kvSlug")} v={<MonoId value={detail.slug} />} />
        <KV k={t("dashboard.platform.tenants.kvEntityType")} v={<EntityChip entityType={detail.entityType} label={entityChipLabel(t, detail.entityType)} />} />
        <KV k={t("dashboard.platform.tenants.kvCreated")} v={fmtDate(detail.createdAt)} />
        <KV k={t("dashboard.platform.tenants.kvLastUpdated")} v={fmtDate(detail.updatedAt)} />
      </div>
      <div
        style={{
          fontSize: 10.5,
          fontWeight: 700,
          letterSpacing: 0.6,
          textTransform: "uppercase",
          color: HQ.inkDim,
          margin: "12px 0 2px",
        }}
      >
        {t("dashboard.platform.tenants.recentPlatformActions")}
      </div>
      {detail.recentAudit.length === 0 ? (
        <div style={{ fontSize: 11.5, color: HQ.inkDim, padding: "8px 0" }}>
          {t("dashboard.platform.tenants.noPlatformActions")}
        </div>
      ) : (
        detail.recentAudit.map((a, i) => (
          <div
            key={`${a.action}-${i}`}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "6px 0",
              borderTop: `1px solid ${HQ.borderSoft}`,
              fontSize: 11.5,
            }}
          >
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: "50%",
                background:
                  a.severity === "emergency"
                    ? HQ.red
                    : a.severity === "warn"
                      ? HQ.amber
                      : HQ.inkDim,
                flexShrink: 0,
              }}
            />
            <span
              style={{
                color: HQ.inkMuted,
                fontFamily: HQ_FM,
                fontSize: 10.5,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {a.action}
            </span>
            <span style={{ flex: 1 }} />
            <span style={{ color: HQ.inkDim, fontSize: 10.5 }}>
              {a.createdAtLabel}
            </span>
          </div>
        ))
      )}
    </Accordion>
  );
}

// ─── Stack ───────────────────────────────────────────────────────────────────

export function TenantSectionStack({
  detail,
  onChanged,
  mode,
}: {
  detail: TenantManagementDetail;
  onChanged: OnChanged;
  mode: "drawer" | "page";
}) {
  const drawer = mode === "drawer";
  // Memoise so a host re-render doesn't rebuild every section needlessly.
  const sections = useMemo(
    () => [
      <SummarySection key="s" detail={detail} onChanged={onChanged} defaultOpen />,
      <LinksSection
        key="l"
        detail={detail}
        onChanged={onChanged}
        defaultOpen={!drawer}
      />,
      <OwnerBillingSection
        key="o"
        detail={detail}
        onChanged={onChanged}
        defaultOpen
      />,
      <MembersSection
        key="m"
        detail={detail}
        onChanged={onChanged}
        defaultOpen={!drawer}
      />,
      <PlanOverrideSection
        key="p"
        detail={detail}
        onChanged={onChanged}
        defaultOpen
      />,
      <CommissionSection
        key="commission"
        detail={detail}
        onChanged={onChanged}
        defaultOpen={false}
      />,
      <CommercialTermsSection
        key="commercial-terms"
        detail={detail}
        onChanged={onChanged}
        defaultOpen={false}
      />,
      <DomainSection
        key="domains"
        detail={detail}
        onChanged={onChanged}
        defaultOpen={false}
      />,
      <TenantSettingsSection
        key="settings"
        detail={detail}
        onChanged={onChanged}
        defaultOpen={false}
      />,
      <LanguageLocalizationSection
        key="lang"
        detail={detail}
        onChanged={onChanged}
        defaultOpen={!drawer}
      />,
      <AnalyticsSection
        key="a"
        detail={detail}
        onChanged={onChanged}
        defaultOpen={!drawer}
      />,
      <SystemAuditSection
        key="y"
        detail={detail}
        onChanged={onChanged}
        defaultOpen={false}
      />,
    ],
    [detail, onChanged, drawer],
  );
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {sections}
    </div>
  );
}
