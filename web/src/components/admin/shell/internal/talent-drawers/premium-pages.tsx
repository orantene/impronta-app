"use client";

// ════════════════════════════════════════════════════════════════════
// talent-drawers/premium-pages — Phase 1d body chunk.
// Owns: TalentTierCompareDrawer, TalentPersonalPageDrawer,
// TalentPageTemplateDrawer, TalentMediaEmbedsDrawer, TalentPressDrawer,
// TalentMediaKitDrawer, TalentCustomDomainDrawer.
// Private helpers: LockedBadge, FeatureCell (matrix → TALENT_TIER_CATALOG).
// Bodies copied byte-for-byte from talent-drawers.tsx; no behavior change.
// ════════════════════════════════════════════════════════════════════

import { useCallback, useState } from "react";
import { useT } from "@/i18n/use-t";
import { useDashboardText } from "../dashboard-i18n";
import { interpolate } from "@/i18n/interpolate";
import {
  COLORS,
  FONTS,
  MY_TALENT_PROFILE,
  TALENT_PAGE_TEMPLATES,
  TALENT_TIER_CATALOG,
  TALENT_TIER_META,
  tierAllows,
  useAdminShell,
  type TalentMediaKit,
  type TalentSubscriptionTier,
  type TalentTierCell,
  type TalentTierGroup,
} from "../state";
import {
  TalentEmbedsManager,
  TalentPressManager,
} from "@/components/talent/profile-extras/TalentProfileExtrasManagers";
import {
  CapsLabel,
  Divider,
  DrawerShell,
  FieldRow,
  PrimaryButton,
  SecondaryButton,
  TextInput,
  Toggle,
} from "../primitives";

// ─── Tier-group discriminant → catalog-key map (render via t(), keep raw union) ──
const TIER_GROUP_KEYS: Record<TalentTierGroup, string> = {
  page: "dashboard.talentDrawers.tierGroups.page",
  discovery: "dashboard.talentDrawers.tierGroups.discovery",
  money: "dashboard.talentDrawers.tierGroups.money",
  tools: "dashboard.talentDrawers.tierGroups.tools",
};

// ─── LockedBadge (inlined — also in _talent.tsx for MyProfilePage) ────────────
/** Lock badge shown next to a feature card when the talent's tier doesn't unlock it. */
function LockedBadge({ requiredTier }: { requiredTier: TalentSubscriptionTier }) {
  const t = useT();
  const meta = TALENT_TIER_META[requiredTier];
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        padding: "2px 7px",
        background: requiredTier === "max" ? COLORS.fill : COLORS.accentSoft,
        color: requiredTier === "max" ? "#fff" : COLORS.accent,
        border: `1px solid ${requiredTier === "max" ? COLORS.accent : "rgba(15,79,62,0.28)"}`,
        fontFamily: FONTS.body,
        fontSize: 10,
        fontWeight: 600,
        letterSpacing: 0.3,
        borderRadius: 999,
        textTransform: "uppercase",
      }}
      title={interpolate(t("dashboard.talentDrawers.premiumPages.unlockedAt"), { tier: meta.label })}
    >
      <span className="text-admin-9">🔒</span>
      {meta.label}
    </span>
  );
}

// ─── Tier compare ────────────────────────────────────────────────
// The feature matrix is data-driven: TALENT_TIER_CATALOG (state/fixtures)
// is the single source for the rows below AND the per-feature gates.

