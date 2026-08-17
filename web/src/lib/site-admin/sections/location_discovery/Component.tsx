import { presentationDataAttrs } from "../shared/presentation";
import { nodePresentationInlineStyle } from "../shared/node-presentation";
import { Container, SectionHead, Cta } from "../shared/section-primitives";
import { renderInlineRich } from "../shared/rich-text";
import { resolveLinkLike } from "@/lib/site-admin/links/resolve-link-ref";
import { pickLocale } from "@/lib/i18n/pick-locale";
import type { CSSProperties } from "react";
import type { SectionComponentProps } from "../types";
import type { LocationDiscoveryV1 } from "./schema";
import { fetchTenantRosterCities } from "./fetch";
import { LocationSection } from "@/components/home/location-section";
import { getRequestLocaleUrlSettings } from "@/i18n/tenant-url-locale";
import { getHomepageData } from "@/lib/home-data";
import { resolveGoogleMapsKeyForClient } from "@/lib/integrations/resolve";
import type { Locale } from "@/i18n/config";
import { createTranslator } from "@/i18n/messages";

type Loc = {
  key: string;
  label: string;
  region?: string | null;
  href: string;
  count?: number;
  featured?: boolean;
  status?: "active" | "coming_soon";
};

const MAP_PIN_POSITIONS = [
  { left: 31, top: 47 },
  { left: 46, top: 36 },
  { left: 62, top: 59 },
  { left: 73, top: 42 },
  { left: 21, top: 62 },
  { left: 54, top: 70 },
] as const;

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
    sm: "clamp(2rem, 4vw, 3.8rem)",
    md: "clamp(2.4rem, 5vw, 5rem)",
    lg: "clamp(3rem, 6vw, 6.2rem)",
    xl: "clamp(3.4rem, 7vw, 7.4rem)",
    display: "clamp(3.5rem, 6vw, 6rem)",
  }[size];
}

function paragraphSize(size: "sm" | "md" | "lg" | "xl" | "display"): string {
  return {
    sm: "0.95rem",
    md: "1.05rem",
    lg: "1.18rem",
    xl: "1.32rem",
    display: "clamp(2rem, 4vw, 4.5rem)",
  }[size];
}

function pinStyle(index: number): CSSProperties {
  const pos = MAP_PIN_POSITIONS[index % MAP_PIN_POSITIONS.length];
  return {
    left: `${pos.left}%`,
    top: `${pos.top}%`,
  };
}

function MarketMap({ locs, showCount }: { locs: Loc[]; showCount?: boolean }) {
  const featured = locs.find((l) => l.featured) ?? locs[0];
  const activeCount = locs.filter((l) => l.status !== "coming_soon").length;
  const comingSoonCount = locs.length - activeCount;
  const featuredIsComingSoon = featured.status === "coming_soon";

  return (
    <div className="site-locdisc__map-grid">
      <div className="site-locdisc__map-card" aria-label="Operating markets map">
        <svg
          className="site-locdisc__map-art"
          viewBox="0 0 900 520"
          role="img"
          aria-hidden="true"
          focusable="false"
        >
          <path
            d="M104 130 C184 82 296 94 374 144 C452 194 512 176 592 124 C680 66 775 94 824 168"
            fill="none"
          />
          <path
            d="M92 316 C178 244 280 252 366 314 C460 382 544 374 642 304 C724 244 786 260 830 320"
            fill="none"
          />
          <path
            d="M196 76 C190 174 198 262 236 344 C264 402 310 444 374 468"
            fill="none"
          />
          <path
            d="M604 72 C554 154 534 244 558 328 C582 414 646 462 736 480"
            fill="none"
          />
          <circle cx="236" cy="248" r="158" />
          <circle cx="622" cy="266" r="176" />
        </svg>
        <div className="site-locdisc__pins">
          {locs.map((l, index) =>
            l.status === "coming_soon" ? (
              <span
                key={l.key}
                className="site-locdisc__pin"
                data-status="coming-soon"
                style={pinStyle(index)}
              >
                <span>{l.label}</span>
              </span>
            ) : (
              <a
                key={l.key}
                href={l.href}
                className="site-locdisc__pin"
                data-status="active"
                style={pinStyle(index)}
              >
                <span>{l.label}</span>
              </a>
            ),
          )}
        </div>
      </div>

      <aside className="site-locdisc__market-panel">
        <span
          className="site-locdisc__market-kicker"
          data-status={featuredIsComingSoon ? "coming-soon" : "active"}
        >
          {featuredIsComingSoon ? "Coming soon" : "Featured market"}
        </span>
        <h3 className="site-locdisc__market-title">{featured.label}</h3>
        {featured.region ? (
          <p className="site-locdisc__market-region">{featured.region}</p>
        ) : null}
        <p className="site-locdisc__market-copy">
          Agency-managed discovery for destination briefs, productions, and
          brand experiences.
        </p>
        {showCount && typeof featured.count === "number" ? (
          <span className="site-locdisc__market-count">
            {featured.count} talent
          </span>
        ) : null}
        <div className="site-locdisc__market-stats">
          <span>
            <b>{activeCount}</b>
            Active markets
          </span>
          {comingSoonCount > 0 ? (
            <span>
              <b>{comingSoonCount}</b>
              Coming soon
            </span>
          ) : null}
        </div>
        {featuredIsComingSoon ? null : (
          <a href={featured.href} className="site-locdisc__market-link">
            Browse market
          </a>
        )}
      </aside>
    </div>
  );
}

