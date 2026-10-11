/**
 * TUL-567 · "Needs a price" chip on a catalog row: a draft service with no
 * price stays off the site until the owner adds one. The decision is
 * `offeringNeedsPrice`; this only draws it.
 */
import type { ReactNode } from "react";

import { offeringNeedsPrice } from "@/lib/talent/offering-needs-price";
import type { TalentOffering } from "@/lib/talent/offerings-types";
import { Chip } from "./catalog-chip";

export function NeedsPriceChip({
  item,
  t,
  className,
}: {
  item: Pick<TalentOffering, "status" | "priceDisplay" | "amountCents">;
  t: (key: string) => string;
  className?: string;
}): ReactNode {
  if (!offeringNeedsPrice(item)) return null;
  return (
    <span className={className} title={t("dashboard.catalog.list.needsPriceHint")} data-testid="catalog-row-needs-price">
      <Chip tone="brand">{t("dashboard.catalog.list.needsPrice")}</Chip>
    </span>
  );
}
