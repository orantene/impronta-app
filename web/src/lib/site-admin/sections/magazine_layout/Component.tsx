import { presentationDataAttrs, presentationInlineStyles } from "../shared/presentation";
import { renderInlineRich } from "../shared/rich-text";
import { Container, SectionHead } from "../shared/section-primitives";
import type { SectionComponentProps } from "../types";
import type { MagazineLayoutV1, MagazineCard } from "./schema";

/**
 * Phase E (Batch 3 halfway) — head-only migration. The 1-hero +
 * N-secondary asymmetric grid, the hero card's larger title scale, the
 * per-card category labels, and h3/h4 hierarchy by role all stay bespoke.
 */

function CardCell({ card, isHero }: { card: MagazineCard; isHero?: boolean }) {
  const inner = (
    <>
      {card.imageUrl ? (
        <div className="site-mag__media">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={card.imageUrl}
            alt={card.imageAlt ?? ""}
            aria-hidden={card.imageAlt ? undefined : true}
            loading="lazy"
          />
        </div>
      ) : null}
      <div className="site-mag__copy">
        {card.category ? <span className="site-mag__category">{card.category}</span> : null}
        {isHero ? (
          <h3 className="site-mag__title site-mag__title--hero">{card.title}</h3>
        ) : (
          <h4 className="site-mag__title">{card.title}</h4>
        )}
        {card.excerpt ? <p className="site-mag__excerpt">{card.excerpt}</p> : null}
      </div>
    </>
  );
  return (
    <article className={isHero ? "site-mag__card site-mag__card--hero" : "site-mag__card"}>
      {card.href ? <a href={card.href}>{inner}</a> : inner}
    </article>
  );
}

export function MagazineLayoutComponent({ props }: SectionComponentProps<MagazineLayoutV1>) {
  const { eyebrow, headline, hero, secondary, presentation } = props;
  return (
    <section
      className="site-mag"
      data-secondary-count={String(secondary.length)}
      {...presentationDataAttrs(presentation)}
      style={presentationInlineStyles(presentation)}
    >
      <Container width="standard">
        {(eyebrow || headline) && (
          <SectionHead
            align="center"
            eyebrow={eyebrow}
            headline={headline ? renderInlineRich(headline) : undefined}
          />
        )}
        <div className="site-mag__grid">
          <CardCell card={hero} isHero />
          {secondary.map((c, i) => (
            <CardCell key={`${c.title}-${i}`} card={c} />
          ))}
        </div>
      </Container>
    </section>
  );
}
