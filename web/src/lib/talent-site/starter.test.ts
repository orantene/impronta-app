import test from "node:test";
import assert from "node:assert/strict";

import { isTalentPersonalSectionTypeKey } from "@/lib/site-admin/sections/talent-personal-section-keys";
import { buildTalentPortfolioStarterSnapshot } from "@/lib/talent-site/starter";

test("starter snapshot sections are allowed for talent_personal", () => {
  const snapshot = buildTalentPortfolioStarterSnapshot(
    {
      displayName: "Marta Reyes",
      profileCode: "marta-reyes",
      primaryTypeLabel: "Fashion Model",
      publicBio: "Editorial and runway work across Europe.",
      homeCity: "Paris",
      serviceAreaLabels: ["Paris", "Milan"],
      headshotUrl: "https://example.com/headshot.jpg",
    },
    [
      { url: "https://example.com/a.jpg" },
      { url: "https://example.com/b.jpg" },
      { url: "https://example.com/c.jpg" },
    ],
  );

  assert.equal(snapshot.siteKind, "talent_personal");
  assert.ok(snapshot.slots.length >= 4);

  for (const slot of snapshot.slots) {
    assert.equal(
      isTalentPersonalSectionTypeKey(slot.sectionTypeKey),
      true,
      `${slot.sectionTypeKey} must be talent_personal allowed`,
    );
  }

  const serialized = JSON.stringify(snapshot);
  assert.equal(serialized.includes("rates"), false);
  assert.equal(serialized.includes("bio_draft"), false);
  assert.equal(serialized.includes("internal_notes"), false);
});
