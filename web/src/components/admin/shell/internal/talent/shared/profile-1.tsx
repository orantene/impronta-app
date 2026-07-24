"use client";

import { useState } from "react";
import { useDashboardText } from "../../dashboard-i18n";
import { COLORS, FONTS, fieldsForType, applyWorkspaceFieldOverride, parseVideoUrl, type TaxonomyParentId } from "../../state";



// ════════════════════════════════════════════════════════════════════
// MY PROFILE — talent comp-card surface.
// Designed to mirror the breadth of an industry comp card: identity,
// physicality, capability, history, trust, commercial. Each band has
// its own dedicated drawer; the overall page is the "agency book entry"
// the talent uses as their professional shopfront.
// ════════════════════════════════════════════════════════════════════

/**
 * Horizontal video showcase strip. Renders showreel + portfolio
 * videos as 16:9 cards with embedded YouTube/Vimeo players. Each
 * card lazy-mounts its iframe on first hover/tap so we don't slam
 * the network on page load with 3-5 video embeds at once. Falls
 * back to a static thumb + ▶ play overlay; clicking the overlay
 * mounts the iframe in place.
 */
function VideoShowcase({
  showreelUrl,
  showreelCaption,
  portfolioVideos,
  onManage,
}: {
  showreelUrl?: string;
  showreelCaption?: string;
  portfolioVideos: ReadonlyArray<{ url: string; caption?: string; durationSec?: number }>;
  onManage: () => void;
}) {
  const copy = useDashboardText();
  // Combine showreel + portfolio videos into a single ordered list.
  // Showreel is always first so it gets the prime visual position.
  const all: Array<{ url: string; caption?: string; durationSec?: number; isReel?: boolean }> = [
    ...(showreelUrl ? [{ url: showreelUrl, caption: showreelCaption, isReel: true }] : []),
    ...portfolioVideos,
  ];
  return (
    <div style={{ marginBottom: 22 }}>
      <div
        style={{
          display: "flex",
          gap: 12,
          overflowX: "auto",
          paddingBottom: 6,
          // Hide scrollbar across browsers — purely visual; users still
          // scroll via wheel / drag / touch.
          scrollbarWidth: "thin",
          WebkitOverflowScrolling: "touch",
        }}
      >
        {all.map((v, i) => (
          <VideoCard key={`${i}-${v.url}`} url={v.url} caption={v.caption} durationSec={v.durationSec} isReel={v.isReel} />
        ))}
        {/* Trailing "+ Add" tile — funnels into the media editor. */}
        <button
          type="button"
          onClick={onManage}
          aria-label={copy.t("Add or manage video")}
          style={{
            flex: "0 0 auto",
            width: 160,
            aspectRatio: "16 / 9",
            borderRadius: 12,
            border: `1.5px dashed ${COLORS.borderSoft}`,
            background: "#fff",
            cursor: "pointer",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 4,
            fontFamily: FONTS.body,
            fontSize: 11.5,
            color: COLORS.inkMuted,
            fontWeight: 600,
          }}
        >
          <span className="text-lg">+</span>
          <span>{copy.t("Add video")}</span>
        </button>
      </div>
    </div>
  );
}


