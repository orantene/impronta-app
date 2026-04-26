import { presentationDataAttrs, presentationInlineStyles } from "../shared/presentation";
import type { SectionComponentProps } from "../types";
import type { AnchorNavV1 } from "./schema";

export function AnchorNavComponent({ props }: SectionComponentProps<AnchorNavV1>) {
  const { links, variant, sticky, align, presentation } = props;
  return (
    <nav
      className="site-anchor-nav"
      data-variant={variant}
      data-sticky={sticky ? "true" : "false"}
      data-align={align}
      aria-label="Page sections"
      {...presentationDataAttrs(presentation)}
      style={presentationInlineStyles(presentation)}
    >
      <ul className="site-anchor-nav__list">
        {links.map((l, i) => (
          <li key={`${l.label}-${i}`}>
            <a className="site-anchor-nav__link" href={l.href}>
              {l.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
