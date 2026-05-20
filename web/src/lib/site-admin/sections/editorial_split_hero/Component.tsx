import { presentationDataAttrs } from "../shared/presentation";
import { nodePresentationInlineStyle } from "../shared/node-presentation";
import { Container, Cta, MediaFrame } from "../shared/section-primitives";
import { renderInlineRich } from "../shared/rich-text";
import { SmartImage } from "@/components/ui/smart-image";
import { resolveLinkLike } from "@/lib/site-admin/links/resolve-link-ref";
import type { SectionComponentProps } from "../types";
import type { EditorialSplitHeroV1 } from "./schema";

function eyebrowSize(size: "sm" | "md" | "lg" | "xl"): string {
  return {
    sm: "0.68rem",
    md: "0.75rem",
    lg: "0.85rem",
    xl: "0.95rem",
  }[size];
}

function headingSize(size: "sm" | "md" | "lg" | "xl"): string {
  return {
    sm: "clamp(2.2rem, 4.8vw, 4.8rem)",
    md: "clamp(2.8rem, 6vw, 6.2rem)",
    lg: "clamp(3.3rem, 7vw, 7.4rem)",
    xl: "clamp(3.8rem, 8vw, 8.6rem)",
  }[size];
}

function paragraphSize(size: "sm" | "md" | "lg" | "xl"): string {
  return {
    sm: "0.95rem",
    md: "1.08rem",
    lg: "1.22rem",
    xl: "1.38rem",
  }[size];
}

