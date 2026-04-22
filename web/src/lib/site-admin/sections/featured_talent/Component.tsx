import { presentationDataAttrs } from "../shared/presentation";
import { renderInlineRich } from "../shared/rich-text";
import type { SectionComponentProps } from "../types";
import type { FeaturedTalentV1 } from "./schema";

/**
 * Renders a lightweight configuration preview today — the actual card grid
 * pulls from the live directory RPC which has tenant-scoped fetching
 * already wired on the homepage fallback path. When this section is
 * published into a CMS slot, the public renderer emits the section shell
 * + headline + CTA; a follow-up wires the live card fetch (same RPC that
 * feeds /directory) and slots the cards inside this container.
 */
export function FeaturedTalentComponent({
  props,
}: SectionComponentProps<FeaturedTalentV1>) {
  const {
    eyebrow,
    headline,
    copy,
    sourceMode,
    variant,
    columnsDesktop,
    footerCta,
    presentation,
  } = props;
  return (
    <section
      className="site-featured-talent"
      data-variant={variant}
      data-source-mode={sourceMode}
      {...presentationDataAttrs(presentation)}
      style={{ ["--ft-cols" as string]: String(columnsDesktop) }}
    >
      <div className="site-featured-talent__inner">
        {(eyebrow || headline || copy || footerCta) && (
          <header className="site-featured-talent__head">
            <div className="site-featured-talent__head-text">
              {eyebrow ? <span className="site-eyebrow">{eyebrow}</span> : null}
              {headline ? (
                <h2 className="site-featured-talent__headline">
                  {renderInlineRich(headline)}
                </h2>
              ) : null}
              {copy ? (
                <p className="site-featured-talent__copy">{copy}</p>
              ) : null}
            </div>
            {footerCta ? (
              <a
                href={footerCta.href}
                className="site-btn site-btn--outline site-btn--sm site-featured-talent__cta"
              >
                {footerCta.label}
              </a>
            ) : null}
          </header>
        )}
        {/* Placeholder grid — the live directory fetch will hydrate this
         * container in a follow-up. Kept visible so admins can preview
         * variant + column density without live data. */}
        <div className="site-featured-talent__placeholder" data-source={sourceMode}>
          <p className="site-featured-talent__placeholder-note">
            Talent cards render here in the active directory card family. Source mode: <strong>{sourceMode}</strong>.
          </p>
        </div>
      </div>
    </section>
  );
}
