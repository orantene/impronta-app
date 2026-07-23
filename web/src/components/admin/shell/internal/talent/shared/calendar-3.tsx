"use client";

import { useDashboardText } from "../../dashboard-i18n";
import { EmptyState, Icon, PrimaryButton, SecondaryCard } from "../../primitives";
import { COLORS, EXPOSURE_PRESET_META, FONTS, TALENT_TIER_META, TRANSITION, type ChannelEntry, type ChannelKind, type ExposurePreset, type TalentSubscriptionTier } from "../../state";
import { AvailableChannelRow, ChannelRow } from "./calendar-4";



/**
 * Exposure preset slider — four named levels with a live tooltip-style
 * description. Click a level to apply it. Recommended level (Wide) gets
 * a sage "Recommended" tag.
 */
export function ExposurePresetSlider({
  preset,
  onChange,
}: {
  preset: ExposurePreset;
  onChange: (p: ExposurePreset) => void;
}) {
  const copy = useDashboardText();
  const presets: ExposurePreset[] = ["selective", "curated", "wide", "maximum"];
  const current = EXPOSURE_PRESET_META[preset];

  return (
    <section
      style={{
        background: "#fff",
        border: `1px solid ${COLORS.borderSoft}`,
        borderRadius: 12,
        padding: "16px 18px",
        fontFamily: FONTS.body,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          gap: 12,
          marginBottom: 12,
        }}
      >
        <div>
          <div style={{ fontSize: 14, fontWeight: 600, letterSpacing: -0.05 }} className="text-admin-ink">
            {copy.t("Exposure level")}
          </div>
          <div style={{ fontSize: 12.5, marginTop: 2, lineHeight: 1.5 }} className="text-admin-ink-muted">
            {copy.t("One control, four levels. Sets sensible defaults across every channel. Override individual channels below.")}
          </div>
        </div>
      </div>

      {/* Segmented control */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 6, padding: 4, borderRadius: 10 }} className="bg-admin-surface-alt">
        {presets.map((p) => {
          const meta = EXPOSURE_PRESET_META[p];
          const active = preset === p;
          return (
            <button
              key={p}
              type="button"
              onClick={() => onChange(p)}
              style={{
                position: "relative",
                background: active ? "#fff" : "transparent",
                border: "none",
                padding: "10px 8px",
                borderRadius: 7,
                cursor: "pointer",
                fontFamily: FONTS.body,
                textAlign: "center",
                boxShadow: active ? COLORS.shadow : "none",
                transition: `background ${TRANSITION.micro}, box-shadow ${TRANSITION.micro}`,
              }}
            >
              <div
                style={{
                  fontSize: 12.5,
                  fontWeight: active ? 600 : 500,
                  color: active ? COLORS.ink : COLORS.inkMuted,
                  letterSpacing: -0.05,
                }}
              >
                {meta.label}
              </div>
              {meta.recommended && (
                <span
                  aria-hidden
                  style={{
                    position: "absolute",
                    top: -6,
                    right: 6,
                    fontSize: 9,
                    fontWeight: 700,
                                        padding: "1px 5px",
                    borderRadius: 4,
                    background: "rgba(46,125,91,0.15)",
                    color: COLORS.green,
                  }}
                >
                  {copy.t("Recommended")}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Description for current preset */}
      <div style={{ marginTop: 12, fontSize: 12.5, lineHeight: 1.5 }} className="text-admin-ink-muted">
        <strong style={{ fontWeight: 600 }} className="text-admin-ink">
          {current.label}.
        </strong>{" "}
        {current.description}
      </div>
    </section>
  );
}


/**
 * Pro-tier value card (E6). Surfaces a concrete unlock-list for the
 * next subscription tier, anchored to the talent's current tier so the
 * pitch reflects what they'd actually gain. Avoids the "feature wall"
 * trap by leading with the 3 highest-value modules first.
 *
 * Forest accent because tier upgrades are framed as earnings-adjacent
 * (more reach, better presentation, higher inquiry rate), not branded
 * marketing.
 */
export function ProTierValueCard({
  currentTier,
  onCompare,
  onDismiss,
}: {
  currentTier: TalentSubscriptionTier;
  onCompare: () => void;
  onDismiss?: () => void;
}) {
  const copy = useDashboardText();
  // Skip if already on top tier (parent gates this, but defensive).
  if (currentTier === "max") return null;
  const isFree = currentTier === "free";
  const targetTier = isFree ? "pro" : "max";
  const targetMeta = TALENT_TIER_META[targetTier];

  // Anchor the pitch on what's missing today, in priority order.
  const unlocks = isFree
    ? [
        { label: copy.t("Template picker"), body: copy.t("Pick a personal-page template that matches your category — Roster, Magazine, Editorial, Reel.") },
        { label: copy.t("Press + Media Kit"), body: copy.t("Linked press band and a downloadable PDF media kit. Casting directors love these.") },
        { label: copy.t("Video & social embeds"), body: copy.t("Embed Instagram reels, TikTok, Vimeo right on your personal page.") },
      ]
    : [
        { label: copy.t("Custom domain"), body: copy.t("Use marta-reyes.com instead of tulala.digital/t/marta-reyes. Yours, kept on renewal.") },
        { label: copy.t("Multi-section page-builder"), body: copy.t("Up to 12 stacked sections. Tell a story, not just show a grid.") },
        { label: copy.t("Priority discovery placement"), body: copy.t("Higher position in Tulala Hub search + recommendations.") },
      ];

  return (
    <section
      style={{
        position: "relative",
        background: `linear-gradient(135deg, rgba(46,125,91,0.10) 0%, #fff 60%)`,
        border: `1px solid ${COLORS.green}`,
        borderRadius: 14,
        padding: "16px 18px",
        fontFamily: FONTS.body,
      }}
    >
      {onDismiss && (
        <button
          onClick={onDismiss}
          aria-label={copy.t("Dismiss — collapse to a compact strip")}
          style={{
            position: "absolute",
            top: 8,
            right: 8,
            width: 22,
            height: 22,
            borderRadius: 6,
            border: "none",
            background: "transparent",
            color: COLORS.inkMuted,
            cursor: "pointer",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(11,11,13,0.06)")}
          onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
        >
          <Icon name="x" size={11} />
        </button>
      )}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
        <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: 0.7, textTransform: "uppercase", padding: "4px 9px", borderRadius: 999 }} className="text-admin-green bg-admin-success-soft">
          {targetMeta.label} · {targetMeta.monthlyPrice}
        </span>
        <span className="text-admin-ink-muted text-xs">{copy.t("vs your current")} {TALENT_TIER_META[currentTier].label}</span>
      </div>
      <h3 style={{ fontFamily: FONTS.display, fontSize: 20, fontWeight: 500, margin: 0, letterSpacing: -0.2, lineHeight: 1.2, marginBottom: 12 }} className="text-admin-ink">
        {copy.t(isFree
          ? "Three things Pro unlocks that move inquiry rate"
          : "What Max adds on top of Pro")}
      </h3>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginBottom: 14 }}>
        {unlocks.map((item, idx) => (
          <SecondaryCard key={idx} title={item.label} description={item.body} />
        ))}
      </div>

      <div className="flex items-center gap-2.5">
        <PrimaryButton onClick={onCompare}>{copy.t("See full comparison")}</PrimaryButton>
        <span className="text-admin-ink-muted text-admin-11h">
          {copy.t("Cancel anytime. Your URL stays the same.")}
        </span>
      </div>
    </section>
  );
}


/**
 * Audit #44 — Reach health score. Distills "how well-distributed are
 * you" into a single 0–100 number with tone (red/amber/green). Math is
 * intentionally simple (channel coverage + 7d inquiry signal). Tone
 * shifts at 50 / 75 thresholds.
 */
export function ReachHealthScore({
  liveChannels,
  totalChannels,
  inquiries7d,
}: {
  liveChannels: number;
  totalChannels: number;
  inquiries7d: number;
}) {
  const copy = useDashboardText();
  const coverage = Math.round((liveChannels / Math.max(totalChannels, 1)) * 60); // 0–60
  const volume = Math.min(inquiries7d * 5, 40); // 0–40
  const score = Math.min(coverage + volume, 100);
  const tone = score >= 75 ? "green" : score >= 50 ? "amber" : "coral";
  const toneColor = tone === "green" ? COLORS.green : tone === "amber" ? COLORS.amber : COLORS.coral;
  const label = copy.t(
    score >= 90 ? "Excellent — fully distributed" :
    score >= 75 ? "Healthy — most channels live" :
    score >= 50 ? "Mixed — a few channels need attention" :
    "Low — turn on more channels");
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 14,
        padding: "12px 16px",
        background: "#fff",
        border: `1px solid ${COLORS.borderSoft}`,
        borderRadius: 10,
        marginBottom: 10,
        fontFamily: FONTS.body,
      }}
    >
      <div style={{ width: 56, height: 56, borderRadius: "50%", background: "#fff", border: `3px solid ${toneColor}`, display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontFamily: FONTS.display, fontSize: 18, fontWeight: 600, fontVariantNumeric: "tabular-nums" }} className="text-admin-ink">
        {score}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-admin-ink-muted text-admin-10h font-semibold">
          {copy.t("Reach health")}
        </div>
        <div style={{ fontSize: 14, fontWeight: 500, marginTop: 2 }} className="text-admin-ink">
          {label}
        </div>
        <div style={{ fontSize: 11.5, marginTop: 2 }} className="text-admin-ink-muted">
          {liveChannels} {copy.t("of")} {totalChannels} {copy.t("channels live")} · {inquiries7d} {copy.t("inquiries in last 7d")}
        </div>
      </div>
    </div>
  );
}


