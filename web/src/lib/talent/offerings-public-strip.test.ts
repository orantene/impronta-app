import assert from "node:assert/strict";
import { test } from "node:test";

import { filterOfferingsForCatalog } from "@/lib/site-admin/builder-node/services-catalog-selection";
import type { TalentOffering } from "@/lib/talent/offerings-types";
import { stripPublicOfferingFlightFields } from "./offerings-public-strip";

const row = {
  id: "o1",
  status: "published",
  visibility: "public",
  moderationState: "approved",
  sortOrder: 2,
  titleI18n: { es: "x" },
  descriptionI18n: { es: "y" },
  firstPublishedAt: "2026-01-01",
  updatedAt: "2026-01-02",
} as unknown as TalentOffering;

test("stripped public offerings stay eligible for the catalog", () => {
  const stripped = stripPublicOfferingFlightFields(row);
  assert.equal(filterOfferingsForCatalog([stripped], { selectionMode: "all" }).length, 1);
});

test("strip still drops the heavy editor fields", () => {
  const stripped = stripPublicOfferingFlightFields(row) as unknown as Record<string, unknown>;
  for (const k of ["titleI18n", "descriptionI18n", "firstPublishedAt", "updatedAt"]) {
    assert.equal(k in stripped, false);
  }
});
