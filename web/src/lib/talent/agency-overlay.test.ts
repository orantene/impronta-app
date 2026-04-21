import test from "node:test";
import assert from "node:assert/strict";

import { composeTalentPresentation } from "./agency-overlay";
import type { AgencyOverlayFields } from "./visibility";

const CANONICAL = {
  name: "Adriana Vega",
  bio: "Fashion model based in Cancun.",
  bannerUrl: "https://cdn.example.com/canonical-banner.jpg",
};

const OVERLAY: AgencyOverlayFields = {
  display_headline: "Agency Headline",
  local_bio: "Agency local bio",
  local_tags: ["cancun-exclusive"],
};

const OVERLAY_BANNER = "https://cdn.example.com/agency-banner.jpg";

// ---------------------------------------------------------------------------
// Gate 3 — surface gating
// ---------------------------------------------------------------------------

test("freelancer surface: overlay is ignored even if passed", () => {
  const r = composeTalentPresentation({
    surface: "freelancer",
    canonical: CANONICAL,
    overlay: OVERLAY,
    overlayBannerUrl: OVERLAY_BANNER,
  });
  assert.equal(r.name, CANONICAL.name);
  assert.equal(r.bio, CANONICAL.bio);
  assert.equal(r.bannerUrl, CANONICAL.bannerUrl);
  assert.equal(r.overlayApplied, false);
});

test("hub surface: overlay is ignored even if passed", () => {
  const r = composeTalentPresentation({
    surface: "hub",
    canonical: CANONICAL,
    overlay: OVERLAY,
    overlayBannerUrl: OVERLAY_BANNER,
  });
  assert.equal(r.name, CANONICAL.name);
  assert.equal(r.bio, CANONICAL.bio);
  assert.equal(r.bannerUrl, CANONICAL.bannerUrl);
  assert.equal(r.overlayApplied, false);
});

test("admin surface: overlay is ignored (admin renders canonical)", () => {
  // Admin surface is not the storefront view; admin composes overlays in
  // its own editing UI. composeTalentPresentation is a public-render helper
  // and intentionally treats admin as canonical-only.
  const r = composeTalentPresentation({
    surface: "admin",
    canonical: CANONICAL,
    overlay: OVERLAY,
    overlayBannerUrl: OVERLAY_BANNER,
  });
  assert.equal(r.overlayApplied, false);
});

// ---------------------------------------------------------------------------
// Agency surface — no overlay row
// ---------------------------------------------------------------------------

test("agency surface with no overlay row: canonical verbatim", () => {
  const r = composeTalentPresentation({
    surface: "agency",
    canonical: CANONICAL,
    overlay: null,
  });
  assert.equal(r.name, CANONICAL.name);
  assert.equal(r.bio, CANONICAL.bio);
  assert.equal(r.bannerUrl, CANONICAL.bannerUrl);
  assert.equal(r.overlayApplied, false);
});

// ---------------------------------------------------------------------------
// Agency surface — overlay substitutions
// ---------------------------------------------------------------------------

test("agency surface: overlay display_headline + local_bio substitute", () => {
  const r = composeTalentPresentation({
    surface: "agency",
    canonical: CANONICAL,
    overlay: OVERLAY,
  });
  assert.equal(r.name, "Agency Headline");
  assert.equal(r.bio, "Agency local bio");
  assert.equal(r.bannerUrl, CANONICAL.bannerUrl);
  assert.equal(r.overlayApplied, true);
});

test("agency surface: overlay banner substitutes when resolved URL provided", () => {
  const r = composeTalentPresentation({
    surface: "agency",
    canonical: CANONICAL,
    overlay: OVERLAY,
    overlayBannerUrl: OVERLAY_BANNER,
  });
  assert.equal(r.bannerUrl, OVERLAY_BANNER);
  assert.equal(r.overlayApplied, true);
});

test("agency surface: null display_headline keeps canonical name", () => {
  const r = composeTalentPresentation({
    surface: "agency",
    canonical: CANONICAL,
    overlay: { ...OVERLAY, display_headline: null },
  });
  assert.equal(r.name, CANONICAL.name);
  // local_bio still substitutes since it's non-null
  assert.equal(r.bio, "Agency local bio");
  assert.equal(r.overlayApplied, true);
});

test("agency surface: blank/whitespace overlay fields do NOT blank canonical", () => {
  const r = composeTalentPresentation({
    surface: "agency",
    canonical: CANONICAL,
    overlay: {
      display_headline: "   ",
      local_bio: "",
      local_tags: [],
    },
  });
  assert.equal(r.name, CANONICAL.name);
  assert.equal(r.bio, CANONICAL.bio);
  assert.equal(r.overlayApplied, false);
});

test("agency surface: null overlayBannerUrl keeps canonical banner", () => {
  const r = composeTalentPresentation({
    surface: "agency",
    canonical: CANONICAL,
    overlay: OVERLAY,
    overlayBannerUrl: null,
  });
  assert.equal(r.bannerUrl, CANONICAL.bannerUrl);
});

test("agency surface: overlay with null canonical banner still works", () => {
  const r = composeTalentPresentation({
    surface: "agency",
    canonical: { ...CANONICAL, bannerUrl: null },
    overlay: OVERLAY,
    overlayBannerUrl: OVERLAY_BANNER,
  });
  assert.equal(r.bannerUrl, OVERLAY_BANNER);
  assert.equal(r.overlayApplied, true);
});

test("agency surface: no overlay banner and no canonical banner → null", () => {
  const r = composeTalentPresentation({
    surface: "agency",
    canonical: { ...CANONICAL, bannerUrl: null },
    overlay: OVERLAY,
  });
  assert.equal(r.bannerUrl, null);
});
