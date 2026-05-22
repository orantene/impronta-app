"use client";

import { Icon, PrimaryCard, SecondaryCard, StatDot } from "../../primitives";
import { COLORS, FONTS, MY_TALENT_PROFILE, TALENT_PAGE_TEMPLATES, TALENT_TIER_META, tierAllows, useAdminShell, type TalentBadge, type TalentCredit, type TalentLimit, type TalentReview, type TalentSkill, type TalentSubscriptionTier } from "../../state";
import { Grid } from "./page-chrome-1";



// ─── Personal page band (premium tier surface) ──────────────────────
//
// The talent's personal Tulala destination — separate from agency
// rosters and hub listings. Locked modules render with a tier badge
// rather than disabled controls, so the ladder is always visible.

export function PersonalPageBand() {
  const { openDrawer, toast } = useAdminShell();
  const p = MY_TALENT_PROFILE;
  const sub = p.subscription;
  // Phase 1.5: hard-code Free for launch — no subscription field wired yet.
  // Phase 2: derive from real talent.subscription.tier once billing ships.
  const tier: "free" | "pro" | "max" = "free";

  // Free talent: hide the full premium band and show a single "coming soon" card instead.
  if (tier === "free") {
    return (
      <div
        style={{
          padding: "20px 22px",
          background: "#fff",
          border: `1.5px solid rgba(91,107,160,0.22)`,
          borderRadius: 14,
          display: "flex",
          alignItems: "center",
          gap: 18,
          fontFamily: FONTS.body,
        }}
      >
        <div className="flex-1 min-w-0">
          <div style={{ fontFamily: FONTS.display, fontSize: 16, fontWeight: 500, marginBottom: 5 }} className="text-admin-indigo-deep">
            Tulala Pro &amp; Max — coming soon
          </div>
          <div style={{ fontSize: 12.5, lineHeight: 1.6, maxWidth: 520 }} className="text-admin-ink-muted">
            Richer templates, social &amp; video embeds, press band, downloadable media kit, and a custom
            domain for your own name. Join the waitlist and get early access when billing opens.
          </div>
          <div style={{ marginTop: 4, fontSize: 11.5 }} className="text-admin-ink-muted">
            Your standard roster page at{" "}
            <span style={{ fontFamily: FONTS.mono }}>{sub.personalPageUrl}</span> is already live.
          </div>
        </div>
        <button
          onClick={() => openDrawer("talent-tier-compare")}
          style={{
            flexShrink: 0,
            padding: "10px 20px",
            background: COLORS.indigoSoft,
            border: `1px solid rgba(91,107,160,0.32)`,
            borderRadius: 8,
            fontFamily: FONTS.body,
            fontSize: 13,
            fontWeight: 600,
            color: COLORS.indigoDeep,
            cursor: "pointer",
            whiteSpace: "nowrap",
          }}
        >
          See what&apos;s coming
        </button>
      </div>
    );
  }

  // Pro / Max talent: show the full premium band (unchanged).
  // Cast needed because TypeScript narrows `tier` to `never` after the Free early-return guard.
  const resolvedTier = tier as "pro" | "max";
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
        title={`Your personal Tulala page · ${meta.label}`}
        description={
          resolvedTier === "pro"
            ? "Pro template, social + video embeds, press band, and a downloadable media kit. Custom domain unlocks at Max."
            : "Full mini personal site. Multi-section page builder, custom domain, EPK kit, SEO controls, priority discover placement."
        }
        icon={<Icon name="globe" size={14} stroke={1.7} />}
        affordance={resolvedTier === "max" ? "Manage page" : "Compare tiers"}
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
              ● Verified
            </span>
          )}
          {sub.renewsOn && (
            <span style={{ fontFamily: FONTS.body, fontSize: 11 }} className="text-admin-ink-muted">
              Renews {sub.renewsOn}
            </span>
          )}
        </div>
      </PrimaryCard>

      {/* Modules grid — template / embeds / press / media-kit / domain / sections */}
      <div className="mt-3">
        <Grid cols="3">
          <SecondaryCard
            title="Page template"
            description={
              allowEmbeds
                ? `Active: ${activeTemplate.label}. ${activeTemplate.blurb}`
                : "Roster style only on Basic. Pro unlocks Editorial / Studio. Portfolio adds Stage / Creator / EPK."
            }
            meta={
              tierAllows(resolvedTier, "template-picker")
                ? <><StatDot tone="green" /> {activeTemplate.label}</>
                : <LockedBadge requiredTier="pro" />
            }
            affordance={tierAllows(resolvedTier, "template-picker") ? "Switch template" : "Unlock templates"}
            onClick={() =>
              tierAllows(resolvedTier, "template-picker")
                ? openDrawer("talent-page-template")
                : openDrawer("talent-tier-compare")
            }
          />
          <SecondaryCard
            title="Media embeds"
            description={
              allowEmbeds
                ? `Spotify · YouTube · TikTok · IG · Vimeo. ${sub.embeds.length} embeds active.`
                : "Add Spotify / YouTube / TikTok / Instagram / Vimeo blocks to your page. Pro+."
            }
            meta={allowEmbeds ? <><StatDot tone="green" /> {sub.embeds.length} embeds</> : <LockedBadge requiredTier="pro" />}
            affordance={allowEmbeds ? "Manage embeds" : "Unlock embeds"}
            onClick={() => (allowEmbeds ? openDrawer("talent-media-embeds") : openDrawer("talent-tier-compare"))}
          />
          <SecondaryCard
            title="Press & clippings"
            description={
              allowPress
                ? `${sub.press.length} clips · auto-pulled from RSS or pasted manually.`
                : "Vogue, El País, FT — show off press mentions on your page. Pro+."
            }
            meta={allowPress ? <><StatDot tone="green" /> {sub.press.length} clips</> : <LockedBadge requiredTier="pro" />}
            affordance={allowPress ? "Manage press" : "Unlock press band"}
            onClick={() => (allowPress ? openDrawer("talent-press") : openDrawer("talent-tier-compare"))}
          />
          <SecondaryCard
            title="Media kit (EPK)"
            description={
              allowKit
                ? sub.mediaKit
                  ? `${sub.mediaKit.filename} · ${sub.mediaKit.size} · updated ${sub.mediaKit.updatedAt}.`
                  : "Generate a downloadable EPK PDF — bio, credits, comp card, contact CTA."
                : "One-click downloadable EPK · credits · comp card · contact CTA. Pro+."
            }
            meta={allowKit ? <><StatDot tone="green" /> Ready</> : <LockedBadge requiredTier="pro" />}
            affordance={allowKit ? "Manage media kit" : "Unlock media kit"}
            onClick={() => (allowKit ? openDrawer("talent-media-kit") : openDrawer("talent-tier-compare"))}
          />
          <SecondaryCard
            title="Custom domain"
            description={
              allowDomain
                ? sub.customDomain
                  ? `Live at ${sub.customDomain} · ${sub.customDomainStatus}`
                  : "Connect your own domain — yourname.com → personal page."
                : "Personal domain (yourname.com) routed straight to your Tulala page. Portfolio only."
            }
            meta={allowDomain ? <><StatDot tone={sub.customDomain ? "green" : "dim"} /> {sub.customDomain ? "Live" : "Not set"}</> : <LockedBadge requiredTier="max" />}
            affordance={allowDomain ? "Manage domain" : "Unlock custom domain"}
            onClick={() => (allowDomain ? openDrawer("talent-custom-domain") : openDrawer("talent-tier-compare"))}
          />
          <SecondaryCard
            title="Extra sections"
            description={
              allowExtraSections
                ? "Bio · About · Press · Tour dates · Show calendar · Contact CTA. Drag to re-order."
                : "Multi-section page — story, tour dates, show calendar, contact CTA. Portfolio only."
            }
            meta={allowExtraSections ? <><StatDot tone="green" /> 6 sections</> : <LockedBadge requiredTier="max" />}
            affordance={allowExtraSections ? "Edit sections" : "Unlock sections"}
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
      title={`${meta.label} · ${meta.tagline} · click to compare tiers`}
    >
      <span style={{ fontSize: 9, opacity: 0.85 }}>●</span>
      {meta.label} plan
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
      title={`Unlocked at ${meta.label}`}
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
