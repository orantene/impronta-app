import { Eyebrow } from "./Eyebrow";
import { Reveal } from "./Reveal";

/**
 * Editorial gallery strip.
 *
 * CMS → Gallery Section:
 *   - layout_variant: `mosaic` (this one) | `scroll-rail` | `grid-uniform`
 *   - items[]: { image, alt, aspect? (tall | wide | square), link? }
 *   - caption: optional italic serif line below strip
 */

type GalleryItem = { src: string; span?: "wide" | "tall" | "square" };

export function SectionGallery({
  items,
  eyebrow,
  title,
  caption,
}: {
  items: GalleryItem[];
  eyebrow: string;
  title: React.ReactNode;
  caption?: React.ReactNode;
}) {
  return (
    <section className="muse-section" id="gallery">
      <div className="muse-shell">
        <Reveal style={{ marginBottom: 40 }}>
          <Eyebrow>{eyebrow}</Eyebrow>
          <h2
            style={{
              fontSize: "clamp(32px, 4.5vw, 56px)",
              marginTop: 16,
              maxWidth: 720,
            }}
          >
            {title}
          </h2>
        </Reveal>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(12, 1fr)",
            gap: 16,
          }}
        >
          {items.map((item, i) => {
            const span = item.span ?? (i % 3 === 0 ? "tall" : i % 4 === 0 ? "wide" : "square");
            const col = span === "wide" ? "span 6" : span === "tall" ? "span 4" : "span 4";
            const aspect = span === "wide" ? "5 / 3" : span === "tall" ? "3 / 4" : "1 / 1";
            return (
              <Reveal
                key={item.src + i}
                delay={(i % 4) as 0 | 1 | 2 | 3}
                style={{
                  gridColumn: col,
                  aspectRatio: aspect,
                  borderRadius: "var(--muse-radius-sm)",
                  overflow: "hidden",
                  background: "var(--muse-champagne-soft)",
                }}
              >
                <img
                  src={item.src}
                  alt=""
                  style={{
                    width: "100%",
                    height: "100%",
                    objectFit: "cover",
                    display: "block",
                  }}
                />
              </Reveal>
            );
          })}
        </div>

        {caption ? (
          <Reveal
            delay={2}
            style={{
              marginTop: 32,
              textAlign: "center",
              fontFamily: "var(--muse-font-display)",
              fontStyle: "italic",
              fontWeight: 300,
              color: "var(--muse-espresso)",
              fontSize: 20,
              opacity: 0.8,
            }}
          >
            {caption}
          </Reveal>
        ) : null}
      </div>
    </section>
  );
}
