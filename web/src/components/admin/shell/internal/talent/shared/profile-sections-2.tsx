"use client";

import { useDashboardText } from "../../dashboard-i18n";
import { Icon, PrimaryCard, SecondaryCard, StatDot } from "../../primitives";
import { COLORS, FONTS, MY_TALENT_PROFILE, TALENT_PAGE_TEMPLATES, TALENT_TIER_META, tierAllows, useAdminShell, type TalentBadge, type TalentCredit, type TalentLimit, type TalentReview, type TalentSkill, type TalentSubscriptionTier } from "../../state";
import { Grid } from "./page-chrome-1";



// ─── Personal page band (premium tier surface) ──────────────────────
//
// The talent's personal Tulala destination — separate from agency
// rosters and hub listings. Locked modules render with a tier badge
// rather than disabled controls, so the ladder is always visible.

export function PersonalPageBand() {
  const { openDrawer, state, bridgeTalentSelfProfile, setTalentPage } = useAdminShell();
  const copy = useDashboardText();
  const p = MY_TALENT_PROFILE;
  const sub = p.subscription;
  // Tier from shared shell state — reflects live plan switches.
  const tier = state.talentTier;

  // Real talent: the Pro/Max band below is fed entirely by the demo profile
  // (Marta's page URL, domain, embed/press counts, "6 sections"), and there's
  // no bridge source for it here — the canonical personal-page surface is
  // "My pages". So for a real talent we show an honest pointer instead of
  // fabricated owned-page data; the full demo band only renders in standalone
  // preview mode (no bridge identity).
  if (bridgeTalentSelfProfile && tier !== "free") {
    return (
      <PrimaryCard
        title={copy.t("Your personal Tulala page")}
        description={copy.t("Manage your templates, media embeds, press band, media kit and custom domain on My pages.")}
        icon={<Icon name="globe" size={14} stroke={1.7} />}
        affordance={copy.t("Open My pages")}
        onClick={() => setTalentPage("public-page")}
      />
    );
  }

  // Free talent: talent billing isn't live yet, so there's nothing to sell.
  // We drop the upsell/waitlist marketing and its CTA (the tier-compare drawer
  // reads as purchasable) and keep a single quiet, honest notice: their
  // standard roster page is live, and richer personal-page tiers are on the
  // way. No fake pricing, no dead affordance.
  if (tier === "free") {
    return (
      <div
        style={{
          padding: "16px 18px",
          background: "#fff",
          border: `1px solid ${COLORS.borderSoft}`,
          borderRadius: 12,
          fontFamily: FONTS.body,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 5 }}>
          <Icon name="globe" size={13} stroke={1.7} color={COLORS.inkMuted} />
          <div style={{ fontSize: 13.5, fontWeight: 600 }} className="text-admin-ink">
            {copy.t("Your roster page is live")}
          </div>
        </div>
        <div style={{ fontSize: 12, lineHeight: 1.55, maxWidth: 560 }} className="text-admin-ink-muted">
          {copy.t("It's published at")}{" "}
          <span style={{ fontFamily: FONTS.mono }}>{sub.personalPageUrl}</span>.{" "}
          {copy.t("Richer personal-page tiers with custom templates, embeds and your own domain are on the way, we'll let you know when they open.")}
        </div>
      </div>
    );
  }

  // Pro / Max talent: show the full premium band. `tier` is narrowed to
  // "pro" | "max" by the Free early-return guard above.
  const resolvedTier = tier;
  const meta = TALENT_TIER_META[resolvedTier];
  const activeTemplate = TALENT_PAGE_TEMPLATES.find((t) => t.id === sub.template) ?? TALENT_PAGE_TEMPLATES[0];
  const allowEmbeds = tierAllows(resolvedTier, "media-embeds");
  const allowPress = tierAllows(resolvedTier, "press-band");
  const allowKit = tierAllows(resolvedTier, "media-kit");
  const allowDomain = tierAllows(resolvedTier, "custom-domain");
  const allowExtraSections = tierAllows(resolvedTier, "extra-sections");

  return (
    <>
      {/* Header strip — current tier + URL + manage CTA */}
      <PrimaryCard
        title={`${copy.t("Your personal Tulala page")} · ${meta.label}`}
        description={copy.t(
          resolvedTier === "pro"
            ? "Pro template, social + video embeds, press band, and a downloadable media kit. Custom domain unlocks at Max."
            : "Full mini personal site. Multi-section page builder, custom domain, EPK kit, SEO controls, priority discover placement."
        )}
        icon={<Icon name="globe" size={14} stroke={1.7} />}
        affordance={copy.t(resolvedTier === "max" ? "Manage page" : "Compare tiers")}
        onClick={() =>
          resolvedTier === "max" ? openDrawer("talent-personal-page") : openDrawer("talent-tier-compare")
        }
      >
        <div style={{ marginTop: 12, display: "flex", alignItems: "center", flexWrap: "wrap", gap: 12, padding: "10px 12px", border: `1px solid rgba(15,79,62,0.18)`, borderRadius: 10 }} className="bg-admin-surface-alt">
          <Icon name="external" size={12} color={COLORS.accentDeep} />
          <span style={{ fontFamily: FONTS.mono, fontSize: 12, flex: "1 1 auto", minWidth: 0 }} className="text-admin-ink">
            {sub.customDomain ?? sub.personalPageUrl}
          </span>
          {sub.customDomain && sub.customDomainStatus === "verified" && (
            <span style={{ fontFamily: FONTS.body, fontSize: 11, fontWeight: 500 }} className="text-admin-green">
              ● {copy.t("Verified")}
            </span>
          )}
          {sub.renewsOn && (
            <span style={{ fontFamily: FONTS.body, fontSize: 11 }} className="text-admin-ink-muted">
              {copy.t("Renews")} {sub.renewsOn}
            </span>
          )}
        </div>
      </PrimaryCard>

      {/* Modules grid — template / embeds / press / media-kit / domain / sections */}
      <div className="mt-3">
        <Grid cols="3">
          <SecondaryCard
            title={copy.t("Page template")}
            description={
              allowEmbeds
                ? `${copy.t("Active:")} ${activeTemplate.label}. ${activeTemplate.blurb}`
                : copy.t("Roster style only on Free. Pro unlocks Editorial / Studio. Max adds Stage / Creator / EPK.")
            }
            meta={
              tierAllows(resolvedTier, "template-picker")
                ? <><StatDot tone="green" /> {activeTemplate.label}</>
                : <LockedBadge requiredTier="pro" />
            }
            affordance={copy.t(tierAllows(resolvedTier, "template-picker") ? "Switch template" : "Unlock templates")}
            onClick={() =>
              tierAllows(resolvedTier, "template-picker")
                ? openDrawer("talent-page-template")
                : openDrawer("talent-tier-compare")
            }
          />
          <SecondaryCard
            title={copy.t("Media embeds")}
            description={
              allowEmbeds
                ? `Spotify · YouTube · TikTok · IG · Vimeo. ${sub.embeds.length} ${copy.t("embeds active.")}`
                : copy.t("Add Spotify / YouTube / TikTok / Instagram / Vimeo blocks to your page. Pro+.")
            }
            meta={allowEmbeds ? <><StatDot tone="green" /> {sub.embeds.length} {copy.t("embeds")}</> : <LockedBadge requiredTier="pro" />}
            affordance={copy.t(allowEmbeds ? "Manage embeds" : "Unlock embeds")}
            onClick={() => (allowEmbeds ? openDrawer("talent-media-embeds") : openDrawer("talent-tier-compare"))}
          />
          <SecondaryCard
            title={copy.t("Press & clippings")}
            description={
              allowPress
                ? `${sub.press.length} ${copy.t("clips · auto-pulled from RSS or pasted manually.")}`
                : copy.t("Vogue, El País, FT. Show off press mentions on your page. Pro+.")
            }
            meta={allowPress ? <><StatDot tone="green" /> {sub.press.length} {copy.t("clips")}</> : <LockedBadge requiredTier="pro" />}
            affordance={copy.t(allowPress ? "Manage press" : "Unlock press band")}
            onClick={() => (allowPress ? openDrawer("talent-press") : openDrawer("talent-tier-compare"))}
          />
          <SecondaryCard
            title={copy.t("Media kit (EPK)")}
            description={
              allowKit
                ? sub.mediaKit
                  ? `${sub.mediaKit.filename} · ${sub.mediaKit.size} · ${copy.t("updated")} ${sub.mediaKit.updatedAt}.`
                  : copy.t("Generate a downloadable EPK PDF: bio, credits, comp card, contact CTA.")
                : copy.t("One-click downloadable EPK · credits · comp card · contact CTA. Pro+.")
            }
            meta={allowKit ? <><StatDot tone="green" /> {copy.t("Ready")}</> : <LockedBadge requiredTier="pro" />}
            affordance={copy.t(allowKit ? "Manage media kit" : "Unlock media kit")}
            onClick={() => (allowKit ? openDrawer("talent-media-kit") : openDrawer("talent-tier-compare"))}
          />
          <SecondaryCard
            title={copy.t("Custom domain")}
            description={
              allowDomain
                ? sub.customDomain
                  ? `${copy.t("Live at")} ${sub.customDomain} · ${sub.customDomainStatus}`
                  : copy.t("Connect your own domain. yourname.com → personal page.")
                : copy.t("Personal domain (yourname.com) routed straight to your Tulala page. Max only.")
            }
            meta={allowDomain ? <><StatDot tone={sub.customDomain ? "green" : "dim"} /> {copy.t(sub.customDomain ? "Live" : "Not set")}</> : <LockedBadge requiredTier="max" />}
            affordance={copy.t(allowDomain ? "Manage domain" : "Unlock custom domain")}
            onClick={() => (allowDomain ? openDrawer("talent-custom-domain") : openDrawer("talent-tier-compare"))}
          />
          <SecondaryCard
            title={copy.t("Extra sections")}
            description={copy.t(
              allowExtraSections
                ? "Bio · About · Press · Tour dates · Show calendar · Contact CTA. Drag to re-order."
                : "Multi-section page: story, tour dates, show calendar, contact CTA. Max only."
            )}
            meta={allowExtraSections ? <><StatDot tone="green" /> 6 {copy.t("sections")}</> : <LockedBadge requiredTier="max" />}
            affordance={copy.t(allowExtraSections ? "Edit sections" : "Unlock sections")}
            onClick={() => (allowExtraSections ? openDrawer("talent-personal-page") : openDrawer("talent-tier-compare"))}
          />
        </Grid>
      </div>
    </>
  );
}


