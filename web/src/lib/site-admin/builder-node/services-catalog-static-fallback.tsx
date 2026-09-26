"use client";

import type { ReactNode } from "react";

import {
  catalogRowCtaLabel,
  catalogRowMinCents,
  catalogRowShowsFrom,
} from "@/components/public-booking/catalog-booking-logic";
import { usdEquivalentLabel } from "@/lib/pricing/usd-equivalent";
import { formatMoney } from "@/lib/talent/offerings-money";
import type { TalentOffering } from "@/lib/talent/offerings-types";

import { catalogDurationPhrase } from "@/lib/site-admin/builder-node/services-catalog-title";

export type CatalogStaticGroup = {
  name: string | null;
  items: ReadonlyArray<TalentOffering>;
  note?: string | null;
};

/**
 * Non-interactive `services_catalog` markup for error-boundary fallback.
 * No client hooks, no booking sheet — keeps the vanity page alive if the
 * interactive island throws during SSR/hydrate.
 */
export function ServicesCatalogStaticFallback({
  groups,
  locale,
  showPhoto,
  showDuration,
  showUsdEquivalent,
  ctaLabel,
}: {
  groups: ReadonlyArray<CatalogStaticGroup>;
  locale: string;
  showPhoto: boolean;
  showDuration: boolean;
  showUsdEquivalent: boolean;
  ctaLabel?: string;
}): ReactNode {
  const es = locale.startsWith("es");
  return (
    <div className="cb-island" data-catalog-static-fallback="" data-sheet-accent="primary">
      {groups.map((g) => (
        <div
          key={g.name ?? "_"}
          data-catalog-category={g.name ?? "_"}
          className="site-builder-node--services-catalog-group"
        >
          {g.name ? (
            <h3 className="site-builder-node--services-catalog-group-title">{g.name}</h3>
          ) : null}
          <ul className="site-builder-node--services-catalog-list">
            {g.items.map((item) => {
              const cover = showPhoto ? item.imageUrls[0] : undefined;
              const onRequest = item.visibility === "on_request";
              const quote =
                item.priceDisplay === "quote" || item.priceType === "custom" || item.amountCents == null;
              const minCents = catalogRowMinCents(item);
              const ladder = catalogRowShowsFrom(item);
              const usd = showUsdEquivalent
                ? usdEquivalentLabel(minCents, item.currency, null, locale)
                : null;
              const label = catalogRowCtaLabel({
                selected: false,
                offering: item,
                locale,
                inspectorLabel: ctaLabel,
              });
              return (
                <li key={item.id} className="site-builder-node--services-catalog-row">
                  {cover ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={cover} alt="" className="site-builder-node--services-catalog-photo" />
                  ) : (
                    <span className="site-builder-node--services-catalog-photo" aria-hidden />
                  )}
                  <span className="site-builder-node--services-catalog-copy">
                    <strong className="site-builder-node--services-catalog-name">{item.title}</strong>
                    {item.description ? (
                      <span className="site-builder-node--services-catalog-desc">{item.description}</span>
                    ) : null}
                    {showDuration && item.durationMinutes && item.kind !== "product" ? (
                      <span className="site-builder-node--services-catalog-duration">
                        {catalogDurationPhrase(item.durationMinutes, locale)}
                      </span>
                    ) : null}
                  </span>
                  <span className="site-builder-node--services-catalog-price">
                    {onRequest || quote || minCents == null ? (
                      <strong>
                        {es
                          ? onRequest
                            ? "Bajo consulta"
                            : "Cotización a pedido"
                          : onRequest
                            ? "On request"
                            : "Quote on request"}
                      </strong>
                    ) : (
                      <>
                        {ladder ? <small>{es ? "Desde" : "From"}</small> : null}
                        <strong>{formatMoney(minCents, item.currency, locale)}</strong>
                      </>
                    )}
                    {usd ? <span className="site-builder-node--services-catalog-usd">{usd}</span> : null}
                  </span>
                  <span className="site-builder-node--services-catalog-cta" aria-hidden>
                    {label}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}
