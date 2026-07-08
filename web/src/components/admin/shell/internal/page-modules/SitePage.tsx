"use client";

import type { ReactNode } from "react";
import { useT } from "@/i18n/use-t";
import { interpolate } from "@/i18n/interpolate";
import { CapsLabel, Icon, PrimaryButton, PrimaryCard, ReadOnlyChip, SecondaryButton, StatDot } from "../primitives";
import { COLORS, ENTITY_TYPE_META, FONTS, SITE_PAGES, TRANSITION, meetsPlan, meetsRole, useAdminShell } from "../state";
import { TierCard, TierSection } from "./BillingPage";
import { Grid, PageHeader } from "./pages-shared";

// Page-status discriminant → catalog key (localized label via the *_KEY map pattern).
const PAGE_STATUS_LABEL_KEY: Record<"published" | "draft" | "scheduled" | "archived", string> = {
  published: "dashboard.adminSite.pageStatus.published",
  draft: "dashboard.adminSite.pageStatus.draft",
  scheduled: "dashboard.adminSite.pageStatus.scheduled",
  archived: "dashboard.adminSite.pageStatus.archived",
};


function SiteSubSection({ title, count, sub, actionLabel, onAction, children }: { title: string; count?: number; sub?: string; actionLabel?: string; onAction?: () => void; children: ReactNode }) {
  return (
    <section style={{ marginBottom: 18 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 10, flexWrap: "wrap" }}>
        <h3 style={{ margin: 0, fontFamily: FONTS.display, fontSize: 16, fontWeight: 600, letterSpacing: -0.1 }} className="text-admin-ink">{title}</h3>
        {typeof count === "number" && (
          <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.5, textTransform: "uppercase" }} className="text-admin-ink-muted">{count}</span>
        )}
        {sub && <span style={{ fontSize: 12, fontFamily: FONTS.body }} className="text-admin-ink-muted">{sub}</span>}
        {actionLabel && (
          <button type="button" onClick={onAction} style={{ marginLeft: "auto", padding: "5px 11px", borderRadius: 7, border: `1px solid ${COLORS.borderSoft}`, background: "#fff", color: COLORS.ink, fontSize: 12, fontWeight: 500, cursor: "pointer", fontFamily: FONTS.body }}>{actionLabel}</button>
        )}
      </div>
      {children}
    </section>
  );
}

function SiteTable({ headers, children }: { headers: string[]; children: ReactNode }) {
  return (
    <div style={{ border: `1px solid ${COLORS.borderSoft}`, borderRadius: 10, overflow: "hidden", background: "#fff" }}>
      <div style={{ display: "grid", gridTemplateColumns: `2fr ${headers.slice(1).map(() => "1fr").join(" ")}`, padding: "8px 14px", borderBottom: `1px solid ${COLORS.borderSoft}`, fontSize: 10.5, fontWeight: 600, letterSpacing: 0.5, textTransform: "uppercase", fontFamily: FONTS.body }} className="bg-admin-surface-alt text-admin-ink-muted">
        {headers.map(h => <div key={h}>{h}</div>)}
      </div>
      {children}
    </div>
  );
}

function SiteTableRow({ cells, onClick }: { cells: ReactNode[]; onClick?: () => void }) {
  const cols = `2fr ${cells.slice(1).map(() => "1fr").join(" ")}`;
  return (
    <div
      onClick={onClick}
      style={{
        display: "grid", gridTemplateColumns: cols,
        padding: "10px 14px", alignItems: "center",
        borderTop: `1px solid ${COLORS.borderSoft}`,
        fontSize: 13, color: COLORS.ink, fontFamily: FONTS.body,
        cursor: onClick ? "pointer" : "default",
        transition: `background ${TRANSITION.micro}`,
      }}
      onMouseEnter={(e) => { if (onClick) e.currentTarget.style.background = COLORS.surfaceAlt; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
    >
      {cells.map((c, i) => <div key={i}>{c}</div>)}
    </div>
  );
}

export function PageStatusChip({
  status,
}: {
  status: "published" | "draft" | "scheduled" | "archived";
}) {
  const t = useT();
  const map = {
    published: { bg: COLORS.successSoft, fg: COLORS.successDeep },
    draft:     { bg: COLORS.surfaceAlt,  fg: COLORS.inkMuted },
    scheduled: { bg: COLORS.indigoSoft,  fg: COLORS.indigoDeep },
    archived:  { bg: COLORS.surfaceAlt,  fg: COLORS.inkDim },
  } as const;
  const m = map[status];
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "2px 8px", borderRadius: 999, background: m.bg, color: m.fg, fontSize: 11, fontWeight: 600, fontFamily: FONTS.body }}>{t(PAGE_STATUS_LABEL_KEY[status])}</span>
  );
}

