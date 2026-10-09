"use client";

import { useT } from "@/i18n/use-t";
import { interpolate } from "@/i18n/interpolate";
import { Divider, Icon, PrimaryButton, SecondaryButton, SecondaryCard } from "../../primitives";
import { COLORS, FONTS, MY_TALENT_PROFILE, TALENT_PROFILES_BY_ID, TAXONOMY, TAXONOMY_PARENT_LABEL_KEYS, applyProfileOverride, buildFreshTalentProfile, clearPendingReview, computeProfileCompleteness, getPendingReviewForRoster, getProfileById, useAdminShell, usePendingReviewSubscription, useProfileOverrideSubscription } from "../../state";
import { PageHeader } from "../shared/page-chrome-1";
import { ProfileEditorSections, ProfileReadyCard } from "./ProfileEditorPanel";
import { AllSectionsGrid, EngagementStrip, ProfileHero } from "../shared/profile-sections-1";
import { PersonalPageBand } from "../shared/profile-sections-2";
import { resolveTalentOwnPageState } from "@/lib/talent/public-profile-href";
import { useCurrentOrigin } from "@/lib/talent/use-public-profile-href";
import { useTalentSiteDashboardInitialLoad } from "@/components/talent/site/TalentSiteDashboardProvider";



/** Labels of the model-industry taxonomy parents (models, hosts) and their children. */
const MODEL_INDUSTRY_TRADE_LABELS: ReadonlySet<string> = new Set(
  TAXONOMY.filter((parent) => parent.id === "models" || parent.id === "hosts").flatMap((parent) => [
    parent.label.toLowerCase(),
    ...parent.children.map((c) => c.label.toLowerCase()),
  ]),
);