// ─── Atomic profile primitives (chips, rows, snippets) ──────────────

/**
 * Tier pill shown on hero. Tone scales with tier — Free ink, Pro
 * forest accent, Max deep ink. Click opens the tier-compare drawer.
 */
export function TierPill({ tier, onClick }: { tier: TalentSubscriptionTier; onClick: () => void }) {
  const copy = useDashboardText();
  const meta = TALENT_TIER_META[tier];
  const palette: Record<TalentSubscriptionTier, { bg: string; fg: string; border: string }> = {
    free: { bg: "rgba(11,11,13,0.05)", fg: COLORS.ink, border: "rgba(11,11,13,0.10)" },
    pro: { bg: COLORS.accentSoft, fg: COLORS.accent, border: "rgba(15,79,62,0.28)" },
    max: { bg: COLORS.royal, fg: "#fff", border: COLORS.royal },
  };
  const c = palette[tier];
  return (
    <button
      onClick={onClick}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "2px 9px",
        background: c.bg,
        color: c.fg,
        border: `1px solid ${c.border}`,
        fontFamily: FONTS.body,
        fontSize: 11,
        fontWeight: 600,
        letterSpacing: 0.3,
        borderRadius: 999,
        cursor: "pointer",
      }}
      title={`${meta.label} · ${meta.tagline} · ${copy.t("click to compare tiers")}`}
    >
      <span style={{ fontSize: 9, opacity: 0.85 }}>●</span>
      {copy.isSpanish ? `Plan ${meta.label}` : `${meta.label} plan`}
      {tier !== "max" && (
        <span style={{ fontSize: 10, marginLeft: 2, opacity: 0.7 }}>↗</span>
      )}
    </button>
  );
}


