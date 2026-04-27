import {
  presentationDataAttrs,
  presentationInlineStyles,
} from "../shared/presentation";
import type { SectionComponentProps } from "../types";
import type { MarqueeV1 } from "./schema";

/**
 * Phase E (Batch 1) — intentionally not wrapped in `Container` /
 * `SectionHead`. Marquee's design IS full-bleed continuous motion;
 * the kinetic signature is the section. Wrapping it in a standard
 * 1200px container would chop the scroll and break the seamless
 * loop. The section already has no `__inner` / `__head` /
 * `__headline` wrappers, so there is no per-section CSS sprawl to
 * collapse. Touched only to record this judgment in code so a future
 * pass doesn't accidentally "unify" it into a generic shape.
 */

const SEP_CHAR: Record<MarqueeV1["separator"], string> = {
  dot: "·",
  slash: "/",
  diamond: "◆",
  none: "",
};

export function MarqueeComponent({
  props,
}: SectionComponentProps<MarqueeV1>) {
  const { items, speed, direction, separator, variant, presentation } = props;
  // Duplicate the list so the keyframe translate(0 → -50%) wraps seamlessly.
  const doubled = [...items, ...items];
  const sep = SEP_CHAR[separator];
  return (
    <section
      className="site-marquee"
      data-variant={variant}
      data-speed={speed}
      data-direction={direction}
      {...presentationDataAttrs(presentation)}
      style={presentationInlineStyles(presentation)}
    >
      <div className="site-marquee__track" aria-hidden="false">
        {doubled.map((item, i) => (
          <span key={i} className="site-marquee__item">
            {variant === "tags" ? (
              <span className="site-marquee__tag">{item.text}</span>
            ) : item.href ? (
              <a className="site-marquee__link" href={item.href}>
                {item.text}
              </a>
            ) : (
              <span>{item.text}</span>
            )}
            {sep ? (
              <span aria-hidden className="site-marquee__sep">
                {sep}
              </span>
            ) : null}
          </span>
        ))}
      </div>
    </section>
  );
}
