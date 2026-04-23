import Link from "next/link";

import { Eyebrow } from "../_components/Eyebrow";
import { Reveal } from "../_components/Reveal";
import { SectionFinalCTA } from "../_components/SectionFinalCTA";
import { SectionHero } from "../_components/SectionHero";
import {
  IconArrowRight,
  IconBrush,
  IconCamera,
  IconClipboard,
  IconFilm,
  IconFloral,
  IconMusic,
  IconScissors,
  IconSparkle,
} from "../_components/icons";
import { IMAGERY } from "../_data/imagery";
import { type IconKey, SERVICES } from "../_data/services";

/**
 * Services / Categories page.
 *
 * Template → `services-editorial` variant. Large feature blocks alternate
 * image/copy sides — in a real CMS this maps to `image_copy_alternating[]`
 * section with per-item `side: left | right`.
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

export default function ServicesPage() {
  return (
    <>
      <SectionHero
        eyebrow="Services"
        headline={
          <>
            A full house,{" "}
            <em
              style={{
                fontFamily: "var(--muse-font-display)",
                fontStyle: "italic",
                fontWeight: 300,
                color: "var(--muse-blush)",
              }}
            >
              one conversation.
            </em>
          </>
        }
        subhead="Eight specialties, one concierge — everything you need to compose a wedding team who arrive already speaking the same visual language."
        image={IMAGERY.heroServices}
        compact
        overlay={0.55}
      />

      <section className="muse-section">
        <div className="muse-shell">
          <div style={{ display: "flex", flexDirection: "column", gap: 96 }}>
            {SERVICES.map((svc, i) => {
              const Icon = ICONS[svc.iconKey];
              const reverse = i % 2 === 1;
              return (
                <Reveal
                  key={svc.slug}
                  style={{
                    display: "grid",
                    gap: 48,
                    gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)",
                    alignItems: "center",
                  }}
                >
                  <div
                    style={{
                      order: reverse ? 2 : 1,
                      borderRadius: "var(--muse-radius-lg)",
                      overflow: "hidden",
                      aspectRatio: "5 / 6",
                    }}
                  >
                    <img
                      src={svc.image}
                      alt={svc.label}
                      style={{ width: "100%", height: "100%", objectFit: "cover" }}
                    />
                  </div>
                  <div
                    style={{
                      order: reverse ? 1 : 2,
                      display: "flex",
                      flexDirection: "column",
                      gap: 20,
                    }}
                  >
                    <span
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 14,
                        color: "var(--muse-blush)",
                      }}
                    >
                      <Icon size={30} />
                      <Eyebrow>{svc.kicker}</Eyebrow>
                    </span>
                    <h2
                      style={{
                        fontSize: "clamp(36px, 5vw, 60px)",
                        maxWidth: 440,
                      }}
                    >
                      {svc.label}
                    </h2>
                    <p
                      style={{
                        fontFamily: "var(--muse-font-display)",
                        fontStyle: "italic",
                        fontWeight: 300,
                        fontSize: 22,
                        color: "var(--muse-espresso)",
                        lineHeight: 1.4,
                      }}
                    >
                      {svc.tagline}
                    </p>
                    <p style={{ fontSize: 16, color: "var(--muse-espresso)" }}>
                      {svc.description}
                    </p>
                    <ul
                      style={{
                        listStyle: "none",
                        padding: 0,
                        margin: "6px 0 0",
                        display: "flex",
                        flexDirection: "column",
                        gap: 10,
                        fontSize: 14.5,
                        color: "var(--muse-espresso-deep)",
                      }}
                    >
                      <li
                        style={{
                          fontSize: 11,
                          letterSpacing: "0.24em",
                          textTransform: "uppercase",
                          color: "var(--muse-muted)",
                        }}
                      >
                        Ideal for
                      </li>
                      {svc.idealFor.map((u) => (
                        <li
                          key={u}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 12,
                          }}
                        >
                          <span
                            aria-hidden
                            style={{
                              width: 24,
                              height: 1,
                              background: "var(--muse-blush)",
                            }}
                          />
                          {u}
                        </li>
                      ))}
                    </ul>
                    <div style={{ marginTop: 8, display: "flex", gap: 14, flexWrap: "wrap" }}>
                      <Link
                        href={`/prototypes/muse-bridal/collective?service=${svc.slug}`}
                        className="muse-btn muse-btn--primary muse-btn--sm"
                      >
                        View {svc.label.toLowerCase()} artists
                        <IconArrowRight size={14} />
                      </Link>
                      <Link
                        href={`/prototypes/muse-bridal/contact?service=${svc.slug}`}
                        className="muse-btn muse-btn--ghost"
                      >
                        Inquire for this
                      </Link>
                    </div>
                  </div>
                </Reveal>
              );
            })}
          </div>
        </div>
      </section>

      <SectionFinalCTA
        eyebrow="Want the whole team?"
        title={
          <>
            Let us compose your{" "}
            <em
              style={{
                fontFamily: "var(--muse-font-display)",
                fontStyle: "italic",
                fontWeight: 300,
                color: "var(--muse-blush)",
              }}
            >
              full day.
            </em>
          </>
        }
        copy="Most of our couples book three or more services together — which unlocks concierge coordination and an already-aligned team."
        primary={{ label: "Build a Custom Team", href: "/prototypes/muse-bridal/contact?intent=team" }}
        secondary={{ label: "Explore the Collective", href: "/prototypes/muse-bridal/collective" }}
        image={IMAGERY.heroHome}
      />
    </>
  );
}