/**
 * Lock badge — shown next to a feature card when the talent's
 * current tier doesn't unlock it. Hint surfaces what tier they need.
 */
function LockedBadge({ requiredTier }: { requiredTier: TalentSubscriptionTier }) {
  const copy = useDashboardText();
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
      title={`${copy.t("Unlocked at")} ${meta.label}`}
    >
      <span className="text-admin-9">🔒</span>
      {meta.label}
    </span>
  );
}


export function ProfileChip({ label, tone = "ink" }: { label: string; tone?: "ink" | "green" | "amber" | "dim" | "red" }) {
  const palette: Record<typeof tone, { bg: string; fg: string }> = {
    ink: { bg: "rgba(11,11,13,0.05)", fg: COLORS.ink },
    green: { bg: COLORS.successSoft, fg: COLORS.successDeep },
    amber: { bg: "rgba(82,96,109,0.12)", fg: COLORS.amberDeep },
    dim: { bg: "rgba(11,11,13,0.03)", fg: COLORS.inkMuted },
    red: { bg: COLORS.criticalSoft, fg: "#7A2026" },
  };
  const c = palette[tone];
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        background: c.bg,
        color: c.fg,
        fontFamily: FONTS.body,
        fontSize: 11,
        fontWeight: 600,
        letterSpacing: 0.2,
        padding: "3px 9px",
        borderRadius: 999,
        whiteSpace: "nowrap",
      }}
    >
      {label}
    </span>
  );
}