export function TalentTierCompareDrawer() {
  const { state, closeDrawer, setTalentTier } = useAdminShell();
  const t = useT();
  const open = state.drawer.drawerId === "talent-tier-compare";
  const current = state.talentTier;

  return (
    <DrawerShell
      open={open}
      onClose={closeDrawer}
      title={t("dashboard.talentDrawers.premiumPages.compareTitle")}
      description={t("dashboard.talentDrawers.premiumPages.compareDesc")}
      width={760}
      footer={
        <>
          <SecondaryButton onClick={closeDrawer}>{t("dashboard.talentDrawers.close")}</SecondaryButton>
        </>
      }
    >
      {process.env.NODE_ENV !== "production" && (
        <div style={{ marginBottom: 10, fontFamily: FONTS.body, fontSize: 11, fontWeight: 600 }} className="text-admin-ink-dim">
          {t("dashboard.talentDrawers.premiumPages.devSwitchHint")}
        </div>
      )}
      {/* Tier columns */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
        {(["free", "pro", "max"] as const).map((tierId) => {
          const meta = TALENT_TIER_META[tierId];
          const isCurrent = tierId === current;
          return (
            <div
              key={tierId}
              style={{
                padding: "16px 16px",
                background: tierId === "max" ? COLORS.fill : "#fff",
                color: tierId === "max" ? "#fff" : COLORS.ink,
                border: `1.5px solid ${isCurrent ? COLORS.accentDeep : tierId === "max" ? COLORS.accent : COLORS.borderSoft}`,
                borderRadius: 12,
                position: "relative",
              }}
            >
              {isCurrent && (
                <span style={{ position: "absolute", top: -10, left: 14, color: "#fff", fontFamily: FONTS.body, fontSize: 10, fontWeight: 700, letterSpacing: 0.5, padding: "3px 9px", borderRadius: 999, textTransform: "uppercase" }} className="bg-admin-accent-deep">
                  {t("dashboard.talentDrawers.premiumPages.current")}
                </span>
              )}
              <div
                style={{
                  fontFamily: FONTS.display,
                  fontSize: 22,
                  fontWeight: 500,
                  letterSpacing: -0.3,
                }}
              >
                {meta.label}
              </div>
              <div
                style={{
                  fontFamily: FONTS.body,
                  fontSize: 12.5,
                  opacity: 0.75,
                  marginTop: 3,
                }}
              >
                {meta.tagline}
              </div>
              {/* Pricing intentionally omitted — talent billing isn't live,
                  so we don't show a per-month price the talent can't yet be
                  charged. The waitlist card below is the single honest CTA. */}
              <p
                style={{
                  fontFamily: FONTS.body,
                  fontSize: 12.5,
                  lineHeight: 1.55,
                  marginTop: 12,
                  marginBottom: 0,
                  opacity: 0.85,
                }}
              >
                {meta.blurb}
              </p>
              {process.env.NODE_ENV !== "production" && !isCurrent && (
                <button
                  type="button"
                  onClick={() => setTalentTier(tierId)}
                  style={{
                    marginTop: 12,
                    width: "100%",
                    padding: "6px 10px",
                    background: "transparent",
                    color: tierId === "max" ? "#fff" : COLORS.ink,
                    border: `1px solid ${tierId === "max" ? "rgba(255,255,255,0.4)" : COLORS.border}`,
                    borderRadius: 8,
                    fontFamily: FONTS.body,
                    fontSize: 11.5,
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  {interpolate(t("dashboard.talentDrawers.premiumPages.switchTo"), { tier: meta.label })}
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* Feature matrix */}
      <div style={{ marginTop: 18 }}>
        <CapsLabel>{t("dashboard.talentDrawers.premiumPages.whatsIncluded")}</CapsLabel>
        <div
          style={{
            marginTop: 8,
            background: "#fff",
            border: `1px solid ${COLORS.borderSoft}`,
            borderRadius: 10,
            overflow: "hidden",
          }}
        >
          {/* Header */}
          <div style={{ display: "grid", gridTemplateColumns: "1.6fr 1fr 1fr 1fr", padding: "10px 14px", background: "rgba(11,11,13,0.025)", borderBottom: `1px solid ${COLORS.borderSoft}`, fontFamily: FONTS.body, fontSize: 10.5, fontWeight: 600, letterSpacing: 1.2, textTransform: "uppercase" }} className="text-admin-ink-muted">
            <span>{t("dashboard.talentDrawers.premiumPages.colFeature")}</span>
            <span className="text-center">Free</span>
            <span className="text-center">Pro</span>
            <span className="text-center">Portfolio</span>
          </div>
          {/* Rows — grouped by section */}
          {(["page", "discovery", "money", "tools"] as TalentTierGroup[]).map((group, gi) => {
            const rows = TALENT_TIER_CATALOG.filter((r) => r.group === group);
            if (rows.length === 0) return null;
            return (
              <div key={group}>
                <div style={{ padding: "7px 14px", background: "rgba(11,11,13,0.02)", borderTop: gi > 0 ? `1px solid ${COLORS.borderSoft}` : "none", borderBottom: `1px solid ${COLORS.borderSoft}`, fontFamily: FONTS.body, fontSize: 10, fontWeight: 700, letterSpacing: 0.7, textTransform: "uppercase" }} className="text-admin-ink-dim">
                  {t(TIER_GROUP_KEYS[group])}
                </div>
                {rows.map((f, i) => (
                  <div
                    key={f.label}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1.6fr 1fr 1fr 1fr",
                      padding: "10px 14px",
                      borderBottom: i < rows.length - 1 ? `1px solid ${COLORS.borderSoft}` : "none",
                      fontFamily: FONTS.body,
                      fontSize: 12.5,
                      color: COLORS.ink,
                      alignItems: "center",
                    }}
                  >
                    <span className="font-medium">{f.label}</span>
                    <FeatureCell value={f.free} />
                    <FeatureCell value={f.pro} />
                    <FeatureCell value={f.max} />
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      </div>

      <div style={{ marginTop: 16, padding: "12px 14px", border: `1px solid rgba(15,79,62,0.18)`, borderRadius: 10, fontFamily: FONTS.body, fontSize: 12.5, lineHeight: 1.55 }} className="bg-admin-surface-alt text-admin-ink">
        {t("dashboard.talentDrawers.premiumPages.independenceNote")}
      </div>

      {/* Phase 1.5: Pro & Max not yet available for launch — waitlist card replaces trial CTA */}
      <div
        style={{
          marginTop: 16,
          padding: "18px 20px",
          background: "#fff",
          border: `1.5px solid rgba(91,107,160,0.28)`,
          borderRadius: 12,
          display: "flex",
          alignItems: "center",
          gap: 16,
          fontFamily: FONTS.body,
        }}
      >
        <div className="flex-1 min-w-0">
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }} className="text-admin-indigo-deep">
            {t("dashboard.talentDrawers.premiumPages.launchingSoon")}
          </div>
          <div style={{ fontSize: 12.5, lineHeight: 1.55 }} className="text-admin-ink-muted">
            {t("dashboard.talentDrawers.premiumPages.launchingSoonBody")}
          </div>
        </div>
      </div>
    </DrawerShell>
  );
}

function FeatureCell({ value }: { value: TalentTierCell }) {
  if (value === true) {
    return (
      <span style={{ textAlign: "center", fontWeight: 600 }} className="text-admin-green">✓</span>
    );
  }
  if (value === false) {
    return <span style={{ textAlign: "center" }} className="text-admin-ink-dim">—</span>;
  }
  return (
    <span style={{ textAlign: "center", fontSize: 11.5 }} className="text-admin-ink-muted">
      {value}
    </span>
  );
}

// ─── Personal site section plan (Max) ──────────────────────────────

export function TalentPersonalPageDrawer() {
  const { state, closeDrawer } = useAdminShell();
  const t = useT();
  const open = state.drawer.drawerId === "talent-personal-page";
  const sub = MY_TALENT_PROFILE.subscription;
  const sections = [
    { id: "hero", label: t("dashboard.talentDrawers.premiumPages.sectionHero"), body: t("dashboard.talentDrawers.premiumPages.sectionHeroBody"), removable: false },
    { id: "story", label: t("dashboard.talentDrawers.premiumPages.sectionStory"), body: t("dashboard.talentDrawers.premiumPages.sectionStoryBody"), removable: true },
    { id: "embeds", label: t("dashboard.talentDrawers.premiumPages.sectionEmbeds"), body: interpolate(t(sub.embeds.length === 1 ? "dashboard.talentDrawers.premiumPages.sectionEmbedsBody" : "dashboard.talentDrawers.premiumPages.sectionEmbedsBodyPlural"), { count: sub.embeds.length }), removable: true },
    { id: "credits", label: t("dashboard.talentDrawers.premiumPages.sectionCredits"), body: t("dashboard.talentDrawers.premiumPages.sectionCreditsBody"), removable: true },
    { id: "press", label: t("dashboard.talentDrawers.premiumPages.sectionPress"), body: interpolate(t(sub.press.length === 1 ? "dashboard.talentDrawers.premiumPages.sectionPressBody" : "dashboard.talentDrawers.premiumPages.sectionPressBodyPlural"), { count: sub.press.length }), removable: true },
    { id: "contact", label: t("dashboard.talentDrawers.premiumPages.sectionContact"), body: t("dashboard.talentDrawers.premiumPages.sectionContactBody"), removable: false },
  ];

  return (
    <DrawerShell
      open={open}
      onClose={closeDrawer}
      title={t("dashboard.talentDrawers.premiumPages.personalTitle")}
      description={t("dashboard.talentDrawers.premiumPages.personalDesc")}
      width={620}
      footer={
        <>
          {/* Fake publish remains stripped; publish belongs to the governed builder flow. */}
          <SecondaryButton onClick={closeDrawer}>{t("dashboard.talentDrawers.close")}</SecondaryButton>
        </>
      }
    >
      <div className="flex flex-col gap-2">
        {sections.map((s) => (
          <div
            key={s.id}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: "12px 14px",
              background: "#fff",
              border: `1px solid ${COLORS.borderSoft}`,
              borderRadius: 10,
            }}
          >
            <span style={{ fontSize: 14, cursor: "grab" }} className="text-admin-ink-dim">⋮⋮</span>
            <div className="flex-1 min-w-0">
              <div style={{ fontFamily: FONTS.body, fontSize: 13.5, fontWeight: 500 }} className="text-admin-ink">
                {s.label}
                {!s.removable && (
                  <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 400 }} className="text-admin-ink-muted">
                    {t("dashboard.talentDrawers.premiumPages.required")}
                  </span>
                )}
              </div>
              <div style={{ fontFamily: FONTS.body, fontSize: 11.5, marginTop: 2 }} className="text-admin-ink-muted">
                {s.body}
              </div>
            </div>
            <Toggle on={true} onChange={() => {}} />
          </div>
        ))}
      </div>
    </DrawerShell>
  );
}

// ─── Page template picker ───────────────────────────────────────────


// ─── Page template picker ───────────────────────────────────────────

export function TalentPageTemplateDrawer() {
  const { state, closeDrawer, openDrawer } = useAdminShell();
  const t = useT();
  const open = state.drawer.drawerId === "talent-page-template";
  const tier = state.talentTier;
  const active = MY_TALENT_PROFILE.subscription.template;

  return (
    <DrawerShell
      open={open}
      onClose={closeDrawer}
      title={t("dashboard.talentDrawers.premiumPages.templateTitle")}
      description={t("dashboard.talentDrawers.premiumPages.templateDesc")}
      width={680}
      footer={<SecondaryButton onClick={closeDrawer}>{t("dashboard.talentDrawers.close")}</SecondaryButton>}
    >
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 10 }}>
        {TALENT_PAGE_TEMPLATES.map((tpl) => {
          const locked = !tierAllows(tier, "template-picker") && tpl.availableAt !== "free";
          const tierLocked = !tierAllows(tier, "media-embeds") && tpl.availableAt === "pro";
          const sigLocked = !tierAllows(tier, "extra-sections") && tpl.availableAt === "max";
          const isLocked = locked || tierLocked || sigLocked;
          const isActive = tpl.id === active;
          return (
            <button
              key={tpl.id}
              onClick={() => {
                if (isLocked) {
                  openDrawer("talent-tier-compare");
                }
              }}
              style={{
                position: "relative",
                padding: 14,
                textAlign: "left",
                background: isActive ? COLORS.surfaceAlt : "#fff",
                border: `1.5px solid ${isActive ? COLORS.accentDeep : COLORS.borderSoft}`,
                borderRadius: 12,
                cursor: "pointer",
                opacity: isLocked ? 0.78 : 1,
              }}
            >
              <div style={{ aspectRatio: "16 / 9", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 48, marginBottom: 10, filter: isLocked ? "grayscale(0.4)" : "none" }} className="bg-admin-surface-alt">
                {tpl.thumb}
              </div>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                <span style={{ fontFamily: FONTS.display, fontSize: 16 }} className="text-admin-ink">{tpl.label}</span>
                {isActive && (
                  <span style={{ fontFamily: FONTS.body, fontSize: 10, fontWeight: 700, letterSpacing: 0.5, textTransform: "uppercase" }} className="text-admin-accent-deep">
                    {t("dashboard.talentDrawers.premiumPages.active")}
                  </span>
                )}
                {isLocked && <LockedBadge requiredTier={tpl.availableAt} />}
              </div>
              <p style={{ margin: "4px 0 0", fontFamily: FONTS.body, fontSize: 12, lineHeight: 1.5 }} className="text-admin-ink-muted">
                {tpl.blurb}
              </p>
            </button>
          );
        })}
      </div>
    </DrawerShell>
  );
}


// Honest read-only banner for the Phase 1.5 STRIP drawers (save CTA removed).
// Without it these drawers looked editable but silently discarded everything.
function ReadOnlyStripNotice() {
  const copy = useDashboardText();
  return (
    <div
      role="note"
      className="mb-3 rounded-[9px] border border-[rgba(91,107,160,0.25)] bg-[rgba(91,107,160,0.10)] px-3 py-2 text-[12px] leading-[1.5] text-admin-indigo-deep"
    >
      {copy.t("Read-only preview. Edit your page content from My pages.")}
    </div>
  );
}

/**
 * W14 — the strip drawers (embeds / press / custom domain / media kit) used to
 * render `MY_TALENT_PROFILE.subscription`, a fixture belonging to a demo talent.
 * Every real talent saw someone else's embeds, press clippings and domain, none
 * of it editable. There is no per-talent store for embeds or press yet, and the
 * one concept that IS wired (custom domain) already has a working manager on the
 * Public page. So these drawers now explain what lives where and hand the talent
 * a single real route instead of fake content.
 */
function ManageOnPublicPage({ blurb }: { blurb: string }) {
  const copy = useDashboardText();
  const { closeDrawer, setTalentPage } = useAdminShell();
  return (
    <>
      <ReadOnlyStripNotice />
      <p style={{ margin: 0, fontFamily: FONTS.body, fontSize: 13, lineHeight: 1.6 }} className="text-admin-ink">
        {blurb}
      </p>
      <div style={{ marginTop: 14 }}>
        <PrimaryButton
          onClick={() => {
            closeDrawer();
            setTalentPage("public-page");
          }}
        >
          {copy.t("Open My pages")}
        </PrimaryButton>
      </div>
    </>
  );
}

// ─── Media embeds ──────────────────────────────────────────────────


// ─── Media embeds ──────────────────────────────────────────────────

export function TalentMediaEmbedsDrawer() {
  // Phase 1.5 STRIP: Pro+ only — save CTA removed; drawer kept for Phase 2 re-wiring
  const { state, closeDrawer } = useAdminShell();
  const t = useT();
  const open = state.drawer.drawerId === "talent-media-embeds";

  const supported: Array<{ kind: string; label: string; thumb: string }> = [
    { kind: "instagram", label: "Instagram", thumb: "📷" },
    { kind: "tiktok", label: "TikTok", thumb: "🎵" },
    { kind: "youtube", label: "YouTube", thumb: "▶️" },
    { kind: "spotify", label: "Spotify", thumb: "🎧" },
    { kind: "soundcloud", label: "SoundCloud", thumb: "☁️" },
    { kind: "vimeo", label: "Vimeo", thumb: "🎬" },
  ];

  return (
    <DrawerShell
      open={open}
      onClose={closeDrawer}
      title={t("dashboard.talentDrawers.premiumPages.embedsTitle")}
      description={t("dashboard.talentDrawers.premiumPages.embedsDesc")}
      width={580}
      footer={
        <>
          {/* Phase 1.5 STRIP: save removed — Pro+ feature, not wired for Free */}
          <SecondaryButton onClick={closeDrawer}>{t("dashboard.talentDrawers.close")}</SecondaryButton>
        </>
      }
    >
      {/* W14 → Phase 2: the fixture is gone. This is the talent's OWN store
          (talent_profile_embeds), saved through tier-gated server actions. */}
      <TalentEmbedsManager active={open} />
      <Divider label={t("dashboard.talentDrawers.premiumPages.supportedSources")} />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
        {supported.map((s) => (
          <div
            key={s.kind}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "10px 12px",
              background: COLORS.surfaceAlt,
              border: `1px solid rgba(15,79,62,0.18)`,
              borderRadius: 8,
              fontFamily: FONTS.body,
              fontSize: 12,
              color: COLORS.ink,
            }}
          >
            <span className="text-base">{s.thumb}</span>
            {s.label}
          </div>
        ))}
      </div>
    </DrawerShell>
  );
}

// ─── Press / clippings ──────────────────────────────────────────────


// ─── Press / clippings ──────────────────────────────────────────────

export function TalentPressDrawer() {
  // Phase 1.5 STRIP: Pro+ only — save CTA removed; drawer kept for Phase 2 re-wiring
  const { state, closeDrawer } = useAdminShell();
  const t = useT();
  const open = state.drawer.drawerId === "talent-press";

  return (
    <DrawerShell
      open={open}
      onClose={closeDrawer}
      title={t("dashboard.talentDrawers.premiumPages.pressTitle")}
      description={t("dashboard.talentDrawers.premiumPages.pressDesc")}
      width={580}
      footer={
        <>
          {/* Phase 1.5 STRIP: save removed — Pro+ feature, not wired for Free */}
          <SecondaryButton onClick={closeDrawer}>{t("dashboard.talentDrawers.close")}</SecondaryButton>
        </>
      }
    >
      {/* W14 → Phase 2: real per-talent press store (talent_press_items). */}
      <TalentPressManager active={open} />
    </DrawerShell>
  );
}

// ─── Media kit / EPK ────────────────────────────────────────────────


// ─── Media kit / EPK ────────────────────────────────────────────────

export function TalentMediaKitDrawer() {
  const { state, closeDrawer } = useAdminShell();
  const t = useT();
  const open = state.drawer.drawerId === "talent-media-kit";
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The kit is generated on demand from the live profile — there is no stored
  // artefact to go stale, so "Download" and "Re-generate" are the same call.
  // The route resolves the talent from the SESSION (no id travels with the
  // request) and re-checks the Pro gate server-side.
  const download = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    let objectUrl: string | null = null;
    try {
      const res = await fetch("/api/talent/media-kit", { cache: "no-store" });
      if (!res.ok) {
        const payload = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(payload?.error ?? t("dashboard.talentDrawers.premiumPages.kitFailed"));
        return;
      }
      const blob = await res.blob();
      const disposition = res.headers.get("content-disposition") ?? "";
      const match = /filename="([^"]+)"/.exec(disposition);
      objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = match?.[1] ?? "media-kit.pdf";
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
    } catch {
      setError(t("dashboard.talentDrawers.premiumPages.kitFailed"));
    } finally {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      setBusy(false);
    }
  }, [busy, t]);

  return (
    <DrawerShell
      open={open}
      onClose={closeDrawer}
      title={t("dashboard.talentDrawers.premiumPages.mediaKitTitle")}
      description={t("dashboard.talentDrawers.premiumPages.mediaKitDesc")}
      width={560}
      footer={
        <>
          <SecondaryButton onClick={closeDrawer}>
            {t("dashboard.talentDrawers.close")}
          </SecondaryButton>
          <PrimaryButton onClick={download} disabled={busy}>
            {busy
              ? t("dashboard.talentDrawers.premiumPages.kitBuilding")
              : t("dashboard.talentDrawers.premiumPages.downloadPdf")}
          </PrimaryButton>
        </>
      }
    >
      {/* One block, two states — a failure replaces the blurb in place rather
          than stacking a second panel the talent has to hunt for. */}
      <div
        role={error ? "alert" : undefined}
        style={{ fontFamily: FONTS.body, fontSize: 13 }}
        className={error ? "text-admin-critical" : "text-admin-ink-muted"}
      >
        {error ?? t("dashboard.talentDrawers.premiumPages.kitOnDemand")}
      </div>
      <Divider label={t("dashboard.talentDrawers.premiumPages.kitContents")} />
      <ul style={{ margin: 0, paddingLeft: 18, fontFamily: FONTS.body, fontSize: 13, lineHeight: 1.7 }} className="text-admin-ink">
        <li>{t("dashboard.talentDrawers.premiumPages.kitContent1")}</li>
        <li>{t("dashboard.talentDrawers.premiumPages.kitContent2")}</li>
        <li>{t("dashboard.talentDrawers.premiumPages.kitContent3")}</li>
        <li>{t("dashboard.talentDrawers.premiumPages.kitContent4")}</li>
        <li>{t("dashboard.talentDrawers.premiumPages.kitContent5")}</li>
        <li>{t("dashboard.talentDrawers.premiumPages.kitContent6")}</li>
      </ul>
    </DrawerShell>
  );
}

