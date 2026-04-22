import { presentationDataAttrs } from "../shared/presentation";
import { renderInlineRich } from "../shared/rich-text";
import type { SectionComponentProps } from "../types";
import type { CategoryGridV1 } from "./schema";

/**
 * Server-rendered category / service grid. Three variants selected via a
 * data attribute so storefront CSS owns the layout rules. Icons resolve
 * through CSS (content: ...) or are replaced by imagery when `imageUrl`
 * is set — tile content is the same shape in either case.
 */
export function CategoryGridComponent({
  props,
}: SectionComponentProps<CategoryGridV1>) {
  const { eyebrow, headline, copy, items, variant, columnsDesktop, footerCta, presentation } =
    props;
  return (
    <section
      className="site-category-grid"
      data-variant={variant}
      {...presentationDataAttrs(presentation)}
      style={{
        // Expose desktop column count to CSS — `repeat(var(--cols), 1fr)`.
        ["--cat-grid-cols" as string]: String(columnsDesktop),
      }}
    >
      <div className="site-category-grid__inner">
        {(eyebrow || headline || copy || footerCta) && (
          <header className="site-category-grid__head">
            {eyebrow ? <span className="site-eyebrow">{eyebrow}</span> : null}
            {headline ? (
              <h2 className="site-category-grid__headline">
                {renderInlineRich(headline)}
              </h2>
            ) : null}
            {copy ? <p className="site-category-grid__copy">{copy}</p> : null}
            {footerCta ? (
              <a
                href={footerCta.href}
                className="site-btn site-btn--outline site-category-grid__cta"
              >
                {footerCta.label}
              </a>
            ) : null}
          </header>
        )}
        <div className="site-category-grid__grid">
          {items.map((item, i) => {
            const TileTag: "a" | "div" = item.href ? "a" : "div";
            return (
              <TileTag
                key={`${item.label}-${i}`}
                className="site-category-grid__tile"
                data-has-image={item.imageUrl ? "true" : undefined}
                href={item.href}
              >
                {item.imageUrl ? (
                  <>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      className="site-category-grid__img"
                      src={item.imageUrl}
                      alt=""
                      aria-hidden
                    />
                    <span
                      className="site-category-grid__overlay"
                      aria-hidden
                    />
                  </>
                ) : null}
                {item.iconKey ? (
                  <span
                    className="site-category-grid__icon"
                    data-icon-key={item.iconKey}
                    aria-hidden
                  />
                ) : null}
                <div className="site-category-grid__label">{item.label}</div>
                {item.tagline ? (
                  <div className="site-category-grid__tagline">
                    {item.tagline}
                  </div>
                ) : null}
              </TileTag>
            );
          })}
        </div>
      </div>
    </section>
  );
}
