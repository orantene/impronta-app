"use client";

// ════════════════════════════════════════════════════════════════════
// talent-drawers/profile-extras — Phase 1d body chunk.
// Owns: TalentLinksDrawer, TalentReviewsDrawer, TalentShowreelDrawer,
// TalentMeasurementsDrawer, TalentDocumentsDrawer,
// TalentEmergencyContactDrawer, TalentPublicPreviewDrawer.
// Private helpers: PreviewKv.
// Bodies copied byte-for-byte from talent-drawers.tsx; no behavior change.
// ════════════════════════════════════════════════════════════════════

import { useState } from "react";
import { useT } from "@/i18n/use-t";
import { interpolate } from "@/i18n/interpolate";
import { updateSelfEmergencyContact } from "@/lib/server-actions/talent-self-profile-sections";
import {
  COLORS,
  FONTS,
  MY_TALENT_PROFILE,
  TALENT_TIER_META,
  TENANT,
  useAdminShell,
  type TalentSubscriptionTier,
} from "../state";
import {
  Divider,
  DrawerShell,
  FieldRow,
  PrimaryButton,
  SecondaryButton,
  TextInput,
} from "../primitives";
import { ProfileSectionNotConnected, SaveErrorBanner, SummaryStat } from "./shared";

// ─── External links ─────────────────────────────────────────────

export function TalentLinksDrawer() {
  const { state, closeDrawer } = useAdminShell();
  const t = useT();
  const open = state.drawer.drawerId === "talent-links";
  const links = MY_TALENT_PROFILE.links;

  return (
    <DrawerShell
      open={open}
      onClose={closeDrawer}
      title={t("dashboard.talentDrawers.profileExtras.externalLinks")}
      description={t("dashboard.talentDrawers.profileExtras.externalLinksDesc")}
      width={560}
      footer={<SecondaryButton onClick={closeDrawer}>{t("dashboard.talentDrawers.close")}</SecondaryButton>}
    >
      <div className="flex flex-col gap-2">
        {links.map((l, i) => (
          <div
            key={i}
            style={{
              display: "grid",
              gridTemplateColumns: "auto 1fr auto",
              alignItems: "center",
              gap: 12,
              padding: "12px 14px",
              background: "#fff",
              border: `1px solid ${COLORS.borderSoft}`,
              borderRadius: 10,
            }}
          >
            <span style={{ fontFamily: FONTS.body, fontSize: 11, fontWeight: 600, letterSpacing: 1.2, textTransform: "uppercase", width: 80 }} className="text-admin-ink-muted">
              {l.kind}
            </span>
            <div className="min-w-0">
              <div style={{ fontFamily: FONTS.body, fontSize: 13, fontWeight: 500 }} className="text-admin-ink">
                {l.label}
              </div>
              <div style={{ fontFamily: FONTS.mono, fontSize: 11, marginTop: 2 }} className="text-admin-ink-muted">
                {l.url}
              </div>
            </div>
            {l.followers ? (
              <span style={{ fontFamily: FONTS.body, fontSize: 11.5 }} className="text-admin-ink-muted">
                {l.followers}
              </span>
            ) : (
              <span style={{ fontFamily: FONTS.body, fontSize: 11.5 }} className="text-admin-ink-dim">—</span>
            )}
          </div>
        ))}
      </div>
    </DrawerShell>
  );
}

// ─── Reviews ────────────────────────────────────────────────────

