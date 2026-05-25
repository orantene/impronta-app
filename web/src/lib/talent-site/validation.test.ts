import test from "node:test";
import assert from "node:assert/strict";

import { buildTalentPortfolioStarterSnapshot } from "@/lib/talent-site/starter";
import { validateTalentSiteSnapshot } from "@/lib/talent-site/validation";

test("validation rejects wrong siteKind", () => {
  const base = buildTalentPortfolioStarterSnapshot(
    {
      displayName: "Test",
      profileCode: "test",
      primaryTypeLabel: null,
      publicBio: null,
      homeCity: null,
      serviceAreaLabels: [],
      headshotUrl: null,
    },
    [],
  );

  const bad = { ...base, siteKind: "agency" as const };
  const result = validateTalentSiteSnapshot(bad);
  assert.equal(result.ok, false);
});

test("validation rejects tenant-only section types", () => {
  const base = buildTalentPortfolioStarterSnapshot(
    {
      displayName: "Test",
      profileCode: "test",
      primaryTypeLabel: null,
      publicBio: null,
      homeCity: null,
      serviceAreaLabels: [],
      headshotUrl: null,
    },
    [
      { url: "https://example.com/a.jpg" },
      { url: "https://example.com/b.jpg" },
      { url: "https://example.com/c.jpg" },
    ],
  );

  for (const sectionTypeKey of ["directory", "featured_talent", "category_grid"]) {
    const bad = {
      ...base,
      slots: [
        {
          ...base.slots[0],
          sectionTypeKey,
        },
      ],
    };
    const result = validateTalentSiteSnapshot(bad);
    assert.equal(result.ok, false, `expected ${sectionTypeKey} to be rejected`);
  }
});

test("validation accepts valid talent_portfolio starter", () => {
  const snapshot = buildTalentPortfolioStarterSnapshot(
    {
      displayName: "Test Talent",
      profileCode: "test-talent",
      primaryTypeLabel: "Actor",
      publicBio: "Public bio only.",
      homeCity: "NYC",
      serviceAreaLabels: ["NYC"],
      headshotUrl: "https://example.com/h.jpg",
    },
    [
      { url: "https://example.com/1.jpg" },
      { url: "https://example.com/2.jpg" },
      { url: "https://example.com/3.jpg" },
    ],
  );

  const result = validateTalentSiteSnapshot(snapshot);
  assert.equal(result.ok, true);
});
