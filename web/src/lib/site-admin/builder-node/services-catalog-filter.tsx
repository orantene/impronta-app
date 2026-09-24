"use client";

import { useState } from "react";
import { OfferingCta } from "@/app/t/[profileCode]/_shared/OfferingCta";
import { offeringPriceLabel, type TalentOffering } from "@/lib/talent/offerings-types";
import { usdEquivalentLabel, type UsdRates } from "@/lib/pricing/usd-equivalent";
import { catalogDurationPhrase } from "./services-catalog-title";

export function ServicesCatalogFilter({
  groups,
  locale,
  nav,
  showPhoto,
  showDuration,
  showUsdEquivalent,
  confirmsByHand,
  usdRates,
  ctaLabel,
}: {
  groups: Array<{ name: string | null; items: TalentOffering[] }>;
  locale: string;
  nav: "pills" | "tabs";
  showPhoto: boolean;
  showDuration: boolean;
  showUsdEquivalent: boolean;
  confirmsByHand: boolean;
  usdRates: UsdRates | null;
  ctaLabel?: string;
}) {
  const named = groups.filter((g) => g.name);
  const first = named[0]?.name ?? null;
  const [active, setActive] = useState<string | null>(first);
  const es = locale.startsWith("es");

  return (
    <>
      <nav
        aria-label={es ? "Categorías" : "Categories"}
        className="site-builder-node--services-catalog-nav"
        data-category-nav={nav}
      >
        {named.map((g) => {
          const selected = active === g.name;
          return (
            <button
              key={g.name}
              type="button"
              aria-pressed={selected}
              data-catalog-tab={g.name ?? ""}
              className="site-builder-node--services-catalog-pill"
              data-active={selected ? "true" : "false"}
              onClick={() => setActive(g.name)}
            >
              {g.name}
            </button>
          );
        })}
      </nav>
      {groups.map((g) => {
        const hidden = Boolean(g.name) && active !== g.name;
        return (
          <div
            key={g.name ?? "_"}
            hidden={hidden}
            data-catalog-category={g.name ?? "_"}
            className="site-builder-node--services-catalog-group"
          >
            <ul className="site-builder-node--services-catalog-list">
              {g.items.map((item) => (
                <CatalogRow
                  key={item.id}
                  item={item}
                  locale={locale}
                  showPhoto={showPhoto}
                  showDuration={showDuration}
                  showUsdEquivalent={showUsdEquivalent}
                  confirmsByHand={confirmsByHand}
                  usdRates={usdRates}
                  ctaLabel={ctaLabel}
                />
              ))}
            </ul>
          </div>
        );
      })}
    </>
  );
}

export function CatalogRow({
  item,
  locale,
  showPhoto,
  showDuration,
  showUsdEquivalent,
  confirmsByHand,
  usdRates,
  ctaLabel,
}: {
  item: TalentOffering;
  locale: string;
  showPhoto: boolean;
  showDuration: boolean;
  showUsdEquivalent: boolean;
  confirmsByHand: boolean;
  usdRates: UsdRates | null;
  ctaLabel?: string;
}) {
  const cover = showPhoto ? item.imageUrls[0] : undefined;
  const price = offeringPriceLabel(item, locale);
  const usd = usdEquivalentLabel(item.amountCents, item.currency, usdRates, locale);
  return (
    <li className="site-builder-node--services-catalog-row">
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
        <strong>{price}</strong>
        {showUsdEquivalent && usd ? <span className="site-builder-node--services-catalog-usd">{usd}</span> : null}
      </span>
      <OfferingCta
        offering={item}
        locale={locale}
        compact
        confirmsByHand={confirmsByHand}
        label={ctaLabel}
      />
    </li>
  );
}
