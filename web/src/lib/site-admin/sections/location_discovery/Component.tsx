import { presentationDataAttrs } from "../shared/presentation";
import { Container, SectionHead, Cta } from "../shared/section-primitives";
import { prefixPublicHref } from "@/lib/saas/public-hrefs";
import type { SectionComponentProps } from "../types";
import type { LocationDiscoveryV1 } from "./schema";
import { fetchTenantRosterCities } from "./fetch";

type Loc = {
  key: string;
  label: string;
  region?: string | null;
  href: string;
  count?: number;
};

export async function LocationDiscoveryComponent({
  props,
  tenantId,
  locale,
  publicPathPrefix = "",
}: SectionComponentProps<LocationDiscoveryV1>) {
  const {
    eyebrow,
    headline,
    subheadline,
    source,
    items,
    maxItems,
    showCount,
    ctaLabel,
    ctaHref,
    layout,
    emptyStateText,
    presentation,
  } = props;

  const pfx = (h: string) => prefixPublicHref(h, publicPathPrefix);

  let locs: Loc[] = [];
  if (source === "roster_cities") {
    const derived = await fetchTenantRosterCities({
      tenantId,
      maxItems: maxItems ?? 8,
      locale,
    });
    // No directory location query-param is invented — link to base
    // directory; operator can switch to manual items for precise links.
    locs = derived.map((d) => ({
      key: d.locationId,
      label: d.label,
      region: d.region,
      href: pfx("/directory"),
      count: d.count,
    }));
  } else {
    // manual (and service_areas → safe manual interim, documented).
    locs = (items ?? []).slice(0, maxItems ?? 8).map((it, i) => ({
      key: `${it.label}-${i}`,
      label: it.label,
      region: it.region,
      href: it.href ? pfx(it.href) : pfx("/directory"),
      count: it.count,
    }));
  }

  return (
    <section
      className="site-locdisc"
      data-ld-layout={layout ?? "grid"}
      {...presentationDataAttrs(presentation)}
    >
      <Container width="standard">
        <div className="site-locdisc__head">
          <SectionHead
            eyebrow={eyebrow}
            headline={headline}
            intro={subheadline}
          />
          {ctaLabel && ctaHref ? (
            <Cta href={pfx(ctaHref)} variant="text" size="sm">
              {ctaLabel}
            </Cta>
          ) : null}
        </div>

        {locs.length === 0 ? (
          <p className="site-locdisc__empty" role="status">
            {emptyStateText && emptyStateText.trim().length > 0
              ? emptyStateText
              : "No locations to show yet."}
          </p>
        ) : (
          <div className="site-locdisc__grid">
            {locs.map((l) => (
              <a key={l.key} href={l.href} className="site-locdisc__card">
                <span className="site-locdisc__label">{l.label}</span>
                {l.region ? (
                  <span className="site-locdisc__region">{l.region}</span>
                ) : null}
                {showCount && typeof l.count === "number" ? (
                  <span className="site-locdisc__count">
                    {l.count} talent
                  </span>
                ) : null}
              </a>
            ))}
          </div>
        )}
      </Container>
    </section>
  );
}