export function BadgeChip({ badge, compact }: { badge: TalentBadge; compact?: boolean }) {
  const glyph: Record<TalentBadge["kind"], string> = {
    "id-verified": "🛡",
    "age-verified": "✓",
    union: "♢",
    "top-rated": "★",
    "tulala-featured": "❖",
    "agency-verified": "▣",
    "background-check": "⌾",
  };
  return (
    <span
      title={`${badge.label} · ${badge.hint}`}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        padding: compact ? "3px 8px" : "4px 10px",
        background: "#fff",
        border: `1px solid ${COLORS.border}`,
        borderRadius: 999,
        fontFamily: FONTS.body,
        fontSize: compact ? 11 : 11.5,
        color: COLORS.ink,
        fontWeight: 500,
      }}
    >
      <span style={{ fontSize: compact ? 11 : 12 }} className="text-admin-accent-deep">{glyph[badge.kind]}</span>
      {badge.label}
    </span>
  );
}


function MeasurementsTable() {
  const m = MY_TALENT_PROFILE.measurements;
  const cells: { label: string; value: string }[] = [
    { label: "Height", value: `${m.heightImperial} · ${m.heightMetric}` },
    { label: "Bust", value: m.bust },
    { label: "Waist", value: m.waist },
    { label: "Hips", value: m.hips },
    { label: "Inseam", value: m.inseam ?? "—" },
    { label: "Shoe", value: `EU ${m.shoeEU} · US ${m.shoeUS} · UK ${m.shoeUK}` },
    { label: "Dress", value: m.dress },
    { label: "Hair", value: `${m.hairColor} · ${m.hairLength}` },
    { label: "Eyes", value: m.eyeColor },
    { label: "Skin tone", value: m.skinTone },
    { label: "Tattoos", value: m.hasTattoos ? (m.tattoosNote ?? "Yes") : "None" },
    { label: "Piercings", value: m.hasPiercings ? (m.piercingsNote ?? "Yes") : "None" },
  ];
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(4, 1fr)",
        gap: 10,
        fontFamily: FONTS.body,
      }}
    >
      {cells.map((c) => (
        <div
          key={c.label}
          style={{
            padding: "10px 12px",
            background: "rgba(11,11,13,0.02)",
            border: `1px solid ${COLORS.borderSoft}`,
            borderRadius: 8,
          }}
        >
          <div className="text-admin-ink-muted text-admin-10h font-semibold">
            {c.label}
          </div>
          <div style={{ fontSize: 13, marginTop: 3, fontWeight: 500 }} className="text-admin-ink">
            {c.value}
          </div>
        </div>
      ))}
    </div>
  );
}


