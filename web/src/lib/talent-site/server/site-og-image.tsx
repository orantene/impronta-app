import { ImageResponse } from "next/og";

/**
 * Talent Max Site — SHARED OG-image generator.
 *
 * SEO-2. All three talent-site route-level `opengraph-image.tsx` files consume
 * THIS one generator so the custom-domain catch-all, `/t/site/[siteSlug]`, and
 * `/t/site/[siteSlug]/[pageSlug]` never fork their link-preview card. It mirrors
 * the talent-profile `opengraph-image.tsx` pattern (1200×630 ImageResponse,
 * left identity column + right hero/logo panel) but keys off the SITE's own
 * brand surface — `logoUrl` + the talent display name + the page title — so the
 * card represents the talent's website, NOT the discovery profile.
 *
 * Pure + degrade-safe: every field is optional; a site with no logo falls back
 * to a monogram tile, and a missing name falls back to the page title.
 */

export const OG_IMAGE_SIZE = { width: 1200, height: 630 } as const;
export const OG_IMAGE_CONTENT_TYPE = "image/png" as const;

export interface SiteOgImageInput {
  /** Talent display name — the headline identity on the card. */
  name: string;
  /** Page title (e.g. "Work", "Contact") — the kicker above the name. */
  pageTitle?: string | null;
  /** The site's own logo (shell `logo_url`) — painted in the right panel. */
  logoUrl?: string | null;
}

function monogram(name: string): string {
  const ch = name.trim().charAt(0).toUpperCase();
  return ch || "•";
}

/**
 * Build the talent-site OG `ImageResponse`. Returns the Next `ImageResponse`
 * the route-level `opengraph-image.tsx` default-exports. Shared so all 3 routes
 * produce byte-identical cards.
 */
export function buildSiteOgImage(input: SiteOgImageInput): ImageResponse {
  const name = input.name.trim() || "Tulala";
  const kicker = input.pageTitle?.trim() || "";
  const logoUrl = input.logoUrl?.trim() || "";

  const surface = "#ffffff";
  const ink = "#141414";
  const muted = "#6b6b6b";
  const accent = "#1f2937";
  const panel = "#0f172a";

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          background: surface,
          fontFamily: "sans-serif",
        }}
      >
        {/* Left: identity */}
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            padding: "64px 72px",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 14,
              fontSize: 22,
              letterSpacing: 6,
              textTransform: "uppercase",
              color: muted,
              fontWeight: 500,
            }}
          >
            <div style={{ width: 38, height: 1, background: accent }} />
            Tulala
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
            {kicker ? (
              <div
                style={{
                  fontSize: 22,
                  letterSpacing: 5,
                  textTransform: "uppercase",
                  color: muted,
                  fontWeight: 500,
                }}
              >
                {kicker}
              </div>
            ) : null}
            <div
              style={{
                fontSize: 72,
                lineHeight: 1.05,
                color: ink,
                fontWeight: 400,
                letterSpacing: -0.5,
                maxWidth: 560,
              }}
            >
              {name}
            </div>
          </div>

          <div
            style={{
              fontSize: 18,
              letterSpacing: 3,
              textTransform: "uppercase",
              color: muted,
            }}
          >
            Official site
          </div>
        </div>

        {/* Right: logo or monogram tile */}
        <div
          style={{
            width: 480,
            height: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: panel,
          }}
        >
          {logoUrl ? (
            <img
              src={logoUrl}
              alt=""
              width={300}
              height={300}
              style={{
                maxWidth: 300,
                maxHeight: 300,
                objectFit: "contain",
              }}
            />
          ) : (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: surface,
                fontSize: 200,
                fontWeight: 300,
                letterSpacing: -4,
                opacity: 0.85,
              }}
            >
              {monogram(name)}
            </div>
          )}
        </div>
      </div>
    ),
    { ...OG_IMAGE_SIZE },
  );
}