/**
 * Audit #40 — compact strip variant of the Pro-tier value card. Shown
 * after the talent dismisses the full card. Single line, low visual
 * weight, but still the upgrade affordance is one click away.
 */
export function ProTierCompactStrip({
  currentTier,
  onCompare,
}: {
  currentTier: TalentSubscriptionTier;
  onCompare: () => void;
}) {
  const copy = useDashboardText();
  const isFree = currentTier === "free";
  const targetTier = isFree ? "pro" : "max";
  const targetMeta = TALENT_TIER_META[targetTier];
  return (
    <button
      type="button"
      onClick={onCompare}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        width: "100%",
        padding: "10px 14px",
        background: "rgba(46,125,91,0.06)",
        border: `1px solid rgba(46,125,91,0.20)`,
        borderRadius: 10,
        cursor: "pointer",
        fontFamily: FONTS.body,
        textAlign: "left",
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = COLORS.successSoft)}
      onMouseLeave={(e) => (e.currentTarget.style.background = "rgba(46,125,91,0.06)")}
    >
      <Icon name="sparkle" size={13} color={COLORS.green} stroke={1.7} />
      <span style={{ flex: 1, fontSize: 12.5, fontWeight: 500 }} className="text-admin-ink">
        {copy.isSpanish ? "En" : "On"} {TALENT_TIER_META[currentTier].label}.{" "}
        <span style={{ fontWeight: 600 }} className="text-admin-green">{targetMeta.label}</span> {copy.t("unlocks 3 modules")} · {targetMeta.monthlyPrice}
      </span>
      <span className="text-admin-green text-admin-11h font-semibold">
        {copy.t("Compare →")}
      </span>
    </button>
  );
}