// ─── Custom domain ──────────────────────────────────────────────────


// ─── Custom domain ──────────────────────────────────────────────────

export function TalentCustomDomainDrawer() {
  // Phase 1.5 STRIP: Max only — save CTA removed; drawer kept for Phase 2 re-wiring
  const { state, closeDrawer } = useAdminShell();
  const t = useT();
  const open = state.drawer.drawerId === "talent-custom-domain";
  const copy = useDashboardText();

  return (
    <DrawerShell
      open={open}
      onClose={closeDrawer}
      title={t("dashboard.talentDrawers.premiumPages.domainTitle")}
      description={t("dashboard.talentDrawers.premiumPages.domainDesc")}
      width={580}
      footer={
        // Phase 1.5 STRIP: save removed — Max-only feature, not wired for Free
        <SecondaryButton onClick={closeDrawer}>{t("dashboard.talentDrawers.close")}</SecondaryButton>
      }
    >
      <ManageOnPublicPage
        blurb={copy.t(
          "Connect a custom domain from My pages. That manager verifies your DNS records and issues the SSL certificate, and it shows the exact records for your domain.",
        )}
      />
    </DrawerShell>
  );
}
// ─────────────────────────────────────────────────────────────────────────────
// WS-8.5  Talent career analytics — "You got X inquiries this Q" drawer
// ─────────────────────────────────────────────────────────────────────────────