export function MyProfilePage() {
  const t = useT();
  const { openDrawer, toast, bridgeTalentSelfProfile, bridgeTalentPageAnalytics, tenantSlug, bridgeTenantIdentity } = useAdminShell();
  // Use the real profile id from the bridge when available; fall back to mock.
  const selfTalentId = bridgeTalentSelfProfile?.id ?? "t1";
  // Subscribe to override store + read the MERGED profile. Edits in
  // the workspace/self profile shell that finalSubmit() into the
  // override store now flow through here without a refresh.
  useProfileOverrideSubscription();
  usePendingReviewSubscription();
  const pendingMine = getPendingReviewForRoster({ id: selfTalentId, name: bridgeTalentSelfProfile?.displayName ?? MY_TALENT_PROFILE.name });
  // For display: when the live bridge has a real talent profile that
  // ISN'T in the prototype mock index (i.e., a genuine signed-in talent),
  // build a fresh profile scaffold from bridge fields. Otherwise fall
  // back to mock data (Marta) so the prototype demo still works.
  const baseProfile = applyProfileOverride(
    selfTalentId,
    bridgeTalentSelfProfile && !TALENT_PROFILES_BY_ID[selfTalentId]
      // Hand the real page analytics in so profileViews7d / inquiries7d /
      // viewsTrend carry measured values instead of the placeholder zeros.
      // Null (Free tier) leaves them at 0 and the EngagementStrip renders the
      // upsell rather than presenting that zero as a measurement.
      ? buildFreshTalentProfile(bridgeTalentSelfProfile, bridgeTalentPageAnalytics?.data ?? null)
      : getProfileById(selfTalentId),
  );
  // Catalog-driven completeness — replaces the static `completeness`
  // int + `missing` array on the seed. Counts applicable fields per
  // primaryType, counts filled, returns percent + a missing list.
  // As the catalog grows or the talent fills more fields, the math
  // updates automatically — no hand-tuned numbers.
  const catalogCompleteness = computeProfileCompleteness(
    baseProfile,
    [baseProfile.primaryType, ...baseProfile.secondaryTypes]
  );
  // Override both `completeness` (number) AND `missing` (string[]) so
  // every downstream consumer reads the catalog-derived values.
  const p = {
    ...baseProfile,
    completeness: catalogCompleteness.percent,
    missing: catalogCompleteness.missing.map(m => m.label),
  };
  const m = p.measurements;

  const openSection = (section: string) => openDrawer("talent-profile-shell", { mode: "edit-self", talentId: selfTalentId, section });

  // Phase C4 — derive role labels for the page header. Primary +
  // secondary roles render as "Model · also Host" so the multi-role
  // identity is obvious at the top of the dashboard.
  // Localized: resolve the taxonomy PARENT label via its catalog key when one
  // exists (dashboard.enums.talentRole.*), falling back to the English fixture
  // label for any id without a key. `t()` returns the key itself on a miss, so
  // guard against that and fall back to the English label too.
  const roleLabelFor = (id: string | undefined): string | undefined => {
    const parent = TAXONOMY.find(tx => tx.id === id);
    if (!parent) return undefined;
    const key = TAXONOMY_PARENT_LABEL_KEYS[parent.id];
    const localized = key ? t(key) : "";
    return localized && localized !== key ? localized : parent.label;
  };
  // A real talent's trade is the bridged label; the scaffold's primaryType
  // defaults to "models" for everyone, so it cannot decide this alone.
  const showModelSections = bridgeTalentSelfProfile
    ? MODEL_INDUSTRY_TRADE_LABELS.has((bridgeTalentSelfProfile.primaryTypeLabel ?? "").trim().toLowerCase())
    : true;
  const primaryRoleLabel = roleLabelFor(p.primaryType) ?? t("dashboard.talentMyProfile.roleFallback");
  const secondaryRoleLabels = p.secondaryTypes
    .map(id => roleLabelFor(id))
    .filter((l): l is string => !!l);
  const roleSummary = secondaryRoleLabels.length > 0
    ? `${primaryRoleLabel} · ${t("dashboard.talentMyProfile.roleAlso")} ${secondaryRoleLabels.join(" · ")}`
    : primaryRoleLabel;

  // TUL-90: hub `/t/<code>` when published. TUL-347: if the hub is not live but
  // the website is, show that address instead of "no public link".
  const origin = useCurrentOrigin();
  const siteLoad = useTalentSiteDashboardInitialLoad();
  const ownPage = bridgeTalentSelfProfile
    ? resolveTalentOwnPageState({
        profileCode: bridgeTalentSelfProfile.profileCode,
        workflowStatus: bridgeTalentSelfProfile.workflowStatus,
        isPubliclyHidden: bridgeTalentSelfProfile.isPubliclyHidden,
        currentOrigin: origin,
      })
    : null;
  const liveSiteHref =
    siteLoad?.ok && typeof siteLoad.state.publicSiteUrl === "string" && siteLoad.state.publicSiteUrl.trim()
      ? siteLoad.state.publicSiteUrl.trim()
      : null;
  const previewHref = ownPage?.href ?? liveSiteHref;
  const publicUrlLabel = ownPage?.label ?? (liveSiteHref ? liveSiteHref.replace(/^https?:\/\//, "") : p.publicUrl);

  // One header line: drop empty parts so no stray " · " separators appear (DS-34).
  const headerSubtitle = [
    bridgeTalentSelfProfile ? (bridgeTalentSelfProfile.primaryTypeLabel ?? t("dashboard.talentMyProfile.chooseTrade")) : roleSummary,
    p.measurementsSummary,
    bridgeTalentSelfProfile?.homeCity ?? p.city,
  ]
    .map((part) => (typeof part === "string" ? part.trim() : ""))
    .filter(Boolean)
    .join(" · ");

  return (
    // The page body is ONE grid item. Its children used to be a bare fragment,
    // so every card became its own grid cell and flowed into the right column
    // (blank card, empty "Personal page" heading, status cards side by side;
    // QA DS-33). 
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
    <div className="min-w-0">
      <PageHeader
        title={bridgeTalentSelfProfile?.displayName ?? p.name}
        subtitle={headerSubtitle}
        actions={
          // Header actions are intentionally compact (size="sm"). The
          // md size is for body-level CTAs; in a header alongside the
          // h1, md reads as too-chunky. Both buttons match width feel
          // because they're sized identically and the icon adds the
          // ~9px the longer label needs to balance.
          <>
            <SecondaryButton size="sm" onClick={() => openDrawer("talent-public-preview")}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                <Icon name="external" size={11} /> {t("dashboard.talentMyProfile.previewAsClient")}
              </span>
            </SecondaryButton>
            <PrimaryButton size="sm" onClick={() => openSection("identity")}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                <Icon name="pencil" size={11} /> {t("dashboard.talentMyProfile.editProfile")}
              </span>
            </PrimaryButton>
          </>
        }
      />

      {/* Audit fix #2 — pending-review banner. Shows when Marta has
          submitted a self-edit that the agency hasn't reviewed yet,
          plus a soft "withdraw" affordance so she can pull it back if
          she changes her mind before the agency acts. */}
      {pendingMine && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: "10px 14px",
            marginBottom: 14,
            borderRadius: 12,
            background: "rgba(46,124,209,0.06)",
            border: `1px solid rgba(46,124,209,0.22)`,
            fontFamily: FONTS.body,
          }}
        >
          <span aria-hidden className="text-sm">⏳</span>
          <div className="flex-1 min-w-0">
            <div style={{ fontSize: 13, fontWeight: 600, color: "#1f4d8a" }}>
              {t("dashboard.talentMyProfile.pendingTitle")}
            </div>
            <div style={{ fontSize: 11.5, marginTop: 1 }} className="text-admin-ink-muted">
              {pendingMine.note} · {t("dashboard.talentMyProfile.pendingNoteSuffix")}
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              clearPendingReview(pendingMine.talentId);
              toast(t("dashboard.talentMyProfile.withdrawToast"));
            }}
            style={{
              padding: "5px 11px",
              borderRadius: 999,
              border: `1px solid rgba(46,124,209,0.4)`,
              background: "#fff",
              color: "#1f4d8a",
              fontFamily: FONTS.body,
              fontSize: 11.5,
              fontWeight: 600,
              cursor: "pointer",
              whiteSpace: "nowrap",
            }}
          >
            {t("dashboard.talentMyProfile.withdraw")}
          </button>
        </div>
      )}

      {/* One completion value: website eligibility (same as Today). */}
      <ProfileReadyCard openSection={openSection} />
      <ProfileEditorSections openSection={openSection} />

      {/* ── Hero band ──────────────────────────────────────────────── */}
      <ProfileHero />

      {/* ── Legacy model-industry sections (Polaroids, Physical details,
          Wardrobe, Credits…). Only for trades they describe; every other
          trade edits through the sections above, and their "Add required"
          counts would contradict the one completion value. */}
      {showModelSections && (
        <>
          <Divider label={t("dashboard.talentMyProfile.editSections")} />
          <AllSectionsGrid openSection={openSection} />
        </>
      )}

      {/* ── Engagement strip ──────────────────────────────────────── */}
      <div className="mt-4">
        <EngagementStrip profile={p} />
      </div>

      {/* ── Public profile URL ────────────────────────────────────── */}
      <div className="mt-3">
        <SecondaryCard
          title={t("dashboard.talentMyProfile.publicProfileTitle")}
          description={publicUrlLabel
            ? interpolate(t("dashboard.talentMyProfile.publicProfileLive"), { url: publicUrlLabel })
            : t("dashboard.talentMyProfile.publicProfileNotPublished")}
          affordance={publicUrlLabel ? t("dashboard.talentMyProfile.openInNewTab") : undefined}
          onClick={publicUrlLabel ? () => window.open(ownPage?.href ?? `https://${publicUrlLabel}`, "_blank") : undefined}
        >
          {publicUrlLabel && (
            <div style={{ marginTop: 10, padding: "10px 14px", borderRadius: 10, border: `1px solid rgba(15,79,62,0.18)`, display: "flex", alignItems: "center", gap: 10 }} className="bg-admin-surface-alt">
              <Icon name="external" size={12} color={COLORS.accentDeep} />
              <span style={{ fontFamily: FONTS.mono, fontSize: 11.5 }} className="text-admin-ink">{publicUrlLabel}</span>
            </div>
          )}
        </SecondaryCard>
      </div>

      {/* ── Personal page (premium subscription tier) ─────────────── */}
      <Divider label={t("dashboard.talentMyProfile.personalPage")} />
      <PersonalPageBand />
    </div>
    <aside className="hidden xl:block">
      <p className="mb-2 font-admin-body text-[12px] font-semibold uppercase tracking-wide text-admin-ink-muted">
        {t("dashboard.talentMyProfile.editor.previewAside")}
      </p>
      {previewHref ? (
        <a
          href={previewHref}
          target="_blank"
          rel="noreferrer"
          className="block rounded-2xl border border-admin-border-soft bg-white p-4 font-admin-body text-[13px] font-semibold text-[var(--tc-action)]"
        >
          {previewHref.replace(/^https?:\/\//, "")}
        </a>
      ) : (
        <p className="font-admin-body text-[13px] text-admin-ink-muted">{t("dashboard.talentMyProfile.editor.previewUnavailable")}</p>
      )}
    </aside>
    </div>
  );
}
