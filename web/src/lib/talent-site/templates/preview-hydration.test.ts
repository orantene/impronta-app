import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildTemplatePreviewHydration,
  demoFixtureToMedia,
  demoFixtureToStarterProfile,
  demoTemplatePreviewHydration,
} from "./preview-hydration";
import {
  buildDefaultTalentProfileTree,
  hydrateTalentTree,
} from "../default-talent-tree";
import { TEMPLATE_PREVIEW_DEMO_FIXTURE } from "@/lib/site-admin/builder-core/templates/template-def";
import { buildTemplateSnapshot } from "./registry";
import type { TalentPortfolioStarterProfile } from "../starter";
import type { BuilderNode } from "@/lib/site-admin/builder-node/types";

/** Collect every string-valued prop in a builder tree (deep) for assertions. */
function collectStrings(tree: BuilderNode[]): string[] {
  const out: string[] = [];
  const walkValue = (value: unknown): void => {
    if (typeof value === "string") {
      out.push(value);
      return;
    }
    if (Array.isArray(value)) {
      value.forEach(walkValue);
      return;
    }
    if (value && typeof value === "object") {
      Object.values(value as Record<string, unknown>).forEach(walkValue);
    }
  };
  const walk = (node: BuilderNode): void => {
    walkValue(node.props);
    if ("children" in node && Array.isArray(node.children)) {
      node.children.forEach(walk);
    }
  };
  tree.forEach(walk);
  return out;
}

test("demo fixture maps into a complete starter profile + media", () => {
  const profile = demoFixtureToStarterProfile();
  assert.equal(profile.displayName, TEMPLATE_PREVIEW_DEMO_FIXTURE.displayName);
  assert.equal(profile.profileCode, TEMPLATE_PREVIEW_DEMO_FIXTURE.profileCode);
  assert.equal(profile.primaryTypeLabel, TEMPLATE_PREVIEW_DEMO_FIXTURE.primaryTypeLabel);
  assert.equal(profile.headshotUrl, TEMPLATE_PREVIEW_DEMO_FIXTURE.headshotUrl);

  const media = demoFixtureToMedia();
  assert.equal(media.length, TEMPLATE_PREVIEW_DEMO_FIXTURE.galleryUrls.length);
  assert.equal(media[0].url, TEMPLATE_PREVIEW_DEMO_FIXTURE.galleryUrls[0]);
});

test("hydration tokens project real profile data (name/bio/services/photo)", () => {
  const realProfile: TalentPortfolioStarterProfile = {
    displayName: "Sofía Marín",
    profileCode: "TAL-92001",
    primaryTypeLabel: "Photographer",
    publicBio: "Documentary and portrait photographer based in Oaxaca.",
    richBio: "Documentary and portrait photographer based in Oaxaca.",
    homeCity: "Oaxaca",
    serviceAreaLabels: [],
    serviceNames: ["Portraits", "Events"],
    secondaryTypeLabels: ["Director"],
    languagesLabel: "Spanish · English",
    headshotUrl: "https://example.com/sofia-hero.jpg",
  };
  const media = [
    { url: "https://example.com/g1.jpg", alt: "Sofía Marín" },
    { url: "https://example.com/g2.jpg", alt: "Sofía Marín" },
  ];

  const hydration = buildTemplatePreviewHydration(
    { profile: realProfile, media },
    { isReal: true },
  );

  assert.equal(hydration.isReal, true);
  assert.equal(hydration.tokens.displayName, "Sofía Marín");
  assert.equal(hydration.tokens.primaryTypeLabel, "Photographer");
  assert.equal(hydration.tokens.secondaryType1, "Director");
  assert.equal(hydration.tokens.service1, "Portraits");
  assert.equal(hydration.tokens.service2, "Events");
  assert.equal(hydration.tokens.headshotUrl, "https://example.com/sofia-hero.jpg");
  assert.equal(hydration.tokens.locationLine, "Based in Oaxaca");
  assert.equal(hydration.tokens.languagesLine, "Languages: Spanish · English");
  // The preview never advertises a live Max-site link.
  assert.equal(hydration.tokens.maxSiteUrl, "");
});

test("max-site family: hydrated tree contains real data, no leftover {{tokens}}", () => {
  const hydration = demoTemplatePreviewHydration();
  const tree = hydrateTalentTree(buildDefaultTalentProfileTree(), hydration.tokens);
  const strings = collectStrings(tree);

  // No raw placeholder leaked to the rendered tree.
  for (const s of strings) {
    assert.ok(!s.includes("{{"), `unexpected raw token in: ${s}`);
  }
  // Real demo data substituted in.
  assert.ok(
    strings.includes(TEMPLATE_PREVIEW_DEMO_FIXTURE.displayName),
    "expected the demo display name in the hydrated tree",
  );
  assert.ok(
    strings.includes(TEMPLATE_PREVIEW_DEMO_FIXTURE.headshotUrl),
    "expected the demo headshot URL in the hydrated tree",
  );
});

test("talent-site family: slot snapshot carries real data through buildTemplateSnapshot", () => {
  const hydration = demoTemplatePreviewHydration();
  const snapshot = buildTemplateSnapshot("roster", {
    profile: hydration.profile,
    media: hydration.media,
  });
  assert.equal(snapshot.siteKind, "talent_personal");
  assert.equal(snapshot.fields.title, TEMPLATE_PREVIEW_DEMO_FIXTURE.displayName);
  assert.ok(snapshot.slots.length > 0, "expected non-empty slots");
});