export function EditorialSplitHeroComponent({
  props,
  tenantId,
  publicPathPrefix = "",
  builderNodeBindings,
}: SectionComponentProps<EditorialSplitHeroV1>) {
  const {
    eyebrow,
    headline,
    highlight,
    body,
    primaryCta,
    secondaryCta,
    discoveryForm,
    mediaMode,
    mediaUrl,
    mediaAlt,
    mediaRatio,
    mediaStyle,
    mediaStackUrls,
    mediaStackCaptions,
    overlayColor,
    overlayOpacity,
    overlayStrength,
    mediaSide,
    mobileOrder,
    nodePresentation,
    presentation,
  } = props;
  const nodeIdsByRole = builderNodeBindings?.nodeIdsByRole;

  // 6C — resolve CTA LinkRefs through the single source of truth
  // (robust whether props arrive as a LinkRef object or legacy string).
  const linkCtx = { pathPrefix: publicPathPrefix ?? "", tenantId };
  const primaryLink = primaryCta
    ? resolveLinkLike(primaryCta.href, linkCtx)
    : null;
  const secondaryLink = secondaryCta
    ? resolveLinkLike(secondaryCta.href, linkCtx)
    : null;
  const resolvedDiscoveryForm =
    discoveryForm?.enabled === true ? discoveryForm : null;
  const discoveryAction = resolvedDiscoveryForm
    ? resolveLinkLike(resolvedDiscoveryForm.actionHref ?? "/directory", linkCtx)
        .href
    : "/directory";
  const categoryOptions =
    resolvedDiscoveryForm?.categories &&
    resolvedDiscoveryForm.categories.length > 0
      ? resolvedDiscoveryForm.categories
      : [
          { label: "Models", value: "models" },
          { label: "Hosts", value: "hosts" },
          { label: "Performers", value: "performers" },
          { label: "Creators", value: "creators" },
        ];
  const marketOptions =
    resolvedDiscoveryForm?.markets && resolvedDiscoveryForm.markets.length > 0
      ? resolvedDiscoveryForm.markets
      : [
          { label: "Riviera Maya", value: "riviera-maya" },
          { label: "Mexico City", value: "mexico-city" },
          { label: "Buenos Aires", value: "buenos-aires" },
        ];
  const selectedCategoryLabel = categoryOptions.find(
    (option) => option.disabled !== true,
  )?.label;
  const selectedMarketLabel = marketOptions.find(
    (option) => option.disabled !== true,
  )?.label;
  // Only static media renders today; selected/dynamic are documented
  // follow-ons (would couple to the cache-trimmed featured DTO).
  const resolvedMedia = mediaMode === "static" ? (mediaUrl ?? null) : null;
  const stackUrls = (mediaStackUrls ?? []).filter(Boolean).slice(0, 3);
  const useStack = mediaStyle === "card-stack" && stackUrls.length > 0;

  return (
    <section
      className="site-esh"
      data-esh-media-side={mediaSide ?? "right"}
      data-esh-mobile={mobileOrder ?? "text-first"}
      {...presentationDataAttrs(presentation)}
    >
      <Container width="standard">
        <div className="site-esh__grid">
          <div className="site-esh__copy">
            {eyebrow ? (
              <p
                className="site-esh__eyebrow"
                data-builder-node-id={nodeIdsByRole?.subheadline}
                style={nodePresentationInlineStyle(
                  nodePresentation?.subheadline,
                  eyebrowSize,
                )}
              >
                {renderInlineRich(eyebrow)}
              </p>
            ) : null}
            {headline ? (
              <h2
                className="site-esh__headline"
                data-builder-node-id={nodeIdsByRole?.headline}
                style={nodePresentationInlineStyle(
                  nodePresentation?.headline,
                  headingSize,
                )}
              >
                {renderInlineRich(headline)}
                {highlight ? (
                  <span className="site-esh__hl"> {renderInlineRich(highlight)}</span>
                ) : null}
              </h2>
            ) : null}
            {body ? (
              <p
                className="site-esh__body"
                data-builder-node-id={nodeIdsByRole?.copy}
                style={nodePresentationInlineStyle(
                  nodePresentation?.copy,
                  paragraphSize,
                )}
              >
                {renderInlineRich(body)}
              </p>
            ) : null}
            {resolvedDiscoveryForm ? (
              <div className="site-esh__discovery-wrap">
                <div className="site-esh__discovery-label">
                  Find talent for your event, production or brand
                </div>
                <form className="site-esh__discovery" action={discoveryAction}>
                  <label className="site-esh__field">
                    <span>
                      {resolvedDiscoveryForm.categoryLabel ?? "Talent type"}
                    </span>
                    <select
                      name="type"
                      defaultValue={categoryOptions[0]?.value ?? ""}
                    >
                      {categoryOptions.map((option) => (
                        <option
                          key={`${option.label}-${option.value ?? option.label}`}
                          value={option.value ?? option.label}
                          disabled={option.disabled === true}
                        >
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="site-esh__field">
                    <span>{resolvedDiscoveryForm.marketLabel ?? "Market"}</span>
                    <select
                      name="market"
                      defaultValue={marketOptions[0]?.value ?? ""}
                    >
                      {marketOptions.map((option) => (
                        <option
                          key={`${option.label}-${option.value ?? option.label}`}
                          value={option.value ?? option.label}
                          disabled={option.disabled === true}
                        >
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button className="site-esh__submit" type="submit">
                    <svg
                      aria-hidden="true"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                    >
                      <circle cx="11" cy="11" r="7" />
                      <path d="m21 21-4.3-4.3" />
                    </svg>
                    <span>{resolvedDiscoveryForm.submitLabel ?? "Explore"}</span>
                  </button>
                </form>
                {selectedCategoryLabel || selectedMarketLabel ? (
                  <p className="site-esh__discovery-note" aria-live="polite">
                    Showing: {selectedCategoryLabel ?? "All talent"}
                    {" · "}
                    {selectedMarketLabel ?? "All markets"}
                  </p>
                ) : null}
              </div>
            ) : null}
            {primaryCta || secondaryCta ? (
              <div className="site-esh__ctas">
                {primaryCta ? (
                  <Cta
                    href={primaryLink?.href ?? "#"}
                    newTab={primaryLink?.openInNew}
                    variant="primary"
                    size="lg"
                    builderNodeId={nodeIdsByRole?.primaryCta}
                  >
                    {renderInlineRich(primaryCta.label)}
                  </Cta>
                ) : null}
                {secondaryCta ? (
                  <Cta
                    href={secondaryLink?.href ?? "#"}
                    newTab={secondaryLink?.openInNew}
                    variant="text"
                    size="lg"
                    builderNodeId={nodeIdsByRole?.secondaryCta}
                  >
                    {renderInlineRich(secondaryCta.label)}
                  </Cta>
                ) : null}
              </div>
            ) : null}
          </div>
          <div className="site-esh__media" data-esh-media-style={useStack ? "card-stack" : "single"}>
            {useStack ? (
              <div className="site-esh__stack">
                {stackUrls[1] ? (
                  <div className="site-esh__stack-card site-esh__stack-card--b">
                    <SmartImage
                      src={stackUrls[1]}
                      alt=""
                      fill
                      sizes="(max-width: 768px) 42vw, 24rem"
                      priority
                    />
                    <span className="site-esh__stack-scrim" aria-hidden="true" />
                  </div>
                ) : null}
                {stackUrls[2] ? (
                  <div className="site-esh__stack-card site-esh__stack-card--c">
                    <SmartImage
                      src={stackUrls[2]}
                      alt=""
                      fill
                      sizes="(max-width: 768px) 40vw, 23rem"
                      priority
                    />
                    <span className="site-esh__stack-scrim" aria-hidden="true" />
                  </div>
                ) : null}
                <div className="site-esh__stack-card site-esh__stack-card--main">
                  <span className="site-esh__stack-tab">Selected</span>
                  <SmartImage
                    src={stackUrls[0]}
                    alt={mediaAlt ?? headline ?? ""}
                    fill
                    sizes="(max-width: 768px) 58vw, 31rem"
                    priority
                  />
                  <span className="site-esh__stack-scrim" aria-hidden="true" />
                  <span className="site-esh__stack-sheen" aria-hidden="true" />
                  {mediaStackCaptions?.[0] ? (
                    <div className="site-esh__stack-cap">
                      <b>{mediaStackCaptions[0].name}</b>
                      {mediaStackCaptions[0].sub ? (
                        <span>{mediaStackCaptions[0].sub}</span>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              </div>
            ) : (
              <MediaFrame
                src={resolvedMedia}
                alt={mediaAlt ?? headline ?? ""}
                ratio={mediaRatio ?? "4/3"}
                overlayColor={overlayColor}
                overlayOpacity={overlayOpacity}
                overlayStrength={overlayStrength ?? "none"}
                fallback={mediaAlt ?? "Media"}
              />
            )}
          </div>
        </div>
      </Container>
    </section>
  );
}