/**
 * Distribution card — one per lane. Header has lane title + description +
 * optional primary action (Edit / Join another). Body is a list of
 * channels in this lane with toggle + counts. Optional "Browse more"
 * footer when there are unjoined available channels.
 */
export function DistributionCard({
  kind,
  title,
  description,
  channels,
  channelOn,
  onToggle,
  onPrimary,
  available,
  onAdd,
  onManage,
}: {
  kind: ChannelKind;
  title: string;
  description: string;
  channels: ChannelEntry[];
  channelOn: Record<string, boolean>;
  onToggle: (id: string, on: boolean) => void;
  onPrimary?: { label: string; handler: () => void };
  available?: ChannelEntry[];
  onAdd?: (c: ChannelEntry) => void;
  /** Manage action per channel — used by Agencies card to open the
   *  TalentAgencyRelationshipDrawer. Replaces the "Contract-managed"
   *  static label with a clickable "Manage →" affordance. */
  onManage?: (c: ChannelEntry) => void;
}) {
  const copy = useDashboardText();
  // Lane-level icon + tone
  const laneMeta: Record<ChannelKind, { icon: string; toneFg: string; toneBg: string }> = {
    personal: { icon: "🌐", toneFg: COLORS.royal, toneBg: COLORS.royalSoft },
    "tulala-hub": { icon: "✦", toneFg: COLORS.accent, toneBg: COLORS.accentSoft },
    agency: { icon: "🏢", toneFg: COLORS.ink, toneBg: "rgba(11,11,13,0.05)" },
    external: { icon: "🌍", toneFg: COLORS.indigo, toneBg: COLORS.indigoSoft },
    studio: { icon: "🎬", toneFg: COLORS.green, toneBg: COLORS.successSoft },
  };
  const lane = laneMeta[kind];
  const liveCount = channels.filter((c) => channelOn[c.id]).length;
  const totalAvail = channels.length + (available?.length ?? 0);
  const showAvailable = available && available.length > 0;

  return (
    <section
      style={{
        background: "#fff",
        border: `1px solid ${COLORS.borderSoft}`,
        borderRadius: 12,
        padding: "16px 18px",
        fontFamily: FONTS.body,
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          gap: 12,
          marginBottom: 12,
        }}
      >
        <span
          aria-hidden
          style={{
            width: 32,
            height: 32,
            borderRadius: 8,
            background: lane.toneBg,
            color: lane.toneFg,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
            fontSize: 14,
          }}
        >
          {lane.icon}
        </span>
        <div className="flex-1 min-w-0">
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, fontWeight: 600, letterSpacing: -0.05 }} className="text-admin-ink">
            <span>{title}</span>
            <span style={{ fontSize: 11, fontWeight: 500, fontVariantNumeric: "tabular-nums" }} className="text-admin-ink-muted">
              {liveCount}/{totalAvail}
            </span>
          </div>
          <div style={{ fontSize: 12.5, marginTop: 2, lineHeight: 1.5 }} className="text-admin-ink-muted">
            {description}
          </div>
        </div>
        {onPrimary && (
          <button
            type="button"
            onClick={onPrimary.handler}
            style={{
              flexShrink: 0,
              background: "transparent",
              border: "none",
              color: COLORS.ink,
              fontFamily: FONTS.body,
              fontSize: 12,
              fontWeight: 500,
              cursor: "pointer",
              padding: 0,
            }}
          >
            {onPrimary.label} →
          </button>
        )}
      </div>

      {/* Channel list */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 0,
          border: `1px solid ${COLORS.borderSoft}`,
          borderRadius: 10,
          overflow: "hidden",
        }}
      >
        {channels.length === 0 && !showAvailable ? (
          <EmptyState
            icon="info"
            title={copy.t(
              kind === "agency"
                ? "No agency channels yet"
                : kind === "external"
                  ? "No external hubs joined"
                  : "No channels in this lane"
            )}
            body={
              kind === "agency"
                ? copy.t("Agencies invite talent onto their roster — keep your profile complete so the right ones find you.")
                : kind === "external"
                  ? copy.t("Browse verified hubs below to expand your reach.")
                  : undefined
            }
            compact
          />
        ) : null}
        {channels.map((c, i) => (
          <ChannelRow
            key={c.id}
            channel={c}
            on={channelOn[c.id] ?? false}
            onToggle={(next) => onToggle(c.id, next)}
            first={i === 0}
            onManage={onManage ? () => onManage(c) : undefined}
          />
        ))}
        {showAvailable && (
          <>
            {available!.map((c) => (
              <AvailableChannelRow
                key={c.id}
                channel={c}
                onAdd={() => onAdd!(c)}
              />
            ))}
          </>
        )}
      </div>
    </section>
  );
}
