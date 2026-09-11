"use client";

/**
 * CatalogPriceLists — W01's `Price lists` segment: the one list the engine
 * has (every item's base price, always, everywhere), drawn as the board's
 * table, and `Add price list` disabled with its sentence. A per-location or
 * timed list has no table (D-POS-47).
 */

import { useT } from "@/i18n/use-t";
import { useDashboardLocale } from "@/i18n/use-dashboard-locale";
import { Icon } from "../../primitives";
import type { OfferingsEditor } from "@/components/talent/services/use-offerings-editor";
import { offeringPriceLabel } from "@/lib/talent/offerings-types";
import { ActionButton } from "../appointments-classes-ui";
import type { CatalogNav } from "./CatalogPage";
import { CARD, ListHead, ListRow, PageHeading, SegmentLinks } from "./catalog-ui";

const COLS = "grid-cols-[1.5fr_200px_120px_1fr]";

export function CatalogPriceLists({ editor, nav }: { editor: OfferingsEditor; nav: CatalogNav }) {
  const t = useT();
  const locale = useDashboardLocale();
  const reason = t("dashboard.catalog.pricing.listsReason");
  return (
    <div className="flex flex-col gap-[16px]" data-testid="catalog-price-lists-view">
      <PageHeading
        title={t("dashboard.catalog.priceLists.title")}
        intro={t("dashboard.catalog.priceLists.intro")}
        actions={
          <ActionButton tone="primary" reason={reason} testId="catalog-price-lists-add">
            <Icon name="plus" size={14} stroke={1.75} />
            {t("dashboard.catalog.priceLists.add")}
          </ActionButton>
        }
      />
      <SegmentLinks
        label={t("dashboard.catalog.segment.label")}
        items={[
          { id: "items", label: t("dashboard.catalog.segment.items"), href: nav.href({ view: "items" }), active: false },
          { id: "price-lists", label: t("dashboard.catalog.segment.priceLists"), href: nav.href({ view: "price-lists" }), active: true },
        ]}
      />
      <div className={CARD} title={reason}>
        <ListHead cols={COLS}>
          <span>{t("dashboard.catalog.col.item")}</span>
          <span>{t("dashboard.catalog.priceLists.list")}</span>
          <span>{t("dashboard.catalog.col.price")}</span>
          <span>{t("dashboard.catalog.priceLists.when")}</span>
        </ListHead>
        {editor.items.length === 0 ? (
          <p className="m-0 border-t border-admin-border-soft px-[18px] py-[22px] text-center font-admin-body text-admin-13 text-admin-ink-muted">{t("dashboard.catalog.list.empty")}</p>
        ) : null}
        {editor.items.map((o) => (
          <ListRow key={o.id} cols={COLS}>
            <span className="truncate font-semibold">{o.title || t("dashboard.catalog.untitled")}</span>
            <span className="text-admin-ink-muted">{t("dashboard.catalog.pricing.defaultList")}</span>
            <span className="font-semibold tabular-nums">{offeringPriceLabel(o, locale)}</span>
            <span className="text-admin-ink-muted">{t("dashboard.catalog.pricing.always")}</span>
          </ListRow>
        ))}
      </div>
      <p className="m-0 font-admin-body text-[12px] text-admin-ink-muted">{reason}</p>
    </div>
  );
}
