"use client";

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
          <div
            style={{
              fontSize: 14,
              fontWeight: 600,
              color: COLORS.ink,
              letterSpacing: -0.05,
            }}
          >
            Exposure level
          </div>
          <div
            style={{
              fontSize: 12.5,
              color: COLORS.inkMuted,
              marginTop: 2,
              lineHeight: 1.5,
            }}
          >
            One control, four levels. Sets sensible defaults across every channel.
            Override individual channels below.
          </div>
        </div>
      </div>

      {/* Segmented control */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: 6,
          padding: 4,
          background: COLORS.surfaceAlt,
          borderRadius: 10,
        }}
      >
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
                  Recommended
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Description for current preset */}
      <div
        style={{
          marginTop: 12,
          fontSize: 12.5,
          color: COLORS.inkMuted,
          lineHeight: 1.5,
        }}
      >
        <strong style={{ color: COLORS.ink, fontWeight: 600 }}>
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
  // Skip if already on top tier (parent gates this, but defensive).
  if (currentTier === "portfolio") return null;
  const isBasic = currentTier === "basic";
  const targetTier = isBasic ? "pro" : "portfolio";
  const targetMeta = TALENT_TIER_META[targetTier];

  // Anchor the pitch on what's missing today, in priority order.
  const unlocks = isBasic
    ? [
        { label: "Template picker", body: "Pick a personal-page template that matches your category — Roster, Magazine, Editorial, Reel." },
        { label: "Press + Media Kit", body: "Linked press band and a downloadable PDF media kit. Casting directors love these." },
        { label: "Video & social embeds", body: "Embed Instagram reels, TikTok, Vimeo right on your personal page." },
      ]
    : [
        { label: "Custom domain", body: "Use marta-reyes.com instead of tulala.digital/t/marta-reyes. Yours, kept on renewal." },
        { label: "Multi-section page-builder", body: "Up to 12 stacked sections. Tell a story, not just show a grid." },
        { label: "Priority discovery placement", body: "Higher position in Tulala Hub search + recommendations." },
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
          aria-label="Dismiss — collapse to a compact strip"
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
        <span
          style={{
            fontSize: 10.5,
            fontWeight: 700,
            letterSpacing: 0.7,
            textTransform: "uppercase",
            color: COLORS.green,
            background: COLORS.successSoft,
            padding: "4px 9px",
            borderRadius: 999,
          }}
        >
          {targetMeta.label} · {targetMeta.monthlyPrice}
        </span>
        <span style={{ fontSize: 12, color: COLORS.inkMuted }}>vs your current {TALENT_TIER_META[currentTier].label}</span>
      </div>
      <h3
        style={{
          fontFamily: FONTS.display,
          fontSize: 20,
          fontWeight: 500,
          color: COLORS.ink,
          margin: 0,
          letterSpacing: -0.2,
          lineHeight: 1.2,
          marginBottom: 12,
        }}
      >
        {isBasic
          ? "Three things Pro unlocks that move inquiry rate"
          : "What Portfolio adds on top of Pro"}
      </h3>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginBottom: 14 }}>
        {unlocks.map((item, idx) => (
          <SecondaryCard key={idx} title={item.label} description={item.body} />
        ))}
      </div>

      <div className="flex items-center gap-2.5">
        <PrimaryButton onClick={onCompare}>See full comparison</PrimaryButton>
        <span style={{ fontSize: 11.5, color: COLORS.inkMuted }}>
          Cancel anytime. Your URL stays the same.
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
  const coverage = Math.round((liveChannels / Math.max(totalChannels, 1)) * 60); // 0–60
  const volume = Math.min(inquiries7d * 5, 40); // 0–40
  const score = Math.min(coverage + volume, 100);
  const tone = score >= 75 ? "green" : score >= 50 ? "amber" : "coral";
  const toneColor = tone === "green" ? COLORS.green : tone === "amber" ? COLORS.amber : COLORS.coral;
  const label =
    score >= 90 ? "Excellent — fully distributed" :
    score >= 75 ? "Healthy — most channels live" :
    score >= 50 ? "Mixed — a few channels need attention" :
    "Low — turn on more channels";
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
      <div
        style={{
          width: 56,
          height: 56,
          borderRadius: "50%",
          background: "#fff",
          border: `3px solid ${toneColor}`,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
          fontFamily: FONTS.display,
          fontSize: 18,
          fontWeight: 600,
          color: COLORS.ink,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {score}
      </div>
      <div className="flex-1 min-w-0">
        <div style={{ fontSize: 10.5, fontWeight: 600, color: COLORS.inkMuted }}>
          Reach health
        </div>
        <div style={{ fontSize: 14, fontWeight: 500, color: COLORS.ink, marginTop: 2 }}>
          {label}
        </div>
        <div style={{ fontSize: 11.5, color: COLORS.inkMuted, marginTop: 2 }}>
          {liveChannels} of {totalChannels} channels live · {inquiries7d} inquiries in last 7d
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
  const isBasic = currentTier === "basic";
  const targetTier = isBasic ? "pro" : "portfolio";
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
      <span style={{ flex: 1, fontSize: 12.5, color: COLORS.ink, fontWeight: 500 }}>
        On {TALENT_TIER_META[currentTier].label}.{" "}
        <span style={{ color: COLORS.green, fontWeight: 600 }}>{targetMeta.label}</span> unlocks 3 modules · {targetMeta.monthlyPrice}
      </span>
      <span style={{ fontSize: 11.5, fontWeight: 600, color: COLORS.green }}>
        Compare →
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
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              fontSize: 14,
              fontWeight: 600,
              color: COLORS.ink,
              letterSpacing: -0.05,
            }}
          >
            <span>{title}</span>
            <span
              style={{
                fontSize: 11,
                fontWeight: 500,
                color: COLORS.inkMuted,
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {liveCount}/{totalAvail}
            </span>
          </div>
          <div
            style={{
              fontSize: 12.5,
              color: COLORS.inkMuted,
              marginTop: 2,
              lineHeight: 1.5,
            }}
          >
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
            title={
              kind === "agency"
                ? "No agency channels yet"
                : kind === "external"
                  ? "No external hubs joined"
                  : "No channels in this lane"
            }
            body={
              kind === "agency"
                ? "Agencies invite talent onto their roster — keep your profile complete so the right ones find you."
                : kind === "external"
                  ? "Browse verified hubs below to expand your reach."
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