export function TalentReviewsDrawer() {
  const { state, closeDrawer } = useAdminShell();
  const t = useT();
  const open = state.drawer.drawerId === "talent-reviews";
  const reviews = MY_TALENT_PROFILE.reviews;
  const stats = MY_TALENT_PROFILE.bookingStats;
  const avg = reviews.reduce((a, r) => a + r.rating, 0) / Math.max(reviews.length, 1);

  return (
    <DrawerShell
      open={open}
      onClose={closeDrawer}
      title={t("dashboard.talentDrawers.profileExtras.reviews")}
      description={t("dashboard.talentDrawers.profileExtras.reviewsDesc")}
      width={580}
      footer={<SecondaryButton onClick={closeDrawer}>{t("dashboard.talentDrawers.close")}</SecondaryButton>}
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: 8,
          marginBottom: 16,
        }}
      >
        <SummaryStat label={t("dashboard.talentDrawers.profileExtras.reviewsAverage")} value={interpolate(t("dashboard.talentDrawers.profileExtras.reviewsScoreValue"), { score: avg.toFixed(1) })} accent="green" />
        <SummaryStat label={t("dashboard.talentDrawers.profileExtras.reviewsCount")} value={String(reviews.length)} accent="ink" />
        <SummaryStat label={t("dashboard.talentDrawers.profileExtras.reviewsOnTime")} value={`${stats.onTimeRate}%`} accent="green" />
      </div>
      <div className="flex flex-col gap-2.5">
        {reviews.map((r) => (
          <div
            key={r.id}
            style={{
              padding: "14px 16px",
              background: "#fff",
              border: `1px solid ${COLORS.borderSoft}`,
              borderRadius: 10,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
              <span className="text-admin-accent-deep text-admin-13">
                {"★".repeat(r.rating)}
                <span className="text-admin-ink-dim">{"★".repeat(5 - r.rating)}</span>
              </span>
              <span style={{ fontFamily: FONTS.body, fontSize: 11.5, marginLeft: "auto" }} className="text-admin-ink-muted">
                {r.shootDate}
              </span>
            </div>
            <p style={{ margin: 0, fontFamily: FONTS.body, fontSize: 13.5, lineHeight: 1.55 }} className="text-admin-ink">
              &quot;{r.body}&quot;
            </p>
            <div style={{ marginTop: 8, fontFamily: FONTS.body, fontSize: 11.5 }} className="text-admin-ink-muted">
              — {r.reviewerName} · {r.reviewerRole} · {r.brand}
            </div>
          </div>
        ))}
      </div>
    </DrawerShell>
  );
}

// ─── Showreel ───────────────────────────────────────────────────

export function TalentShowreelDrawer() {
  const { state, closeDrawer } = useAdminShell();
  const t = useT();
  const open = state.drawer.drawerId === "talent-showreel";
  const p = MY_TALENT_PROFILE;

  return (
    <DrawerShell
      open={open}
      onClose={closeDrawer}
      title={t("dashboard.talentDrawers.profileExtras.showreel")}
      description={interpolate(t("dashboard.talentDrawers.profileExtras.showreelDesc"), { duration: p.showreelDuration ?? "0:42" })}
      width={620}
      footer={
        <>
          <SecondaryButton disabled>{t("dashboard.talentDrawers.profileExtras.showreelReplace")}</SecondaryButton>
          <PrimaryButton onClick={closeDrawer}>{t("dashboard.talentDrawers.close")}</PrimaryButton>
        </>
      }
    >
      <div style={{ aspectRatio: "16 / 9", borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 96, border: `1px solid ${COLORS.borderSoft}`, marginBottom: 16, position: "relative" }} className="bg-admin-surface-alt">
        {p.showreelThumb ?? "🎞️"}
      </div>
      <Divider label={t("dashboard.talentDrawers.profileExtras.showreelWhy")} />
      <ul style={{ margin: 0, paddingLeft: 18, fontFamily: FONTS.body, fontSize: 13, lineHeight: 1.7 }} className="text-admin-ink">
        <li>{t("dashboard.talentDrawers.profileExtras.showreelBullet1")}</li>
        <li>{t("dashboard.talentDrawers.profileExtras.showreelBullet2")}</li>
        <li>{t("dashboard.talentDrawers.profileExtras.showreelBullet3")}</li>
        <li>{t("dashboard.talentDrawers.profileExtras.showreelBullet4")}</li>
      </ul>
    </DrawerShell>
  );
}

// ─── Measurements ───────────────────────────────────────────────

export function TalentMeasurementsDrawer() {
  const { state, closeDrawer } = useAdminShell();
  const t = useT();
  const open = state.drawer.drawerId === "talent-measurements";

  return (
    <DrawerShell
      open={open}
      onClose={closeDrawer}
      title={t("dashboard.talentDrawers.profileExtras.measurements")}
      description={t("dashboard.talentDrawers.profileExtras.measurementsDesc")}
      width={580}
      footer={<SecondaryButton onClick={closeDrawer}>{t("dashboard.talentDrawers.close")}</SecondaryButton>}
    >
      <ProfileSectionNotConnected section="measurements" />
    </DrawerShell>
  );
}

// ─── Documents ──────────────────────────────────────────────────

