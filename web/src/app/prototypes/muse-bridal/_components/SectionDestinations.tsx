import Link from "next/link";

import type { Destination } from "../_data/destinations";
import { Eyebrow } from "./Eyebrow";
import { Reveal } from "./Reveal";
import { IconArrowRight, IconPlane } from "./icons";

/**
 * Destination / service area band.
 *
 * CMS → Destination Strip Section:
 *   - layout_variant: `portrait-mosaic` (this one) | `map-inspired` | `tile-grid`
 *   - items[]: { label, region, tagline, image, slug }
 *   - source_mode: `manual_pick` | `auto_featured`
 */

export function SectionDestinations({ items }: { items: Destination[] }) {
  const [hero, ...rest] = items;
  if (!hero) return null;
  return (
    <section className="muse-section" id="destinations">
      <div className="muse-shell">
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1.05fr)",
            gap: 48,
            alignItems: "end",
            marginBottom: 48,
          }}
        >
          <Reveal>
            <Eyebrow>Destinations</Eyebrow>
            <h2
              style={{
                fontSize: "clamp(36px, 5vw, 62px)",
                marginTop: 18,
                maxWidth: 560,
              }}
            >
              From the jungle to the Mediterranean.
            </h2>
          </Reveal>
          <Reveal delay={1}>
            <p style={{ maxWidth: 520 }}>
              Every member of the collective travels fluently. Our Mexico-based
              teams are based in Tulum, Los Cabos, Mexico City, Oaxaca and Valle
              de Guadalupe, and we regularly produce events across the
              Mediterranean and the Middle East.
            </p>
          </Reveal>
        </div>

        <div
          style={{
            display: "grid",
            gap: 20,
            gridTemplateColumns: "minmax(0, 1.25fr) minmax(0, 1fr)",
            gridTemplateAreas: `"hero rest"`,
          }}
        >
          <Reveal
            style={{
              gridArea: "hero",
              position: "relative",
              borderRadius: "var(--muse-radius-lg)",
              overflow: "hidden",
              minHeight: 480,
            }}
          >
            <img
              src={hero.image}
              alt={hero.label}
              style={{
                position: "absolute",
                inset: 0,
                width: "100%",
                height: "100%",
                objectFit: "cover",
              }}
            />
            <div
              style={{
                position: "absolute",
                inset: 0,
                background:
                  "linear-gradient(180deg, rgba(42,34,30,0) 0%, rgba(42,34,30,0.65) 100%)",
              }}
            />
            <div
              style={{
                position: "absolute",
                left: 32,
                right: 32,
                bottom: 32,
                color: "var(--muse-ivory)",
                display: "flex",
                alignItems: "flex-end",
                justifyContent: "space-between",
                gap: 24,
              }}
            >
              <div>
                <div
                  style={{
                    fontSize: 11,
                    letterSpacing: "0.22em",
                    textTransform: "uppercase",
                    opacity: 0.78,
                    marginBottom: 10,
                  }}
                >
                  Signature · {hero.region}
                </div>
                <h3
                  style={{
                    color: "var(--muse-ivory)",
                    fontSize: "clamp(34px, 4vw, 52px)",
                  }}
                >
                  {hero.label}
                </h3>
                <p
                  style={{
                    color: "rgba(246,241,234,0.86)",
                    marginTop: 10,
                    maxWidth: 420,
                  }}
                >
                  {hero.tagline}
                </p>
              </div>
              <Link
                href={`/prototypes/muse-bridal/collective?destination=${hero.slug}`}
                className="muse-btn muse-btn--outline-light muse-btn--sm"
              >
                Plan here
              </Link>
            </div>
          </Reveal>

          <div
            style={{
              gridArea: "rest",
              display: "grid",
              gap: 16,
              gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
            }}
          >
            {rest.map((d, i) => (
              <Reveal
                key={d.slug}
                delay={(i % 4) as 0 | 1 | 2 | 3}
                style={{
                  position: "relative",
                  borderRadius: "var(--muse-radius)",
                  overflow: "hidden",
                  minHeight: 232,
                }}
              >
                <img
                  src={d.image}
                  alt={d.label}
                  style={{
                    position: "absolute",
                    inset: 0,
                    width: "100%",
                    height: "100%",
                    objectFit: "cover",
                  }}
                />
                <div
                  style={{
                    position: "absolute",
                    inset: 0,
                    background:
                      "linear-gradient(180deg, rgba(42,34,30,0) 40%, rgba(42,34,30,0.72) 100%)",
                  }}
                />
                <Link
                  href={`/prototypes/muse-bridal/collective?destination=${d.slug}`}
                  style={{
                    position: "absolute",
                    inset: 0,
                    padding: 20,
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "flex-end",
                    color: "var(--muse-ivory)",
                  }}
                >
                  <div
                    style={{
                      fontSize: 10,
                      letterSpacing: "0.24em",
                      textTransform: "uppercase",
                      opacity: 0.78,
                      marginBottom: 6,
                    }}
                  >
                    {d.region}
                  </div>
                  <div
                    style={{
                      fontFamily: "var(--muse-font-display)",
                      fontSize: 24,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 10,
                    }}
                  >
                    {d.label}
                    <IconArrowRight size={16} />
                  </div>
                </Link>
              </Reveal>
            ))}
          </div>
        </div>

        <Reveal
          style={{
            marginTop: 40,
            display: "flex",
            alignItems: "center",
            gap: 12,
            color: "var(--muse-muted)",
          }}
        >
          <IconPlane size={20} />
          <span style={{ fontSize: 13.5 }}>
            International travel quoted per enquiry — most members include
            concierge travel coordination.
          </span>
        </Reveal>
      </div>
    </section>
  );
}
