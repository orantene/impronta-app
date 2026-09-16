"use server";

/** catalog_grid — the server action the island imports dynamically. */

import { livePhasePrice } from "@/lib/catalog/price-phases";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";

import { loadOfferingImageUrls } from "./catalog-images";
import { readCatalogGridCore } from "./catalog-grid.core";
import type { CatalogGridData, CatalogGridProps } from "./catalog-grid.types";
import { storefrontLocale } from "./request-context";

export async function readCatalogGrid(
  tenantId: string,
  props: CatalogGridProps,
): Promise<{ ok: true; data: CatalogGridData } | { ok: false; reason: string }> {
  try {
    const admin = createServiceRoleClient();
    if (!admin) return { ok: false, reason: "unavailable" };
    return await readCatalogGridCore(
      { admin, locale: await storefrontLocale(props.locale), livePrice: livePhasePrice, loadImages: loadOfferingImageUrls },
      tenantId,
      props,
    );
  } catch (error) {
    logServerError("storefront.catalogGrid.read", error);
    return { ok: false, reason: "unavailable" };
  }
}