function SiteInfoCard({ label, value, status, sub, mono }: { label: string; value: string; status?: "ok" | "warn"; sub?: string; mono?: boolean }) {
  const dot = status === "ok" ? COLORS.successDeep : status === "warn" ? COLORS.amberDeep : null;
  return (
    <div style={{ padding: 12, borderRadius: 10, background: "#fff", border: `1px solid ${COLORS.borderSoft}`, fontFamily: FONTS.body }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
        {dot && <span style={{ width: 6, height: 6, borderRadius: "50%", background: dot }} />}
        <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: 0.6, textTransform: "uppercase", color: COLORS.inkMuted }}>{label}</div>
      </div>
      <div style={{ fontSize: 13, fontWeight: 500, fontFamily: mono ? "ui-monospace, monospace" : FONTS.body, overflow: "hidden", textOverflow: "ellipsis" }} className="text-admin-ink">{value || "—"}</div>
      {sub && <div style={{ fontSize: 11, marginTop: 2 }} className="text-admin-ink-muted">{sub}</div>}
    </div>
  );
}

function SiteTrackingCell({ label, value }: { label: string; value: string }) {
  const t = useT();
  const active = value.length > 0;
  return (
    <div style={{ padding: "10px 12px", borderRadius: 8, background: active ? COLORS.successSoft : "#fff", border: `1px solid ${active ? "rgba(46,125,91,0.30)" : COLORS.borderSoft}`, fontFamily: FONTS.body }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 2 }}>
        <span style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5 }} className="text-admin-ink-muted">{label}</span>
        {active && <span style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: 0.5, textTransform: "uppercase" }} className="text-admin-success-deep">{t("dashboard.adminSite.active")}</span>}
      </div>
      <div style={{ fontSize: 12, color: active ? COLORS.successDeep : COLORS.inkDim, fontFamily: "ui-monospace, monospace", overflow: "hidden", textOverflow: "ellipsis" }}>{value || t("dashboard.adminSite.notConfigured")}</div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════
// SITE (legacy)
// ════════════════════════════════════════════════════════════════════

