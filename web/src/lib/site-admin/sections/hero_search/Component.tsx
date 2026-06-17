import { presentationDataAttrs } from "../shared/presentation";
import { nodePresentationInlineStyle } from "../shared/node-presentation";
import {
  Container,
  SectionHead,
  Cta,
  SearchInput,
  ChipList,
  StatLine,
} from "../shared/section-primitives";
import { renderInlineRich } from "../shared/rich-text";
import { resolveLinkLike } from "@/lib/site-admin/links/resolve-link-ref";
import type { SectionComponentProps } from "../types";
import type { HeroSearchV1 } from "./schema";
import { fetchTenantTalentCount } from "./fetch";

function eyebrowSize(size: "sm" | "md" | "lg" | "xl" | "display"): string {
  return {
    sm: "0.68rem",
    md: "0.75rem",
    lg: "0.85rem",
    xl: "0.95rem",
    display: "1.1rem",
  }[size];
}

function headingSize(size: "sm" | "md" | "lg" | "xl" | "display"): string {
  return {
    sm: "clamp(2.25rem, 5vw, 4.5rem)",
    md: "clamp(2.8rem, 7vw, 6.4rem)",
    lg: "clamp(3.3rem, 8.5vw, 7.8rem)",
    xl: "clamp(3.8rem, 10vw, 9.5rem)",
    display: "clamp(3.5rem, 6vw, 6rem)",
  }[size];
}

function paragraphSize(size: "sm" | "md" | "lg" | "xl" | "display"): string {
  return {
    sm: "0.95rem",
    md: "1.08rem",
    lg: "1.22rem",
    xl: "1.38rem",
    display: "clamp(2rem, 4vw, 4.5rem)",
  }[size];
}

export async function HeroSearchComponent({
  props,
  tenantId,
  publicPathPrefix = "",
  builderNodeBindings,
}: SectionComponentProps<HeroSearchV1>) {
  const {
    eyebrow,
    headline,
    highlight,
    subheadline,
    search,
    primaryCta,
    secondaryCta,
    chipsSource,
    chips,
    statSource,
    statItems,
    statCountLabel,
    layout,
    nodePresentation,
    presentation,
  } = props;
  const nodeIdsByRole = builderNodeBindings?.nodeIdsByRole;

  // 6C — single-source link resolution (LinkRef object or legacy
  // string; auth routes stay root, tenant pages prefix-aware).
  const linkCtx = { pathPrefix: publicPathPrefix ?? "", tenantId };
  const primaryLink = primaryCta
    ? resolveLinkLike(primaryCta.href, linkCtx)
    : null;
  const secondaryLink = secondaryCta
    ? resolveLinkLike(secondaryCta.href, linkCtx)
    : null;

  // Chips: manual is the safe shipped path; roster-derived sources are a
  // documented follow-on (fall back to manual list meanwhile).
  const chipItems =
    chipsSource === "manual"
      ? (chips ?? []).map((c) => ({
          label: c.label,
          href: c.href ? resolveLinkLike(c.href, linkCtx).href : undefined,
          dot: true,
        }))
      : (chips ?? []).map((c) => ({
          label: c.label,
          href: c.href ? resolveLinkLike(c.href, linkCtx).href : undefined,
          dot: true,
        }));

  // Stat line: manual items, or a single tenant-scoped derived count.
  let statLineItems = statItems ?? [];
  if (statSource === "tenant_talent_count") {
    const count = await fetchTenantTalentCount(tenantId);
    if (count > 0) {
      statLineItems = [
        {
          value: `${count}+`,
          label: statCountLabel ?? "represented talent",
        },
      ];
    } else {
      statLineItems = [];
    }
  }

  const searchEnabled = search?.enabled !== false;

  return (
    <section
      className="site-hero-search"
      data-hs-layout={layout ?? "centered"}
      {...presentationDataAttrs(presentation)}
    >
      <Container width="standard">
        <div className="site-hero-search__inner">
          <SectionHead
            eyebrow={eyebrow ? renderInlineRich(eyebrow) : undefined}
            headline={
              headline ? (
                <>
                  {renderInlineRich(headline)}
                  {highlight ? (
                    <span className="site-hero-search__hl">
                      {" "}
                      {renderInlineRich(highlight)}
                    </span>
                  ) : null}
                </>
              ) : undefined
            }
            intro={subheadline ? renderInlineRich(subheadline) : undefined}
            eyebrowBuilderNodeId={nodeIdsByRole?.subheadline}
            headlineBuilderNodeId={nodeIdsByRole?.headline}
            introBuilderNodeId={nodeIdsByRole?.copy}
            eyebrowStyle={nodePresentationInlineStyle(
              nodePresentation?.subheadline,
              eyebrowSize,
            )}
            headlineStyle={nodePresentationInlineStyle(
              nodePresentation?.headline,
              headingSize,
            )}
            introStyle={nodePresentationInlineStyle(
              nodePresentation?.copy,
              paragraphSize,
            )}
          />

          {searchEnabled ? (
            <div className="site-hero-search__searchwrap">
              <SearchInput
                mode={search?.mode ?? "directory-query"}
                action={
                  resolveLinkLike(search?.actionHref ?? "/directory", linkCtx)
                    .href
                }
                placeholder={
                  search?.placeholder ?? "Search talent by role, location or fit…"
                }
                submitLabel={search?.submitLabel ?? "Search"}
                size="lg"
                fullWidthMobile
              />
            </div>
          ) : null}

          {primaryCta || secondaryCta ? (
            <div className="site-hero-search__ctas">
              {primaryCta && primaryLink ? (
                <Cta
                  href={primaryLink.href}
                  newTab={primaryLink.openInNew}
                  variant="primary"
                  size="lg"
                  builderNodeId={nodeIdsByRole?.primaryCta}
                >
                  {renderInlineRich(primaryCta.label)}
                </Cta>
              ) : null}
              {secondaryCta && secondaryLink ? (
                <Cta
                  href={secondaryLink.href}
                  newTab={secondaryLink.openInNew}
                  variant="text"
                  size="lg"
                  builderNodeId={nodeIdsByRole?.secondaryCta}
                >
                  {renderInlineRich(secondaryCta.label)}
                </Cta>
              ) : null}
            </div>
          ) : null}

          {chipItems.length > 0 ? (
            <div className="site-hero-search__chips">
              <ChipList chips={chipItems} layout="wrap" size="md" />
            </div>
          ) : null}

          {statLineItems.length > 0 ? (
            <div className="site-hero-search__stat">
              <StatLine
                items={statLineItems}
                separator="dot"
                align="center"
                tone="muted"
              />
            </div>
          ) : null}
        </div>
      </Container>
    </section>
  );
}
