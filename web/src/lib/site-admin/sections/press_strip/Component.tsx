import { presentationDataAttrs, presentationInlineStyles } from "../shared/presentation";
import { Container } from "../shared/section-primitives";
import type { SectionComponentProps } from "../types";
import type { PressStripV1 } from "./schema";

/**
 * Phase E (Batch 1) — uses Container primitive. Press strip has no
 * eyebrow + headline pair (it's a single inline row of names/logos)
 * so SectionHead doesn't apply; only the wrapping container width
 * collapses to the shared primitive.
 */
export function PressStripComponent({
  props,
}: SectionComponentProps<PressStripV1>) {
  const { eyebrow, items, variant, presentation } = props;
  return (
    <section
      className="site-press-strip"
      data-variant={variant}
      {...presentationDataAttrs(presentation)}
      style={presentationInlineStyles(presentation)}
    >
      <Container width="standard">
        <div className="site-press-strip__row">
          {eyebrow ? (
            <span className="site-press-strip__eyebrow">{eyebrow}</span>
          ) : null}
          {items.map((item, i) =>
            item.logoUrl && (variant === "logo-row" || variant === "mixed") ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                key={`${item.name}-${i}`}
                src={item.logoUrl}
                alt={item.name}
                className="site-press-strip__logo"
              />
            ) : (
              <span key={`${item.name}-${i}`} className="site-press-strip__name">
                {item.name}
              </span>
            ),
          )}
        </div>
      </Container>
    </section>
  );
}
