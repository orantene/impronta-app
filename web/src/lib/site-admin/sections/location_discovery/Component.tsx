import { presentationDataAttrs } from "../shared/presentation";
import { Container, SectionHead, Cta } from "../shared/section-primitives";
import { resolveLinkLike } from "@/lib/site-admin/links/resolve-link-ref";
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

  // 6C — single-source link resolution (handles LinkRef object or
  // legacy string; auth routes stay root, tenant pages prefix-aware).
  const linkCtx = { pathPrefix: publicPathPrefix ?? "", tenantId };
  const resolve = (h: typeof ctaHref | string) =>
    resolveLinkLike(h ?? "/directory", linkCtx).href;

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
      href: resolve("/directory"),
      count: d.count,
    }));
  } else {
    // manual (and service_areas → safe manual interim, documented).
    locs = (items ?? []).slice(0, maxItems ?? 8).map((it, i) => ({
      key: `${it.label}-${i}`,
      label: it.label,
      region: it.region,
      href: resolve(it.href),
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
            <Cta href={resolve(ctaHref)} variant="text" size="sm">
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