/**
 * Builds the LocationSection copy bundle (orbit map labels + error states)
 * from the i18n catalog for the given locale. Shared shape with the homepage
 * `LocationSection`.
 */
function buildLocationSectionCopy(locale: string) {
  const t = createTranslator(locale);
  return {
    sectionKicker: t("public.home.location.sectionKicker"),
    sectionTitle: t("public.home.location.sectionTitle"),
    talentCountOne: t("public.home.location.talentCountOne"),
    talentCountMany: t("public.home.location.talentCountMany"),
    viewTalents: t("public.home.location.viewTalents"),
    mapLoadErrorTitle: t("public.home.location.mapLoadErrorTitle"),
    mapLoadErrorBody: t("public.home.location.mapLoadErrorBody"),
    mapLoadErrorOpenConsole: t("public.home.location.mapLoadErrorOpenConsole"),
    mapPinPreviewAria: t("public.home.location.mapPinPreviewAria"),
    mapPinPreviewPhotoAlt: t("public.home.location.mapPinPreviewPhotoAlt"),
  };
}

export async function LocationDiscoveryComponent({
  props,
  tenantId,
  locale,
  publicPathPrefix = "",
  mapsApiKey,
  builderNodeBindings,
}: SectionComponentProps<LocationDiscoveryV1>) {
  const {
    eyebrow,
    headline,
    subheadline,
    source,
    items,
    maxItems,
    showCount,
    showMap,
    ctaLabel,
    ctaHref,
    layout,
    emptyStateText,
    nodePresentation,
    presentation,
    mapStyle,
  } = props;

  // Tenant URL grammar for every `/directory?location=…` link this section (and
  // the client-side orbit map beneath it) emits. Resolved once here and threaded
  // down as a prop, because the map is a client component and cannot read it.
  const localeUrl = await getRequestLocaleUrlSettings();

  // talent_orbit — the live, interactive Google map with talent-profile photos
  // orbiting each city pin (LocationSection / LocationMapPinPreview). Sources
  // live roster cities + featured talent for the tenant, regardless of `source`.
  if (mapStyle === "talent_orbit") {
    // Resolver (tenant → HQ → env), not raw env — see global-directory.
    const mapsApiKey = await resolveGoogleMapsKeyForClient(tenantId ?? null);
    const { locations } = mapsApiKey
      ? await getHomepageData({ tenantId })
      : { locations: [] as Awaited<ReturnType<typeof getHomepageData>>["locations"] };
    // Render the live orbit map only when a Maps key exists AND the tenant has
    // mapped roster cities; otherwise fall through to the always-renders
    // editorial map below (no bare "map unavailable" state on key-less tenants).
    if (mapsApiKey && locations.length > 0) {
      return (
        <LocationSection
          locations={locations}
          locale={locale as Locale}
          mapsApiKey={mapsApiKey}
          publicPathPrefix={publicPathPrefix}
          localeUrl={localeUrl}
          copy={{
            sectionKicker:
              eyebrow ?? pickLocale(locale, { en: "Talent network", es: "Red de talento" }),
            sectionTitle:
              headline ??
              pickLocale(locale, {
                en: "Local faces, international reach.",
                es: "Rostros locales, alcance internacional.",
              }),
            talentCountOne: pickLocale(locale, { en: "1 talent", es: "1 talento" }),
            talentCountMany: pickLocale(locale, { en: "{count} talent", es: "{count} talentos" }),
            viewTalents: pickLocale(locale, { en: "View talents", es: "Ver talentos" }),
            mapLoadErrorTitle: pickLocale(locale, { en: "Map unavailable", es: "Mapa no disponible" }),
            mapLoadErrorBody: pickLocale(locale, {
              en: "The interactive map could not load.",
              es: "No se pudo cargar el mapa interactivo.",
            }),
            mapLoadErrorOpenConsole: pickLocale(locale, {
              en: "Open the browser console for details.",
              es: "Abre la consola del navegador para más detalles.",
            }),
            mapPinPreviewAria: pickLocale(locale, {
              en: "Featured talent in {city}",
              es: "Talento destacado en {city}",
            }),
            mapPinPreviewPhotoAlt: pickLocale(locale, { en: "Featured talent", es: "Talento destacado" }),
          }}
        />
      );
    }
    // No live locations resolved for this tenant → fall through to editorial.
  }

  const nodeIdsByRole = builderNodeBindings?.nodeIdsByRole;

  // 6C — single-source link resolution (handles LinkRef object or
  // legacy string; auth routes stay root, tenant pages prefix-aware).
  const linkCtx = { pathPrefix: publicPathPrefix ?? "", tenantId };
  const resolve = (h: typeof ctaHref | string) =>
    resolveLinkLike(h ?? "/directory", linkCtx).href;
  const manualLocs = () =>
    (items ?? []).slice(0, maxItems ?? 8).map((it, i) => ({
      key: `${it.label}-${i}`,
      label: it.label,
      region: it.region,
      href: resolve(it.href),
      count: it.count,
      featured: it.featured,
      status: it.status ?? "active",
    }));

  let locs: Loc[] = [];
  if (source === "roster_cities") {
    const derived = await fetchTenantRosterCities({
      tenantId,
      maxItems: maxItems ?? 8,
      locale,
    });
    // No directory location query-param is invented — link to base
    // directory; operator can switch to manual items for precise links.
    locs =
      derived.length > 0
        ? derived.map((d, i) => ({
            key: d.locationId,
            label: d.label,
            region: d.region,
            href: resolve("/directory"),
            count: d.count,
            featured: i === 0,
            status: "active" as const,
          }))
        : manualLocs();
  } else {
    // manual (and service_areas → safe manual interim, documented).
    locs = manualLocs();
  }

  // Orbit map (interactive Google Maps embed with animated pin previews).
  // Only attempted when the operator turned the map on AND a tenant Maps key
  // resolved server-side (custom BYO key, or inherited platform key). The key
  // is resolved upstream in HomepageCmsSections via
  // resolveGoogleMapsKeyForClient(tenantId) and passed as a plain string prop —
  // no server-only module crosses into the "use client" map. We load the
  // tenant's geo-located roster cities (lat/lng + featured talent thumbs) to
  // feed the orbit; when none have coordinates the LocationSection renders
  // nothing and we fall through to the decorative SVG MarketMap below.
  let orbitLocations:
    | Awaited<ReturnType<typeof getHomepageData>>["locations"]
    | null = null;
  const key = mapsApiKey?.trim() || null;
  if (showMap && key) {
    try {
      const homeData = await getHomepageData({ tenantId });
      const withCoords = homeData.locations.filter(
        (l) => l.latitude != null && l.longitude != null,
      );
      if (withCoords.length > 0) orbitLocations = withCoords;
    } catch {
      // Swallow — fall back to the SVG MarketMap (graceful "no orbit" path).
      orbitLocations = null;
    }
  }

  // When the orbit map can render, mount the real LocationSection in place of
  // the SVG map. It keeps its own kicker/title from the i18n catalog; the
  // section head (eyebrow/headline) above still renders the operator's copy.
  if (orbitLocations && orbitLocations.length > 0 && key) {
    return (
      <section
        className="site-locdisc"
        data-ld-layout={layout ?? "grid"}
        data-ld-map="true"
        data-ld-orbit="true"
        {...presentationDataAttrs(presentation)}
      >
        <Container width="standard">
          <div className="site-locdisc__head">
            <SectionHead
              eyebrow={eyebrow ? renderInlineRich(eyebrow) : undefined}
              headline={headline ? renderInlineRich(headline) : undefined}
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
            {ctaLabel && ctaHref ? (
              <Cta href={resolve(ctaHref)} variant="text" size="sm">
                {ctaLabel}
              </Cta>
            ) : null}
          </div>
          <LocationSection
            locations={orbitLocations}
            locale={locale}
            copy={{
              ...buildLocationSectionCopy(locale),
              // The operator's SectionHead above is the section title; blank the
              // LocationSection's built-in kicker/title so the heading isn't
              // doubled. The orbit map + location chips render unchanged.
              sectionKicker: "",
              sectionTitle: "",
            }}
            mapsApiKey={key}
            publicPathPrefix={publicPathPrefix}
            localeUrl={localeUrl}
          />
        </Container>
      </section>
    );
  }

  return (
    <section
      className="site-locdisc"
      data-ld-layout={layout ?? "grid"}
      data-ld-map={showMap === true ? "true" : undefined}
      {...presentationDataAttrs(presentation)}
    >
      <Container width="standard">
        <div className="site-locdisc__head">
          <SectionHead
            eyebrow={eyebrow ? renderInlineRich(eyebrow) : undefined}
            headline={headline ? renderInlineRich(headline) : undefined}
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
        ) : showMap ? (
          <MarketMap locs={locs} showCount={showCount} />
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