function VideoCard({ url, caption, durationSec, isReel }: { url: string; caption?: string; durationSec?: number; isReel?: boolean }) {
  const copy = useDashboardText();
  const [playing, setPlaying] = useState(false);
  const parsed = parseVideoUrl(url);
  // mm:ss formatter, shown bottom-right when we have duration metadata.
  const dur = durationSec
    ? `${Math.floor(durationSec / 60)}:${String(durationSec % 60).padStart(2, "0")}`
    : null;
  return (
    <div
      style={{
        flex: "0 0 auto",
        width: 280,
        display: "flex",
        flexDirection: "column",
        gap: 6,
      }}
    >
      <div style={{ position: "relative", width: "100%", aspectRatio: "16 / 9", borderRadius: 12, overflow: "hidden", border: `1px solid ${COLORS.borderSoft}`, boxShadow: "0 1px 3px rgba(11,11,13,0.06)" }} className="bg-admin-surface-alt">
        {playing && parsed && (parsed.provider === "youtube" || parsed.provider === "vimeo") ? (
          <iframe
            src={`${parsed.embedUrl}?autoplay=1`}
            title={caption ?? "Video"}
            style={{ width: "100%", height: "100%", border: 0 }}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        ) : playing && parsed && parsed.provider === "mp4" ? (
          <video
            src={parsed.embedUrl}
            controls
            autoPlay
            style={{ width: "100%", height: "100%", background: "#000", objectFit: "cover" }}
          />
        ) : (
          <button
            type="button"
            onClick={() => setPlaying(true)}
            aria-label={copy.t("Play video")}
            style={{
              width: "100%",
              height: "100%",
              border: "none",
              padding: 0,
              cursor: "pointer",
              background: parsed?.thumbUrl
                ? `url(${parsed.thumbUrl}) center/cover, ${COLORS.surfaceAlt}`
                : `linear-gradient(135deg, ${COLORS.surfaceAlt}, rgba(11,11,13,0.08))`,
              position: "relative",
            }}
          >
            <span aria-hidden style={{
              position: "absolute", inset: 0,
              background: "linear-gradient(180deg, rgba(11,11,13,0) 50%, rgba(11,11,13,0.55) 100%)",
            }} />
            <span aria-hidden style={{
              position: "absolute",
              top: "50%", left: "50%", transform: "translate(-50%,-50%)",
              width: 48, height: 48, borderRadius: "50%",
              background: "rgba(255,255,255,0.94)",
              display: "flex", alignItems: "center", justifyContent: "center",
              boxShadow: "0 6px 16px rgba(11,11,13,0.3)",
            }}>
              <span style={{ fontSize: 18, marginLeft: 3 }} className="text-admin-ink">▶</span>
            </span>
            {isReel && (
              <span style={{ position: "absolute", top: 8, left: 8, fontSize: 10, fontWeight: 700, fontFamily: FONTS.body, letterSpacing: 0.4, padding: "3px 8px", borderRadius: 999, color: "#fff", textTransform: "uppercase" }} className="bg-admin-accent">★ Showreel</span>
            )}
            {parsed && (
              <span style={{
                position: "absolute", top: 8, right: 8,
                fontSize: 9.5, fontWeight: 700, fontFamily: FONTS.body, letterSpacing: 0.5,
                padding: "2px 7px", borderRadius: 999,
                background: parsed.provider === "youtube" ? "#FF0000"
                  : parsed.provider === "vimeo" ? "#1AB7EA"
                  : "rgba(11,11,13,0.55)",
                color: "#fff", textTransform: "uppercase",
              }}>{parsed.provider}</span>
            )}
            {dur && (
              <span style={{
                position: "absolute", bottom: 8, right: 8,
                fontSize: 11, fontWeight: 600, fontFamily: FONTS.body,
                padding: "2px 7px", borderRadius: 6,
                background: "rgba(11,11,13,0.72)", color: "#fff",
                fontVariantNumeric: "tabular-nums",
              }}>{dur}</span>
            )}
          </button>
        )}
      </div>
      {caption && (
        <div style={{ fontFamily: FONTS.body, fontSize: 12, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} className="text-admin-ink-muted">
          {caption}
        </div>
      )}
    </div>
  );
}


/**
 * Tier breakdown — three small chips showing Universal / Global /
 * Type-specific completion. Reads applicable-fields-per-tier from
 * the catalog and intersects with the live missing list. Talent
 * gets a clear signal of what kind of progress matters: Universal
 * must hit 100% to publish; Global pads the percent; Type-specific
 * is the polish for higher discovery rank.
 */
export function TierBreakdown({
  missing,
  primaryType,
  secondaryTypes,
  tenantId,
}: {
  missing: ReadonlyArray<{ id: string; label: string; section: string }>;
  primaryType: TaxonomyParentId;
  secondaryTypes?: ReadonlyArray<TaxonomyParentId>;
  /** Real tenant UUID. When set, fields the workspace DISABLED are excluded
   *  from the count so the completeness meter matches what the talent can
   *  actually edit. Absent (prototype / no tenant) = every catalog field
   *  counts, exactly as before (`applyWorkspaceFieldOverride` is a no-op). */
  tenantId?: string | null;
}) {
  const types = [primaryType, ...(secondaryTypes ?? [])];
  const applicable = fieldsForType(types)
    .map(f => applyWorkspaceFieldOverride(f, tenantId))
    .filter(f => f.enabled)
    .filter(f =>
      !f.id.startsWith("dyn.") && f.id !== "consent.terms" && f.id !== "media.headshot"
    );
  const copy = useDashboardText();
  const missingIds = new Set(missing.map(m => m.id));
  const tiers = (["universal", "global", "type-specific"] as const).map(tier => {
    const tierFields = applicable.filter(f => f.tier === tier);
    const tierMissing = tierFields.filter(f => missingIds.has(f.id)).length;
    const tierFilled = tierFields.length - tierMissing;
    return {
      tier,
      label: copy.t(tier === "universal" ? "Universal" : tier === "global" ? "Global" : "Type-specific"),
      filled: tierFilled,
      total: tierFields.length,
      complete: tierMissing === 0,
    };
  });
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
      {tiers.map(t => (
        <span
          key={t.tier}
          style={{
            display: "inline-flex", alignItems: "center", gap: 4,
            padding: "3px 9px", borderRadius: 999,
            background: t.complete ? "rgba(15,79,62,0.10)" : "#fff",
            border: `1px solid ${t.complete ? "rgba(15,79,62,0.30)" : "rgba(91,107,160,0.25)"}`,
            color: t.complete ? COLORS.accentDeep ?? COLORS.accent : COLORS.indigoDeep,
            fontSize: 10.5, fontWeight: 600,
            fontFamily: FONTS.body,
            letterSpacing: 0.2,
          }}
          title={`${t.label}: ${t.filled} ${copy.t("of")} ${t.total} ${copy.t("filled")}`}
        >
          {t.complete && <span aria-hidden>✓</span>}
          <span>{t.label}: {t.filled}/{t.total}</span>
        </span>
      ))}
    </div>
  );
}