export function SitePage() {
  const t = useT();
  const { state, setPage, openDrawer, openUpgrade, bridgeTenantIdentity, effectiveTenant } = useAdminShell();
  const canEdit = meetsRole(state.role, "admin");

  return (
    <>
      <PageHeader
        title={t("dashboard.adminSite.title")}
        subtitle={t("dashboard.adminSite.subtitle")}
        actions={
          <>
            {!canEdit && <ReadOnlyChip />}
            <SecondaryButton size="sm" onClick={() => openDrawer("seo")}>
              <span className="inline-flex items-center gap-1.5">
                <Icon name="external" size={12} stroke={1.7} />
                {t("dashboard.adminSite.openSubdomain")}
              </span>
            </SecondaryButton>
          </>
        }
      />

      {/* Setup walkthrough banner */}
      <SiteSetupBanner />

      {/* WS-27 Site management tools */}
      <div style={{ display: "flex", gap: 8, marginTop: 14, marginBottom: 4 }}>
        <SecondaryButton size="sm" onClick={() => openDrawer("site-context-switcher")}>{t("dashboard.adminSite.switchContext")}</SecondaryButton>
        <SecondaryButton size="sm" onClick={() => openDrawer("page-scheduler")}>{t("dashboard.adminSite.schedulePages")}</SecondaryButton>
      </div>

      <div style={{ height: 10 }} />

      {/* EVERY PLAN */}
      <TierSection
        tone="ink"
        label={t("dashboard.adminSite.tierEveryPlanLabel")}
        title={t("dashboard.adminSite.tierEveryPlanTitle")}
        subtitle={t("dashboard.adminSite.tierEveryPlanSubtitle")}
      >
        <PrimaryCard
          title={ENTITY_TYPE_META[state.entityType].rosterLabel}
          description={
            state.entityType === "hub"
              ? t("dashboard.adminSite.rosterDescHub")
              : t("dashboard.adminSite.rosterDescAgency")
          }
          icon={<Icon name="team" size={14} stroke={1.7} />}
          affordance={state.entityType === "hub" ? t("dashboard.adminSite.rosterAffordanceHub") : t("dashboard.adminSite.rosterAffordanceAgency")}
          onClick={() => setPage("talent")}
        />
        <PrimaryCard
          title={t("dashboard.adminSite.directorySettingsTitle")}
          description={t("dashboard.adminSite.directorySettingsDesc")}
          icon={<Icon name="settings" size={14} stroke={1.7} />}
          affordance={t("dashboard.adminSite.configure")}
          onClick={() => openDrawer("storefront-visibility")}
        />
        <PrimaryCard
          title={t("dashboard.adminSite.inquiriesTitle")}
          description={t("dashboard.adminSite.inquiriesDesc")}
          icon={<Icon name="mail" size={14} stroke={1.7} />}
          affordance={t("dashboard.adminSite.openWork")}
          onClick={() => setPage("work")}
        />
        <PrimaryCard
          title={t("dashboard.adminSite.brandingTitle")}
          description={t("dashboard.adminSite.brandingDesc")}
          icon={<Icon name="palette" size={14} stroke={1.7} />}
          affordance={t("dashboard.adminSite.editBranding")}
          onClick={() => openDrawer("branding")}
        />
        <PrimaryCard
          title={t("dashboard.adminSite.activityTitle")}
          description={t("dashboard.adminSite.activityDesc")}
          icon={<Icon name="bolt" size={14} stroke={1.7} />}
          affordance={t("dashboard.adminSite.seeActivity")}
          onClick={() => openDrawer("team-activity")}
        />
      </TierSection>

      {/* STUDIO */}
      <TierSection
        tone="indigo"
        label={t("dashboard.adminSite.tierStudioLabel")}
        title={t("dashboard.adminSite.tierStudioTitle")}
        subtitle={t("dashboard.adminSite.tierStudioSubtitle")}
      >
        <TierCard
          title={t("dashboard.adminSite.widgetsTitle")}
          description={t("dashboard.adminSite.widgetsDesc")}
          icon="globe"
          requiredPlan="studio"
          currentPlan={state.plan}
          onClick={() => openDrawer("widgets")}
          onUpgrade={() =>
            openUpgrade({
              feature: t("dashboard.adminSite.widgetsTitle"),
              why: t("dashboard.adminSite.widgetsUpgradeWhy"),
              requiredPlan: "studio",
              unlocks: [
                t("dashboard.adminSite.widgetsUnlock1"),
                t("dashboard.adminSite.widgetsUnlock2"),
                t("dashboard.adminSite.widgetsUnlock3"),
              ],
            })
          }
        />
        <TierCard
          title={t("dashboard.adminSite.apiKeysTitle")}
          description={t("dashboard.adminSite.apiKeysDesc")}
          icon="settings"
          requiredPlan="studio"
          currentPlan={state.plan}
          onClick={() => openDrawer("api-keys")}
          onUpgrade={() =>
            openUpgrade({
              feature: t("dashboard.adminSite.apiAccessFeature"),
              why: t("dashboard.adminSite.apiKeysUpgradeWhy"),
              requiredPlan: "studio",
              unlocks: [
                t("dashboard.adminSite.apiKeysUnlock1"),
                t("dashboard.adminSite.apiKeysUnlock2"),
                t("dashboard.adminSite.apiKeysUnlock3"),
              ],
            })
          }
        />
        <TierCard
          title={t("dashboard.adminSite.customDomainTitle")}
          description={
            bridgeTenantIdentity?.verifiedDomain
              ? interpolate(t("dashboard.adminSite.customDomainLiveAt"), { domain: bridgeTenantIdentity.verifiedDomain })
              : interpolate(t("dashboard.adminSite.customDomainCurrentlyAt"), { domain: bridgeTenantIdentity?.slug ? `${bridgeTenantIdentity.slug}.tulala.digital` : effectiveTenant.domain })
          }
          icon="globe"
          requiredPlan="studio"
          currentPlan={state.plan}
          onClick={() => openDrawer("domain")}
          onUpgrade={() =>
            openUpgrade({
              feature: t("dashboard.adminSite.customDomainFeature"),
              why: t("dashboard.adminSite.customDomainUpgradeWhy"),
              requiredPlan: "studio",
              unlocks: [
                t("dashboard.adminSite.customDomainUnlock1"),
                t("dashboard.adminSite.customDomainUnlock2"),
                t("dashboard.adminSite.customDomainUnlock3"),
              ],
            })
          }
          meta={bridgeTenantIdentity?.verifiedDomain ? <><StatDot tone="green" /> {t("dashboard.adminSite.verified")}</> : undefined}
        />
      </TierSection>

      {/* AGENCY */}
      <TierSection
        tone="amber"
        label={t("dashboard.adminSite.tierAgencyLabel")}
        title={t("dashboard.adminSite.tierAgencyTitle")}
        subtitle={t("dashboard.adminSite.tierAgencySubtitle")}
      >
        <TierCard
          title={t("dashboard.adminSite.homepageTitle")}
          description={meetsPlan(state.plan, "agency") ? t("dashboard.adminSite.homepageDescDraft") : t("dashboard.adminSite.homepageDescHero")}
          icon="bolt"
          requiredPlan="agency"
          currentPlan={state.plan}
          onClick={() => openDrawer("homepage")}
          onUpgrade={() =>
            openUpgrade({
              feature: t("dashboard.adminSite.homepageFeature"),
              why: t("dashboard.adminSite.homepageUpgradeWhy"),
              requiredPlan: "agency",
            })
          }
        />
        <TierCard
          title={t("dashboard.adminSite.pagesTitle")}
          description={interpolate(t("dashboard.adminSite.pagesDesc"), { pages: SITE_PAGES.filter(p=>p.status==="published").length, drafts: SITE_PAGES.filter(p=>p.status==="draft").length })}
          icon="globe"
          requiredPlan="agency"
          currentPlan={state.plan}
          onClick={() => openDrawer("pages")}
          onUpgrade={() =>
            openUpgrade({
              feature: t("dashboard.adminSite.pagesTitle"),
              why: t("dashboard.adminSite.pagesUpgradeWhy"),
              requiredPlan: "agency",
            })
          }
        />
        <TierCard
          title={t("dashboard.adminSite.postsTitle")}
          description={t("dashboard.adminSite.postsDesc")}
          icon="mail"
          requiredPlan="agency"
          currentPlan={state.plan}
          onClick={() => openDrawer("posts")}
          onUpgrade={() =>
            openUpgrade({
              feature: t("dashboard.adminSite.postsTitle"),
              why: t("dashboard.adminSite.postsUpgradeWhy"),
              requiredPlan: "agency",
            })
          }
        />
        <TierCard
          title={t("dashboard.adminSite.navigationTitle")}
          description={t("dashboard.adminSite.navigationDesc")}
          icon="settings"
          requiredPlan="agency"
          currentPlan={state.plan}
          onClick={() => openDrawer("navigation")}
          onUpgrade={() =>
            openUpgrade({
              feature: t("dashboard.adminSite.navigationFeature"),
              why: t("dashboard.adminSite.navigationUpgradeWhy"),
              requiredPlan: "agency",
            })
          }
        />
        <TierCard
          title={t("dashboard.adminSite.seoTitle")}
          description={t("dashboard.adminSite.seoDesc")}
          icon="search"
          requiredPlan="agency"
          currentPlan={state.plan}
          onClick={() => openDrawer("seo")}
          onUpgrade={() =>
            openUpgrade({
              feature: t("dashboard.adminSite.seoTitle"),
              why: t("dashboard.adminSite.seoUpgradeWhy"),
              requiredPlan: "agency",
            })
          }
        />
      </TierSection>

      {/* NETWORK */}
      <TierSection
        tone="green"
        label={t("dashboard.adminSite.tierNetworkLabel")}
        title={t("dashboard.adminSite.tierNetworkTitle")}
        subtitle={t("dashboard.adminSite.tierNetworkSubtitle")}
        rightSlot={
          <button
            type="button"
            onClick={() => openUpgrade({
              feature: t("dashboard.adminSite.networkPlanFeature"),
              why: t("dashboard.adminSite.networkPlanUpgradeWhy"),
              requiredPlan: "network",
            })}
            style={{
              fontFamily: FONTS.body,
              fontSize: 12,
              color: COLORS.inkMuted,
              background: "transparent",
              border: "none",
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              gap: 5,
              padding: 0,
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = COLORS.ink)}
            onMouseLeave={(e) => (e.currentTarget.style.color = COLORS.inkMuted)}
          >
            {t("dashboard.adminSite.contactSales")} <Icon name="arrow-right" size={11} />
          </button>
        }
      >
        <TierCard
          title={t("dashboard.adminSite.hubPublishingTitle")}
          description={t("dashboard.adminSite.hubPublishingDesc")}
          icon="globe"
          requiredPlan="network"
          currentPlan={state.plan}
          onClick={() => openDrawer("hub-distribution")}
          onUpgrade={() =>
            openUpgrade({
              feature: t("dashboard.adminSite.hubPublishingTitle"),
              why: t("dashboard.adminSite.hubPublishingUpgradeWhy"),
              requiredPlan: "network",
            })
          }
        />
        <TierCard
          title={t("dashboard.adminSite.multiAgencyTitle")}
          description={t("dashboard.adminSite.multiAgencyDesc")}
          icon="team"
          requiredPlan="network"
          currentPlan={state.plan}
          onClick={() => openDrawer("hub-distribution")}
          onUpgrade={() =>
            openUpgrade({
              feature: t("dashboard.adminSite.multiAgencyFeature"),
              why: t("dashboard.adminSite.multiAgencyUpgradeWhy"),
              requiredPlan: "network",
              unlocks: [
                t("dashboard.adminSite.multiAgencyUnlock1"),
                t("dashboard.adminSite.multiAgencyUnlock2"),
                t("dashboard.adminSite.multiAgencyUnlock3"),
              ],
            })
          }
        />
      </TierSection>
    </>
  );
}