function SkillRow({ skill }: { skill: TalentSkill }) {
  const catGlyph: Record<TalentSkill["category"], string> = {
    movement: "⟁",
    voice: "♪",
    instrument: "♫",
    sport: "⚑",
    performance: "★",
    other: "·",
  };
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, fontFamily: FONTS.body, fontSize: 12.5 }} className="text-admin-ink">
      <span style={{ width: 18, textAlign: "center", fontSize: 13 }} className="text-admin-ink-dim">
        {catGlyph[skill.category]}
      </span>
      <span className="flex-1">{skill.label}</span>
      {skill.level && <span className="text-admin-ink-muted text-admin-11h">{skill.level}</span>}
    </div>
  );
}


function LimitRow({ limit }: { limit: TalentLimit }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        fontFamily: FONTS.body,
        fontSize: 12.5,
      }}
    >
      <span style={{ display: "inline-block", width: 5, height: 5, borderRadius: "50%", background: limit.enforcement === "hard" ? COLORS.red : COLORS.amber, }}
      />
      <span style={{ flex: 1 }} className="text-admin-ink">{limit.label}</span>
      <span
        style={{
          fontSize: 10,
          fontWeight: 700,
                    color: limit.enforcement === "hard" ? "#7A2026" : COLORS.amberDeep,
        }}
      >
        {limit.enforcement}
      </span>
    </div>
  );
}


function CreditRow({ credit }: { credit: TalentCredit }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "baseline",
        gap: 8,
        fontFamily: FONTS.body,
        fontSize: 12.5,
        padding: "5px 0",
        borderBottom: `1px dashed ${COLORS.borderSoft}`,
      }}
    >
      <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: 0.3, flexShrink: 0, minWidth: 60 }} className="text-admin-ink-dim">
        {credit.year}
      </span>
      <span style={{ flex: 1 }} className="text-admin-ink">
        <strong className="font-semibold">{credit.brand}</strong>
        <span className="text-admin-ink-muted"> · {credit.type}</span>
        {credit.role && <span className="text-admin-ink-muted"> · {credit.role}</span>}
      </span>
      {credit.pinned && (
        <span className="text-admin-accent-deep text-xs">★</span>
      )}
    </div>
  );
}


function ReviewSnippet({ review }: { review: TalentReview }) {
  return (
    <div
      style={{
        padding: "9px 11px",
        background: "rgba(11,11,13,0.02)",
        border: `1px solid ${COLORS.borderSoft}`,
        borderRadius: 8,
        fontFamily: FONTS.body,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 4,
        }}
      >
        <span className="text-admin-ink text-xs font-semibold">
          {review.reviewerName}
        </span>
        <span style={{ fontSize: 11, letterSpacing: 1 }} className="text-admin-accent-deep">
          {"★".repeat(review.rating)}
        </span>
      </div>
      <div style={{ fontSize: 11, marginBottom: 5 }} className="text-admin-ink-muted">
        {review.reviewerRole}
      </div>
      <div style={{ fontSize: 12.5, lineHeight: 1.5, fontStyle: "italic" }} className="text-admin-ink">
        &quot;{review.body.length > 110 ? review.body.slice(0, 108) + "…" : review.body}&quot;
      </div>
    </div>
  );
}
