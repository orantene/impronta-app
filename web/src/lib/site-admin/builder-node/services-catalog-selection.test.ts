import assert from "node:assert/strict";
import { test } from "node:test";

import {
  filterOfferingsForCatalog,
  ineligibleSelectedOfferingIds,
  isPublicEligibleOffering,
} from "./services-catalog-selection";
import type { TalentOffering } from "@/lib/talent/offerings-types";

function offering(partial: Partial<TalentOffering>): TalentOffering {
  return {
    id: "off-1",
    talentProfileId: "talent-1",
    ownerKind: "talent",
    tenantId: null,
    kind: "service",
    title: "Service",
    description: null,
    priceType: "flat_package",
    priceDisplay: "exact",
    amountCents: 10000,
    currency: "MXN",
    bookingMode: "request",
    reserveMode: "full",
    depositPct: null,
    allowPayInPerson: true,
    requireAccountToBook: false,
    requiresIdentity: false,
    identityReason: null,
    cancellationHours: null,
    freeReserveExpiresDays: null,
    durationMinutes: 60,
    category: "A",
    inventoryQty: null,
    capacityPoolId: null,
    consumesUnits: 1,
    status: "published",
    firstPublishedAt: "2026-01-01T00:00:00Z",
    visibility: "public",
    moderationState: "approved",
    isFeatured: false,
    sortOrder: 0,
    attributes: {},
    imageUrls: [],
    variants: [],
    addOns: [],
    ...partial,
  };
}

test("isPublicEligibleOffering rejects draft and agency_only", () => {
  assert.equal(isPublicEligibleOffering(offering({})), true);
  assert.equal(isPublicEligibleOffering(offering({ status: "draft" })), false);
  assert.equal(isPublicEligibleOffering(offering({ visibility: "agency_only" })), false);
});

test("ineligibleSelectedOfferingIds lists stale ids", () => {
  const eligible = [offering({ id: "live" })];
  assert.deepEqual(ineligibleSelectedOfferingIds(["live", "gone"], eligible), ["gone"]);
});

test("filter categories mode keeps matching categories only", () => {
  const out = filterOfferingsForCatalog(
    [
      offering({ id: "1", category: "Uñas", title: "Gel" }),
      offering({ id: "2", category: "Cejas", title: "Brows" }),
    ],
    { selectionMode: "categories", selectedCategoryNames: ["Uñas"] },
  );
  assert.equal(out.length, 1);
  assert.equal(out[0]?.id, "1");
});

test("featuredOfferingIds order becomes list order", () => {
  const out = filterOfferingsForCatalog(
    [
      offering({ id: "a", title: "A", sortOrder: 0 }),
      offering({ id: "b", title: "B", sortOrder: 1 }),
      offering({ id: "c", title: "C", sortOrder: 2 }),
    ],
    { featuredOfferingIds: ["c", "a"] },
  );
  assert.deepEqual(
    out.map((o) => o.id),
    ["c", "a", "b"],
  );
});

test("isFeatured falls back when featuredOfferingIds empty", () => {
  const out = filterOfferingsForCatalog(
    [
      offering({ id: "a", isFeatured: false, sortOrder: 0 }),
      offering({ id: "b", isFeatured: true, sortOrder: 1 }),
    ],
    {},
  );
  assert.equal(out[0]?.id, "b");
});
