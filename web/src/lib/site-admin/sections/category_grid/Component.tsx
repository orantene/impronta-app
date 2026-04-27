import { presentationDataAttrs, presentationInlineStyles } from "../shared/presentation";
import { renderInlineRich } from "../shared/rich-text";
import { Container, Cta, SectionHead } from "../shared/section-primitives";
import type { SectionComponentProps } from "../types";
import type { CategoryGridV1 } from "./schema";

/**
 * Server-rendered category / service grid. Three variants selected via a
 * data attribute so storefront CSS owns the layout rules. Icons resolve
 * through CSS (content: ...) or are replaced by imagery when `imageUrl`
 * is set — tile content is the same shape in either case.
 *
 * Phase E (Batch 2) — adopts Container + SectionHead + Cta primitives.
 * Distinctive interior preserved: the variant-driven tile grid + icon /
 * image / overlay layering + columnsDesktop CSS var.
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
        ...presentationInlineStyles(presentation),
      }}
    >
      <Container width="standard">
        <SectionHead
          align="center"
          eyebrow={eyebrow}
          headline={headline ? renderInlineRich(headline) : undefined}
          intro={copy}
        />
        {footerCta ? (
          <div className="site-category-grid__head-cta">
            <Cta href={footerCta.href} variant="secondary">
              {footerCta.label}
            </Cta>
          </div>
        ) : null}
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
      </Container>
    </section>
  );
}
