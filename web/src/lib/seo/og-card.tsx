import { ImageResponse } from "next/og";
import { TulalaWordmarkFilled } from "./tulala-wordmark-filled";

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
/**
 * Marketing forest. Was `#0F4F3E`, which is the ADMIN forest: a workspace
 * colour on the card that represents the brand everywhere a link is shared.
 * The canonical tokens doc ratifies Admin and Marketing as deliberately
 * separate systems, so this was not drift between two shades of the same
 * green, it was the wrong system's green. (J2)
 *
 * A literal rather than `var(--tl-forest)` because this renders through
 * Satori for a PNG, where CSS custom properties are not resolved. Keep it in
 * step with `--tl-forest` in globals.css by hand.
 */
const ACCENT = "#1e3a2d";
const SPARK = "#ff8332";

export function renderOgCard({
  kicker,
  title,
  subtitle,
  locale = "en",
}: {
  kicker: string;
  title: string;
  subtitle: string;
  /**
   * Which language this card is for. There is one card file per route segment
   * rather than per locale, so a Spanish-first page serves a Spanish card and
   * needs the descriptor in Spanish too, otherwise the card mixes languages.
   *
   * STRUCTURAL, not a caller-supplied string. It used to be a free `strapline`
   * argument, which meant every caller could put anything in the brand's
   * footer line, and one of them did. One lockup on every card means one line
   * on every card. (J2)
   */
  locale?: "en" | "es";
}) {
  const strapline =
    locale === "es"
      ? "Vende lo que haces, no lo que envías"
      : "Sell what you do, not what you ship";

  // A card whose title IS the brand should DRAW the wordmark rather than
  // typeset the word at 76px in whatever face Satori resolves. Callers that
  // pass a real page title keep the typeset heading.
  const titleIsBrand = title.trim().toLowerCase() === "tulala";
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

        {titleIsBrand ? (
          // The lockup, drawn. Height chosen so the wordmark occupies roughly
          // the optical weight the 76px type did, keeping every other card in
          // the set visually consistent with this one.
          <div style={{ display: "flex", marginBottom: 28 }}>
            <TulalaWordmarkFilled height={96} ink={INK} />
          </div>
        ) : (
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
        )}

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