export function TalentDocumentsDrawer() {
  const { state, closeDrawer } = useAdminShell();
  const t = useT();
  const open = state.drawer.drawerId === "talent-documents";

  return (
    <DrawerShell
      open={open}
      onClose={closeDrawer}
      title={t("dashboard.talentDrawers.profileExtras.documents")}
      description={t("dashboard.talentDrawers.profileExtras.documentsDesc")}
      width={560}
      footer={<SecondaryButton onClick={closeDrawer}>{t("dashboard.talentDrawers.close")}</SecondaryButton>}
    >
      <ProfileSectionNotConnected section="documents" />
    </DrawerShell>
  );
}

// ─── Emergency contact ──────────────────────────────────────────

export function TalentEmergencyContactDrawer() {
  const { state, closeDrawer, bridgeTalentSelfProfile } = useAdminShell();
  const t = useT();
  const open = state.drawer.drawerId === "talent-emergency-contact";
  const talentProfileId = bridgeTalentSelfProfile?.id ?? null;
  const c = MY_TALENT_PROFILE.emergencyContact;

  const [name, setName] = useState(c.name);
  const [relation, setRelation] = useState(c.relation);
  const [phone, setPhone] = useState(c.phone);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const handleSave = async () => {
    if (!talentProfileId) { setSaveError(t("dashboard.talentDrawers.noProfileLoaded")); return; }
    if (!name.trim()) { setSaveError(t("dashboard.talentDrawers.profileExtras.nameRequired")); return; }
    setSaving(true);
    setSaveError(null);
    const result = await updateSelfEmergencyContact({
      talent_profile_id: talentProfileId,
      name,
      relation,
      phone,
    });
    setSaving(false);
    if (!result.ok) { setSaveError(result.error); return; }
    closeDrawer();
  };

  return (
    <DrawerShell
      open={open}
      onClose={closeDrawer}
      title={t("dashboard.talentDrawers.profileExtras.emergencyContact")}
      description={t("dashboard.talentDrawers.profileExtras.emergencyContactDesc")}
      width={520}
      footer={
        <>
          <SecondaryButton onClick={closeDrawer}>{t("dashboard.talentDrawers.cancel")}</SecondaryButton>
          <PrimaryButton onClick={handleSave} disabled={saving}>
            {saving ? t("dashboard.talentDrawers.saving") : t("dashboard.talentDrawers.save")}
          </PrimaryButton>
        </>
      }
    >
      {saveError && <SaveErrorBanner error={saveError} onDismiss={() => setSaveError(null)} />}
      <div className="flex flex-col gap-3.5">
        <FieldRow label={t("dashboard.talentDrawers.profileExtras.fieldName")}>
          <TextInput value={name} onChange={(e) => setName(e.target.value)} />
        </FieldRow>
        <FieldRow label={t("dashboard.talentDrawers.profileExtras.fieldRelation")}>
          <TextInput value={relation} onChange={(e) => setRelation(e.target.value)} />
        </FieldRow>
        <FieldRow label={t("dashboard.talentDrawers.profileExtras.fieldPhone")} hint={t("dashboard.talentDrawers.profileExtras.phoneHint")}>
          <TextInput value={phone} onChange={(e) => setPhone(e.target.value)} />
        </FieldRow>
        <Divider label={t("dashboard.talentDrawers.profileExtras.whenShown")} />
        <ul style={{ margin: 0, paddingLeft: 18, fontFamily: FONTS.body, fontSize: 13, lineHeight: 1.7 }} className="text-admin-ink-muted">
          <li>{t("dashboard.talentDrawers.profileExtras.whenShownBullet1")}</li>
          <li>{t("dashboard.talentDrawers.profileExtras.whenShownBullet2")}</li>
          <li>{t("dashboard.talentDrawers.profileExtras.whenShownBullet3")}</li>
        </ul>
      </div>
    </DrawerShell>
  );
}

// ─── Public preview ─────────────────────────────────────────────
//
// Talent's view of "where am I visible right now and what would change
// if I upgraded?". Each tier tab shows:
//   1. **Distribution links** — the actual surfaces the public can see
//      this talent on at the selected tier. Copy + Open per row.
//   2. **What this tier unlocks** — concrete features added vs. the
//      previous tier. Always shown for context, even on Free.
//
// We do NOT try to render a faked-mockup of the public page inside the
// drawer — that's brittle (image rendering issues) and never matches
// the real surface. Better: link them out to the live URLs.