// Site setup walkthrough banner — full-width prominent card
function SiteSetupBanner() {
  const t = useT();
  const { openDrawer } = useAdminShell();
  return (
    <div
      style={{
        background: COLORS.surfaceAlt,
        border: `1px solid rgba(15,79,62,0.22)`,
        borderRadius: 14,
        padding: 22,
        display: "flex",
        alignItems: "center",
        gap: 18,
      }}
    >
      <div style={{ width: 44, height: 44, borderRadius: 11, background: "rgba(15,79,62,0.16)", display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }} className="text-admin-accent-deep">
        <Icon name="sparkle" size={20} stroke={1.8} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="mb-1">
          <CapsLabel color={COLORS.accentDeep} style={{ letterSpacing: 1.6 }}>
            {t("dashboard.adminSite.setupBannerEyebrow")}
          </CapsLabel>
        </div>
        <h2 style={{ fontFamily: FONTS.display, fontSize: 22, fontWeight: 500, letterSpacing: -0.3, margin: 0, lineHeight: 1.25 }} className="text-admin-ink">
          {t("dashboard.adminSite.setupBannerTitle")}
        </h2>
        <p style={{ fontFamily: FONTS.body, fontSize: 13, margin: "4px 0 0", lineHeight: 1.55, maxWidth: 720 }} className="text-admin-ink-muted">
          {t("dashboard.adminSite.setupBannerBody")}
        </p>
      </div>
      <PrimaryButton onClick={() => openDrawer("site-setup")}>
        <span className="inline-flex items-center gap-1.5">
          {t("dashboard.adminSite.openSetup")}
          <Icon name="arrow-right" size={13} stroke={1.8} />
        </span>
      </PrimaryButton>
    </div>
  );
}
