import { presentationDataAttrs, presentationInlineStyles } from "../shared/presentation";
import { renderInlineRich } from "../shared/rich-text";
import type { SectionComponentProps } from "../types";
import type { FeaturedTalentV1 } from "./schema";
import { fetchFeaturedTalentForSection } from "./fetch";
import { FeaturedTalentCard } from "./FeaturedTalentCard";

import "./featured-talent.css";

/**
 * Server-rendered featured talent section.
 *
 * Reads the composed section config, fetches tenant-scoped talent cards per
 * `sourceMode`, and renders them in the same visual family as /directory
 * cards (via the shared `talent-card` class + `data-card-*` hooks).
 *
 * Empty behaviour:
 *   - No tenant id, Supabase misconfigured, empty roster, or strictly-empty
 *     manual-pick/filter → render the header (eyebrow / headline / copy /
 *     CTA) and a soft empty note so the section is still admin-visible.
 *     Never throws.
 */
export async function FeaturedTalentComponent({
  props,
  tenantId,
  locale,
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

  const cards = await fetchFeaturedTalentForSection(tenantId, props, locale);
  const hasCards = cards.length > 0;
  const columns = Math.max(2, Math.min(4, columnsDesktop ?? 3));

  return (
    <section
      className="site-featured-talent"
      data-variant={variant}
      data-source-mode={sourceMode}
      data-card-count={cards.length}
      {...presentationDataAttrs(presentation)}
      style={{
        ["--ft-cols" as string]: String(columns),
        ...presentationInlineStyles(presentation),
      }}
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

        {hasCards ? (
          <div
            className="site-featured-talent__grid"
            data-grid-variant={variant}
          >
            {cards.map((card, i) => (
              <FeaturedTalentCard
                key={card.id}
                card={card}
                priority={i < columns}
              />
            ))}
          </div>
        ) : (
          <div
            className="site-featured-talent__empty"
            data-source={sourceMode}
            role="status"
          >
            <p className="site-featured-talent__empty-note">
              {emptyCopy(sourceMode, props)}
            </p>
          </div>
        )}
      </div>
    </section>
  );
}

function emptyCopy(
  mode: FeaturedTalentV1["sourceMode"],
  props: FeaturedTalentV1,
): string {
  switch (mode) {
    case "manual_pick":
      if (!props.manualProfileCodes?.length) {
        return "Pick specific professionals to feature from the admin editor.";
      }
      return "The selected professionals are not currently published for this site.";
    case "auto_by_service":
      if (!props.filterServiceSlug) {
        return "Pick a service category in the section editor to populate this block.";
      }
      return `No published professionals found for service "${props.filterServiceSlug}".`;
    case "auto_by_destination":
      if (!props.filterDestinationSlug) {
        return "Pick a destination slug in the section editor to populate this block.";
      }
      return `No published professionals available in "${props.filterDestinationSlug}" right now.`;
    case "auto_featured_flag":
      return "No featured professionals yet — mark talents as featured from the admin roster to populate this section.";
    case "auto_recent":
      return "No recent professionals available for this site.";
    default:
      return "No professionals available for this section.";
  }
}
