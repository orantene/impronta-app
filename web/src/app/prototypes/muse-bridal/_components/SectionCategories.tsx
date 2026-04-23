import Link from "next/link";

import type { IconKey, ServiceCategory } from "../_data/services";
import { Eyebrow } from "./Eyebrow";
import { Reveal } from "./Reveal";
import {
  IconBrush,
  IconCamera,
  IconClipboard,
  IconFilm,
  IconFloral,
  IconMusic,
  IconScissors,
  IconSparkle,
} from "./icons";

/**
 * Service / category grid.
 *
 * CMS → Category Grid Section:
 *   - layout_variant: `portrait-masonry` (this one) | `horizontal-scroll` |
 *     `small-icon-list`
 *   - columns_desktop: 2 | 3 | 4
 *   - show_kicker: bool
 *   - show_description: bool
 *   - items[]: ServiceCategory rows (foreign-key to taxonomy.services)
 */

const ICONS: Record<IconKey, (props: { size?: number }) => React.ReactElement> = {
  brush: (p) => <IconBrush {...p} />,
  scissors: (p) => <IconScissors {...p} />,
  camera: (p) => <IconCamera {...p} />,
  film: (p) => <IconFilm {...p} />,
  clipboard: (p) => <IconClipboard {...p} />,
  floral: (p) => <IconFloral {...p} />,
  sparkle: (p) => <IconSparkle {...p} />,
  music: (p) => <IconMusic {...p} />,
};

export function SectionCategories({
  items,
  eyebrow,
  title,
  copy,
}: {
  items: ServiceCategory[];
  eyebrow: string;
  title: React.ReactNode;
  copy: React.ReactNode;
}) {
  return (
    <section className="muse-section" id="services">
      <div className="muse-shell">
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(0, 1.2fr) minmax(0, 1fr)",
            gap: 48,
            alignItems: "end",
            marginBottom: 56,
          }}
        >
          <Reveal>
            <Eyebrow>{eyebrow}</Eyebrow>
            <h2
              style={{
                fontSize: "clamp(36px, 5vw, 62px)",
                marginTop: 18,
                maxWidth: 640,
              }}
            >
              {title}
            </h2>
          </Reveal>
          <Reveal delay={1}>
            <p style={{ maxWidth: 460 }}>{copy}</p>
            <Link
              href="/prototypes/muse-bridal/services"
              className="muse-btn muse-btn--ghost"
              style={{ marginTop: 20, display: "inline-flex" }}
            >
              Browse All Services
            </Link>
          </Reveal>
        </div>

        <div
          style={{
            display: "grid",
            gap: 22,
            gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
          }}
        >
          {items.map((cat, i) => {
            const Icon = ICONS[cat.iconKey];
            return (
              <Reveal key={cat.slug} delay={(i % 4) as 0 | 1 | 2 | 3}>
                <Link
                  href={`/prototypes/muse-bridal/collective?service=${cat.slug}`}
                  className="muse-category"
                >
                  <img src={cat.image} alt="" />
                  <span className="muse-category__icon">
                    <Icon size={26} />
                  </span>
                  <div>
                    <div className="muse-category__label">{cat.label}</div>
                    <div className="muse-category__meta">{cat.tagline}</div>
                  </div>
                </Link>
              </Reveal>
            );
          })}
        </div>
      </div>
    </section>
  );
}
