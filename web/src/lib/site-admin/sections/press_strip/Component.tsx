import { presentationDataAttrs, presentationInlineStyles } from "../shared/presentation";
import type { SectionComponentProps } from "../types";
import type { PressStripV1 } from "./schema";

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
      <div className="site-press-strip__inner">
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
      </div>
    </section>
  );
}
