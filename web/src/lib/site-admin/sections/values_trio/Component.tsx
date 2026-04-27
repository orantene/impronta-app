import { presentationDataAttrs, presentationInlineStyles } from "../shared/presentation";
import { renderInlineRich } from "../shared/rich-text";
import { Container, SectionHead } from "../shared/section-primitives";
import type { SectionComponentProps } from "../types";
import type { ValuesTrioV1 } from "./schema";

function numberFor(i: number, style: ValuesTrioV1["numberStyle"]): string {
  if (style === "none") return "";
  if (style === "roman") return ["I", "II", "III", "IV", "V"][i] ?? String(i + 1);
  return String(i + 1).padStart(2, "0");
}

/**
 * Phase E (Batch 1) — uses Container + SectionHead. Distinctive interior:
 * the numbered card rhythm (Arabic / Roman / none) + the values-trio
 * three-card grid stay untouched.
 */
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
      style={presentationInlineStyles(presentation)}
    >
      <Container width="standard">
        <SectionHead
          align="center"
          eyebrow={eyebrow}
          headline={headline ? renderInlineRich(headline) : undefined}
        />
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
      </Container>
    </section>
  );
}
