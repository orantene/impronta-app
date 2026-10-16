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

test("a site with published offerings keeps its services band after the live prune", async () => {
  const { pruneEmptyBoundSections } = await import("@/lib/talent-site/my-content-prune");
  const tree = [
    {
      id: "band",
      kind: "container",
      props: { anchor: "services" },
      children: [
        { id: "h", kind: "heading", props: { text: "Services" } },
        { id: "cat", kind: "services_catalog", props: { selectionMode: "all" } },
      ],
    },
  ] as unknown as Parameters<typeof pruneEmptyBoundSections>[0];
  const ds = {
    talentOfferings: [stripPublicOfferingFlightFields(row)],
  } as unknown as Parameters<typeof pruneEmptyBoundSections>[1];
  const out = pruneEmptyBoundSections(tree, ds);
  assert.equal(out.length, 1, "band must not be pruned when offerings exist");
  assert.equal(
    pruneEmptyBoundSections(tree, { talentOfferings: [] } as unknown as typeof ds).length,
    0,
    "band is pruned when there are genuinely no offerings",
  );
});
