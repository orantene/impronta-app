import { presentationDataAttrs } from "../shared/presentation";
import { renderInlineRich } from "../shared/rich-text";
import type { SectionComponentProps } from "../types";
import type { TrustStripV1 } from "./schema";

/**
 * Server-rendered trust strip. Pure CSS — no client JS.
 *
 * The three variants share a single layout skeleton and diverge on the
 * per-item render:
 *   - icon-row    → serif italic numerals ("01" / "02" / "03" / "04")
 *   - metrics-row → large stat + caption
 *   - logo-row    → uniform italic serif names (for press/client strips)
 *
 * Colors and radii pull from token CSS custom properties defined by the
 * token resolver (M7) so changing the theme preset repaints this section
 * without any code change.
 */
export function TrustStripComponent({ props }: SectionComponentProps<TrustStripV1>) {
  const { eyebrow, headline, items, variant, background, density, presentation } = props;
  const bg = background ?? "neutral";
  const den = density ?? undefined;
  return (
    <section
      className="site-trust-strip"
      data-variant={variant}
      data-background={bg}
      data-density={den}
      {...presentationDataAttrs(presentation)}
    >
      <div className="site-trust-strip__inner">
        {(eyebrow || headline) && (
          <header className="site-trust-strip__head">
            {eyebrow ? <span className="site-eyebrow">{eyebrow}</span> : null}
            {headline ? (
              <h2 className="site-trust-strip__headline">
                {renderInlineRich(headline)}
              </h2>
            ) : null}
          </header>
        )}
        <div className="site-trust-strip__grid" data-count={items.length}>
          {items.map((item, i) => (
            <div key={`${item.label}-${i}`} className="site-trust-strip__item">
              {variant === "icon-row" ? (
                <span className="site-trust-strip__numeral" aria-hidden>
                  {String(i + 1).padStart(2, "0")}
                </span>
              ) : null}
              {variant === "metrics-row" && item.stat ? (
                <span className="site-trust-strip__stat">{item.stat}</span>
              ) : null}
              <h3 className="site-trust-strip__label">{item.label}</h3>
              {item.detail ? (
                <p className="site-trust-strip__detail">{item.detail}</p>
              ) : null}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
