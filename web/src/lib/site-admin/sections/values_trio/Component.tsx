import { presentationDataAttrs } from "../shared/presentation";
import { renderInlineRich } from "../shared/rich-text";
import type { SectionComponentProps } from "../types";
import type { ValuesTrioV1 } from "./schema";

function numberFor(i: number, style: ValuesTrioV1["numberStyle"]): string {
  if (style === "none") return "";
  if (style === "roman") return ["I", "II", "III", "IV", "V"][i] ?? String(i + 1);
  return String(i + 1).padStart(2, "0");
}

export function ValuesTrioComponent({
  props,
}: SectionComponentProps<ValuesTrioV1>) {
  const { eyebrow, headline, items, variant, numberStyle, presentation } = props;
  return (
    <section
      className="site-values-trio"
      data-variant={variant}
      data-number-style={numberStyle}
      {...presentationDataAttrs(presentation)}
    >
      <div className="site-values-trio__inner">
        {(eyebrow || headline) && (
          <header className="site-values-trio__head">
            {eyebrow ? <span className="site-eyebrow">{eyebrow}</span> : null}
            {headline ? (
              <h2 className="site-values-trio__headline">
                {renderInlineRich(headline)}
              </h2>
            ) : null}
          </header>
        )}
        <div className="site-values-trio__grid">
          {items.map((item, i) => (
            <article
              key={`${item.title}-${i}`}
              className="site-values-trio__card"
            >
              {numberStyle !== "none" ? (
                <span className="site-values-trio__numeral" aria-hidden>
                  {item.numberLabel || numberFor(i, numberStyle)}
                </span>
              ) : null}
              <h3 className="site-values-trio__title">{item.title}</h3>
              {item.detail ? (
                <p className="site-values-trio__detail">{item.detail}</p>
              ) : null}
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
