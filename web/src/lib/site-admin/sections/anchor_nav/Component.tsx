import { presentationDataAttrs, presentationInlineStyles } from "../shared/presentation";
import type { SectionComponentProps } from "../types";
import type { AnchorNavV1 } from "./schema";
import { resolveLinkLike } from "@/lib/site-admin/links/resolve-link-ref";

/**
 * Phase E (Batch 1) — intentionally not wrapped in `Container` /
 * `SectionHead`. Anchor nav's design is a sticky in-page link rail
 * (horizontal on desktop, optionally sticky); a standard centered
 * container would chop the rail. The section already has no `__inner`
 * / `__head` wrappers, so there is no per-section CSS sprawl to
 * collapse. Touched only to record the judgment in code.
 */

export function AnchorNavComponent({
  props,
  tenantId,
  publicPathPrefix = "",
}: SectionComponentProps<AnchorNavV1>) {
  const { links, variant, sticky, align, presentation } = props;
  // 6C — single-source resolution. Anchors stay `#id`; tenant paths
  // prefix-aware; auth routes resolve ROOT (Finding-B-safe).
  const linkCtx = { pathPrefix: publicPathPrefix ?? "", tenantId };
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
        {links.map((l, i) => {
          const L = resolveLinkLike(l.href, linkCtx);
          return (
            <li key={`${l.label}-${i}`}>
              <a
                className="site-anchor-nav__link"
                href={L.href}
                target={L.openInNew ? "_blank" : undefined}
                rel={L.openInNew ? "noopener noreferrer" : undefined}
              >
                {l.label}
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
