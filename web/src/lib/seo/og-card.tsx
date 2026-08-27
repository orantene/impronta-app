import { ImageResponse } from "next/og";

/**
 * Shared Open Graph card for the marketing sub-pages.
 *
 * The root `app/opengraph-image.tsx` stays separate because it is host-aware
 * (it renders an agency-branded card on tenant hosts). Everything under the
 * `(marketing)` route group is platform-owned, so it shares this one card and
 * only varies the kicker / title / subtitle. Keeping the layout identical to
 * the root card means a shared link looks like the same brand wherever it
 * lands.
 */

export const OG_SIZE = { width: 1200, height: 630 } as const;
export const OG_CONTENT_TYPE = "image/png";

const SURFACE = "#FAFAF7";
const INK = "#0B0B0D";
const MUTED = "rgba(11,11,13,0.55)";
const ACCENT = "#0F4F3E";
const SPARK = "#ff8332";

export function renderOgCard({
  kicker,
  title,
  subtitle,
  strapline = "Sell what you do, not what you ship",
}: {
  kicker: string;
  title: string;
  subtitle: string;
  /**
   * Brand descriptor in the card's footer. There is one card file per route
   * segment, not per locale, so a Spanish-first page (`/contratar-modelos`,
   * `/agencia-de-talento`) serves a Spanish card and needs the descriptor in
   * Spanish too — otherwise the card mixes both languages. Defaults to the
   * English descriptor, so no existing caller changes.
   */
  strapline?: string;
}) {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          background: SURFACE,
          display: "flex",
          flexDirection: "column",
          padding: "72px 80px",
          position: "relative",
        }}
      >
        <div
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            width: 8,
            height: "100%",
            background: ACCENT,
          }}
        />

        <div
          style={{
            fontSize: 22,
            fontWeight: 600,
            letterSpacing: "0.32em",
            color: ACCENT,
            textTransform: "uppercase",
            marginBottom: 32,
            display: "flex",
          }}
        >
          {kicker}
        </div>

        <div
          style={{
            fontSize: 76,
            fontWeight: 600,
            letterSpacing: "-0.02em",
            color: INK,
            lineHeight: 1.06,
            marginBottom: 28,
            display: "flex",
            maxWidth: 1000,
          }}
        >
          {title}
        </div>

        <div
          style={{
            fontSize: 30,
            color: MUTED,
            lineHeight: 1.4,
            display: "flex",
            maxWidth: 940,
          }}
        >
          {subtitle}
        </div>

        <div
          style={{
            position: "absolute",
            bottom: 56,
            left: 80,
            right: 80,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            fontSize: 20,
            color: MUTED,
            letterSpacing: "0.18em",
            textTransform: "uppercase",
            fontWeight: 600,
          }}
        >
          <span>{strapline}</span>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            {/* Brand mark — the rising trail from the Tulala wordmark. */}
            <div style={{ display: "flex", alignItems: "flex-end", gap: 4 }}>
              <div
                style={{ width: 12, height: 12, borderRadius: 99, background: SPARK }}
              />
              <div
                style={{
                  width: 9,
                  height: 9,
                  borderRadius: 99,
                  background: SPARK,
                  opacity: 0.7,
                  marginBottom: 8,
                }}
              />
              <div
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: 99,
                  background: SPARK,
                  opacity: 0.45,
                  marginBottom: 16,
                }}
              />
            </div>
            <span>tulala.digital</span>
          </div>
        </div>
      </div>
    ),
    { ...OG_SIZE },
  );
}
