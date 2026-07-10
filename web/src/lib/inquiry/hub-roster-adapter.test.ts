/**
 * UNIT TEST — hub-roster-adapter.ts (P0-5 / W0-F).
 *
 * Pins the cross-tenant Discover -> GuestRosterItem shape mapping the hub-host
 * talent picker relies on: displayName -> name, homeCity -> city, headshotUrl ->
 * photoUrl, and null category/city normalized to undefined (matching the
 * agency-path shape).
 *
 * Run: npx tsx --test src/lib/inquiry/hub-roster-adapter.test.ts
 */

import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import { discoverTalentsToRosterItems } from "./hub-roster-adapter";
import type { DiscoverTalentListItem } from "@/app/(workspace)/[tenantSlug]/_data-bridge/discover";

/** Minimal DiscoverTalentListItem factory — only the fields the adapter reads. */
function discoverRow(over: Partial<DiscoverTalentListItem> = {}): DiscoverTalentListItem {
  return {
    id: "t1",
    displayName: "Jane Doe",
    profileCode: "TA-1",
    primaryTypeLabel: "Model",
    primaryTypeSlug: "model",
    homeCity: "Miami",
    homeCountry: "USA",
    homeLat: null,
    homeLng: null,
    agencyName: "Some Agency",
    agencyTenantId: "ag1",
    isExclusive: false,
    headshotUrl: "https://img/jane.jpg",
    nextAvailableDate: null,
    availableDaysInNext30: null,
    availabilityDots14d: null,
    trustTier: "basic",
    ratingAvg: null,
    ratingCount: null,
    wouldBookAgainPct: null,
    ...over,
  };
}

describe("discoverTalentsToRosterItems", () => {
  it("maps discover fields onto the roster-lite shape", () => {
    const [item] = discoverTalentsToRosterItems([discoverRow()]);
    assert.deepEqual(item, {
      id: "t1",
      name: "Jane Doe",
      primaryTypeLabel: "Model",
      city: "Miami",
      photoUrl: "https://img/jane.jpg",
    });
  });

  it("normalizes null category + city to undefined (matches the agency path)", () => {
    const [item] = discoverTalentsToRosterItems([
      discoverRow({ primaryTypeLabel: null, homeCity: null }),
    ]);
    assert.equal(item.primaryTypeLabel, undefined);
    assert.equal(item.city, undefined);
  });

  it("passes a null headshot straight through (picker falls back to initials)", () => {
    const [item] = discoverTalentsToRosterItems([discoverRow({ headshotUrl: null })]);
    assert.equal(item.photoUrl, null);
  });

  it("preserves order and cardinality across many rows", () => {
    const rows = discoverTalentsToRosterItems([
      discoverRow({ id: "a", displayName: "A" }),
      discoverRow({ id: "b", displayName: "B" }),
      discoverRow({ id: "c", displayName: "C" }),
    ]);
    assert.deepEqual(
      rows.map((r) => `${r.id}:${r.name}`),
      ["a:A", "b:B", "c:C"],
    );
  });

  it("returns an empty array for an empty input", () => {
    assert.deepEqual(discoverTalentsToRosterItems([]), []);
  });
});