export function TalentPublicPreviewDrawer() {
  const { state, closeDrawer, toast, openDrawer } = useAdminShell();
  const t = useT();
  const open = state.drawer.drawerId === "talent-public-preview";
  const p = MY_TALENT_PROFILE;
  const slug = p.subscription.personalPageUrl.replace(/^.*\/t\//, "").trim() || "marta-reyes";
  const currentTier = p.subscription.tier;
  const [previewTier, setPreviewTier] = useState<TalentSubscriptionTier>(currentTier);

  // ── Build the distribution-links list for the previewed tier ──
  type LinkRow = {
    id: string;
    label: string;
    sub: string;
    url: string;
    icon: string;
    primary?: boolean;
  };
  const links: LinkRow[] = (() => {
    const rows: LinkRow[] = [];

    // Tulala personal page — always present. Custom domain only on
    // Max (and only if verified).
    const hasCustomDomain = previewTier === "max" && p.subscription.customDomain && p.subscription.customDomainStatus === "verified";
    if (hasCustomDomain) {
      rows.push({
        id: "personal-custom",
        label: t("dashboard.talentDrawers.profileExtras.personalCustomLabel"),
        sub: t("dashboard.talentDrawers.profileExtras.personalCustomSub"),
        url: `https://${p.subscription.customDomain}`,
        icon: "globe",
        primary: true,
      });
    } else {
      rows.push({
        id: "personal-tulala",
        label: previewTier === "max" ? t("dashboard.talentDrawers.profileExtras.personalFallbackLabel") : t("dashboard.talentDrawers.profileExtras.personalTulalaLabel"),
        sub: previewTier === "max"
          ? t("dashboard.talentDrawers.profileExtras.personalFallbackSub")
          : interpolate(t("dashboard.talentDrawers.profileExtras.personalCanonicalSub"), { tier: TALENT_TIER_META[previewTier].label }),
        url: `https://tulala.digital/t/${slug}`,
        icon: "globe",
        primary: previewTier !== "max",
      });
    }

    // Agency-roster page — shown for all tiers because the agency
    // page is independent of the talent's personal-page subscription.
    if (p.primaryAgency) {
      rows.push({
        id: "agency",
        label: interpolate(t("dashboard.talentDrawers.profileExtras.agencyRosterLabel"), { agency: p.primaryAgency }),
        sub: interpolate(t("dashboard.talentDrawers.profileExtras.agencyRosterSub"), { domain: TENANT.customDomain || TENANT.domain }),
        url: `https://${TENANT.customDomain || TENANT.domain}/talent/${slug}`,
        icon: "team",
      });
    }

    // Hub listings — same independence rule. Show 1-2 representative
    // hubs the talent appears on. (Production wires this to real
    // hub_memberships rows.)
    rows.push({
      id: "hub-discover",
      label: t("dashboard.talentDrawers.profileExtras.hubDiscoverLabel"),
      sub: t("dashboard.talentDrawers.profileExtras.hubDiscoverSub"),
      url: "https://tulala.network/hub/discover",
      icon: "search",
    });
    rows.push({
      id: "hub-vertical",
      label: t("dashboard.talentDrawers.profileExtras.hubVerticalLabel"),
      sub: t("dashboard.talentDrawers.profileExtras.hubVerticalSub"),
      url: "https://tulala.network/hub/hospitality",
      icon: "briefcase",
    });

    return rows;
  })();

  // ── Tier feature lists ──
  // Each list is what THIS tier unlocks ON TOP of the tier below it.
  // Drives the "what this tier gives you" panel.
  const tierFeatures: Record<TalentSubscriptionTier, { headline: string; bullets: string[] }> = {
    free: {
      headline: t("dashboard.talentDrawers.profileExtras.tierFreeHeadline"),
      bullets: [
        interpolate(t("dashboard.talentDrawers.profileExtras.tierFreeBullet1"), { slug }),
        t("dashboard.talentDrawers.profileExtras.tierFreeBullet2"),
        t("dashboard.talentDrawers.profileExtras.tierFreeBullet3"),
        t("dashboard.talentDrawers.profileExtras.tierFreeBullet4"),
      ],
    },
    pro: {
      headline: t("dashboard.talentDrawers.profileExtras.tierProHeadline"),
      bullets: [
        t("dashboard.talentDrawers.profileExtras.tierProBullet1"),
        t("dashboard.talentDrawers.profileExtras.tierProBullet2"),
        t("dashboard.talentDrawers.profileExtras.tierProBullet3"),
        t("dashboard.talentDrawers.profileExtras.tierProBullet4"),
        t("dashboard.talentDrawers.profileExtras.tierProBullet5"),
      ],
    },
    max: {
      headline: t("dashboard.talentDrawers.profileExtras.tierMaxHeadline"),
      bullets: [
        t("dashboard.talentDrawers.profileExtras.tierMaxBullet1"),
        t("dashboard.talentDrawers.profileExtras.tierMaxBullet2"),
        t("dashboard.talentDrawers.profileExtras.tierMaxBullet3"),
        t("dashboard.talentDrawers.profileExtras.tierMaxBullet4"),
        t("dashboard.talentDrawers.profileExtras.tierMaxBullet5"),
        t("dashboard.talentDrawers.profileExtras.tierMaxBullet6"),
      ],
    },
  };

  const features = tierFeatures[previewTier];
  const tierAheadOfCurrent = (
    previewTier === "max" && currentTier !== "max"
  ) || (previewTier === "pro" && currentTier === "free");

  return (
    <DrawerShell
      open={open}
      onClose={closeDrawer}
      title={t("dashboard.talentDrawers.profileExtras.previewAsClient")}
      description={t("dashboard.talentDrawers.profileExtras.previewAsClientDesc")}
      width={720}
      footer={
        <>
          <SecondaryButton onClick={closeDrawer}>{t("dashboard.talentDrawers.close")}</SecondaryButton>
          {tierAheadOfCurrent && (
            <PrimaryButton onClick={() => { closeDrawer(); openDrawer("talent-tier-compare"); }}>
              {interpolate(t("dashboard.talentDrawers.profileExtras.upgradeTo"), { tier: TALENT_TIER_META[previewTier].label })}
            </PrimaryButton>
          )}
        </>
      }
    >
      {/* Tier toggle */}
      <div
        style={{
          display: "flex",
          gap: 4,
          padding: 4,
          background: "rgba(11,11,13,0.04)",
          borderRadius: 999,
          marginBottom: 14,
          width: "fit-content",
        }}
      >
        {(["free", "pro", "max"] as const).map((tierId) => {
          const isActive = previewTier === tierId;
          const isCurrent = currentTier === tierId;
          return (
            <button
              key={tierId}
              onClick={() => setPreviewTier(tierId)}
              style={{
                padding: "5px 12px",
                background: isActive ? "#fff" : "transparent",
                color: isActive ? COLORS.ink : COLORS.inkMuted,
                border: "none",
                fontFamily: FONTS.body,
                fontSize: 12,
                fontWeight: 500,
                borderRadius: 999,
                cursor: "pointer",
                boxShadow: isActive ? "0 1px 3px rgba(11,11,13,0.06)" : "none",
                display: "inline-flex",
                alignItems: "center",
                gap: 5,
              }}
            >
              {TALENT_TIER_META[tierId].label}
              {isCurrent && (
                <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: 0.4, textTransform: "uppercase" }} className="text-admin-accent-deep">
                  {t("dashboard.talentDrawers.profileExtras.current")}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* ── Distribution links ─────────────────────────────────────
          The actual surfaces a client can see this talent on. Copy +
          Open per row. Custom domain only appears on Max when
          verified — otherwise the canonical Tulala URL is the active
          one. */}
      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.5, textTransform: "uppercase", marginBottom: 8 }} className="text-admin-ink-muted">
        {interpolate(t("dashboard.talentDrawers.profileExtras.whereYouAppear"), { tier: TALENT_TIER_META[previewTier].label })}
      </div>
      <div style={{
        display: "flex", flexDirection: "column", gap: 8,
        marginBottom: 18,
      }}>
        {links.map((row) => (
          <div key={row.id} style={{
            display: "flex", alignItems: "center", gap: 10,
            padding: "10px 12px",
            background: row.primary ? COLORS.accentSoft : "#fff",
            border: `1px solid ${row.primary ? "rgba(15,79,62,0.24)" : COLORS.borderSoft}`,
            borderRadius: 10,
          }}>
            <div className="flex-1 min-w-0">
              <div style={{ fontSize: 13, fontWeight: 600, fontFamily: FONTS.body }} className="text-admin-ink">
                {row.label}
              </div>
              <div style={{ fontSize: 11.5, fontFamily: FONTS.body, marginTop: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} className="text-admin-ink-muted">
                {row.url.replace(/^https?:\/\//, "")} · {row.sub}
              </div>
            </div>
            <button type="button"
              onClick={() => {
                if (typeof navigator !== "undefined" && navigator.clipboard) {
                  navigator.clipboard.writeText(row.url).catch(() => {});
                }
                toast(interpolate(t("dashboard.talentDrawers.profileExtras.copiedToast"), { url: row.url.replace(/^https?:\/\//, "") }));
              }}
              style={{
                padding: "6px 10px", borderRadius: 7,
                background: "transparent",
                border: `1px solid ${COLORS.borderSoft}`,
                color: COLORS.inkMuted,
                fontSize: 11.5, fontWeight: 500, cursor: "pointer",
                fontFamily: FONTS.body,
              }}
            >{t("dashboard.talentDrawers.copy")}</button>
            <a href={row.url} target="_blank" rel="noreferrer"
              style={{
                padding: "6px 10px", borderRadius: 7,
                background: COLORS.fill, color: "#fff",
                border: "none",
                fontSize: 11.5, fontWeight: 600, cursor: "pointer",
                fontFamily: FONTS.body,
                textDecoration: "none",
                display: "inline-flex", alignItems: "center", gap: 4,
              }}
            >
              {t("dashboard.talentDrawers.open")}
              <svg width="9" height="9" viewBox="0 0 9 9" fill="none" aria-hidden>
                <path d="M2 7l5-5M3 2h4v4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </a>
          </div>
        ))}
      </div>

      {/* ── What this tier unlocks ─────────────────────────────────
          Always shown — drives the upsell when the previewed tier is
          ahead of `currentTier`. Footer CTA flips to "Upgrade to X"
          in that case. */}
      <div style={{
        padding: 14,
        background: previewTier === currentTier ? "#fff" : COLORS.accentSoft,
        border: `1px solid ${previewTier === currentTier ? COLORS.borderSoft : "rgba(15,79,62,0.24)"}`,
        borderRadius: 12,
      }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 4 }}>
          <div style={{ fontSize: 13, fontWeight: 700, fontFamily: FONTS.body }} className="text-admin-ink">
            {features.headline}
          </div>
          {previewTier !== currentTier && tierAheadOfCurrent && (
            <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: 0.5, textTransform: "uppercase", background: "#fff", padding: "2px 7px", borderRadius: 999 }} className="text-admin-accent-deep">
              {t("dashboard.talentDrawers.profileExtras.upgradeRequired")}
            </span>
          )}
          {previewTier === currentTier && (
            <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: 0.5, textTransform: "uppercase" }} className="text-admin-success-deep">
              {t("dashboard.talentDrawers.profileExtras.active")}
            </span>
          )}
        </div>
        <ul style={{ margin: "8px 0 0", paddingLeft: 18, fontFamily: FONTS.body, fontSize: 12.5, lineHeight: 1.6 }} className="text-admin-ink">
          {features.bullets.map((b, i) => (
            <li key={i} style={{ marginBottom: 2 }}>{b}</li>
          ))}
        </ul>
      </div>

      {/* ── What's hidden until they inquire ─────────────────────────
          Useful context kept from the previous design — answers
          "what data does the client NOT see?". Quiet styling. */}
      <div style={{
        marginTop: 14, padding: "10px 12px",
        background: "rgba(11,11,13,0.02)", border: `1px solid ${COLORS.borderSoft}`,
        borderRadius: 10,
      }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.5, textTransform: "uppercase", marginBottom: 6 }} className="text-admin-ink-muted">
          {t("dashboard.talentDrawers.profileExtras.hiddenUntilInquire")}
        </div>
        <ul style={{ margin: 0, paddingLeft: 18, fontFamily: FONTS.body, fontSize: 12, lineHeight: 1.55 }} className="text-admin-ink-muted">
          <li>{t("dashboard.talentDrawers.profileExtras.hiddenBullet1")}</li>
          <li>{interpolate(t("dashboard.talentDrawers.profileExtras.hiddenBullet2"), { visibility: p.rateCard.visibility })}</li>
          <li>{t("dashboard.talentDrawers.profileExtras.hiddenBullet3")}</li>
          <li>{t("dashboard.talentDrawers.profileExtras.hiddenBullet4")}</li>
        </ul>
      </div>
    </DrawerShell>
  );
}

function PreviewKv({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        padding: "8px 10px",
        background: "rgba(11,11,13,0.02)",
        border: `1px solid ${COLORS.borderSoft}`,
        borderRadius: 8,
      }}
    >
      <div style={{ fontFamily: FONTS.body, fontSize: 10, fontWeight: 600, letterSpacing: 1.2, textTransform: "uppercase" }} className="text-admin-ink-muted">
        {label}
      </div>
      <div style={{ fontFamily: FONTS.body, fontSize: 12.5, marginTop: 3 }} className="text-admin-ink">{value}</div>
    </div>
  );
}
