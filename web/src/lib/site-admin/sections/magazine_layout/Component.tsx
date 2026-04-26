import { presentationDataAttrs, presentationInlineStyles } from "../shared/presentation";
import { renderInlineRich } from "../shared/rich-text";
import type { SectionComponentProps } from "../types";
import type { MagazineLayoutV1, MagazineCard } from "./schema";

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
      <div className="site-mag__inner">
        {(eyebrow || headline) && (
          <header className="site-mag__head">
            {eyebrow ? <span className="site-eyebrow">{eyebrow}</span> : null}
            {headline ? (
              <h2 className="site-mag__headline">{renderInlineRich(headline)}</h2>
            ) : null}
          </header>
        )}
        <div className="site-mag__grid">
          <CardCell card={hero} isHero />
          {secondary.map((c, i) => (
            <CardCell key={`${c.title}-${i}`} card={c} />
          ))}
        </div>
      </div>
    </section>
  );
}
