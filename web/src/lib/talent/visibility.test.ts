import test from "node:test";
import assert from "node:assert/strict";

import {
  resolveTalentVisibility,
  serializeTalentForSurface,
  type TalentVisibilityProfile,
  type TalentVisibilityRosterRow,
} from "./visibility";

// ---------------------------------------------------------------------------
// Fixture builders
// ---------------------------------------------------------------------------

function publicApprovedProfile(
  overrides: Partial<TalentVisibilityProfile> = {},
): TalentVisibilityProfile {
  return {
    workflow_status: "approved",
    visibility: "public",
    deleted_at: null,
    ...overrides,
  };
}

function roster(
  overrides: Partial<TalentVisibilityRosterRow> = {},
): TalentVisibilityRosterRow {
  return {
    tenant_id: "00000000-0000-0000-0000-000000000001",
    status: "active",
    agency_visibility: "site_visible",
    hub_visibility_status: "not_submitted",
    ...overrides,
  };
}

const TENANT_A = "00000000-0000-0000-0000-000000000001";
const TENANT_B = "00000000-0000-0000-0000-000000000003";
const HUB_ID = "00000000-0000-0000-0000-000000000002";

// ---------------------------------------------------------------------------
// Freelancer surface (app host /t/[code])
// ---------------------------------------------------------------------------

test("freelancer: approved+public talent is visible; overlays disallowed", () => {
  const r = resolveTalentVisibility(
    { profile: publicApprovedProfile() },
    "freelancer",
  );
  assert.equal(r.visible, true);
  if (r.visible) {
    assert.equal(r.view, "freelancer");
    assert.equal(r.overlaysAllowed, false);
  }
});

test("freelancer: non-approved talent is hidden", () => {
  const r = resolveTalentVisibility(
    { profile: publicApprovedProfile({ workflow_status: "pending" }) },
    "freelancer",
  );
  assert.equal(r.visible, false);
});

test("freelancer: hidden-visibility talent is hidden", () => {
  const r = resolveTalentVisibility(
    { profile: publicApprovedProfile({ visibility: "hidden" }) },
    "freelancer",
  );
  assert.equal(r.visible, false);
});

test("freelancer: soft-deleted talent is hidden", () => {
  const r = resolveTalentVisibility(
    {
      profile: publicApprovedProfile({
        deleted_at: "2026-01-01T00:00:00Z",
      }),
    },
    "freelancer",
  );
  assert.equal(r.visible, false);
});

// ---------------------------------------------------------------------------
// Agency surface (storefront)
// ---------------------------------------------------------------------------

test("agency: requires orgId", () => {
  const r = resolveTalentVisibility(
    { profile: publicApprovedProfile(), roster: roster() },
    "agency",
  );
  assert.equal(r.visible, false);
});

test("agency: site_visible roster row grants visibility + overlays", () => {
  const r = resolveTalentVisibility(
    {
      profile: publicApprovedProfile(),
      roster: roster({ agency_visibility: "site_visible" }),
    },
    "agency",
    TENANT_A,
  );
  assert.equal(r.visible, true);
  if (r.visible) {
    assert.equal(r.view, "agency");
    assert.equal(r.overlaysAllowed, true);
  }
});

test("agency: featured roster row grants visibility + overlays", () => {
  const r = resolveTalentVisibility(
    {
      profile: publicApprovedProfile(),
      roster: roster({ agency_visibility: "featured" }),
    },
    "agency",
    TENANT_A,
  );
  assert.equal(r.visible, true);
});

test("agency: roster_only hides from storefront", () => {
  const r = resolveTalentVisibility(
    {
      profile: publicApprovedProfile(),
      roster: roster({ agency_visibility: "roster_only" }),
    },
    "agency",
    TENANT_A,
  );
  assert.equal(r.visible, false);
});

test("agency: tenant mismatch hides talent", () => {
  const r = resolveTalentVisibility(
    {
      profile: publicApprovedProfile(),
      roster: roster({ tenant_id: TENANT_A }),
    },
    "agency",
    TENANT_B,
  );
  assert.equal(r.visible, false);
});

test("agency: no roster row hides talent", () => {
  const r = resolveTalentVisibility(
    { profile: publicApprovedProfile(), roster: null },
    "agency",
    TENANT_A,
  );
  assert.equal(r.visible, false);
});

// ---------------------------------------------------------------------------
// Hub surface
// ---------------------------------------------------------------------------

test("hub: approved hub_visibility_status grants visibility; overlays disallowed", () => {
  const r = resolveTalentVisibility(
    {
      profile: publicApprovedProfile(),
      roster: roster({
        tenant_id: HUB_ID,
        hub_visibility_status: "approved",
      }),
    },
    "hub",
    HUB_ID,
  );
  assert.equal(r.visible, true);
  if (r.visible) {
    assert.equal(r.view, "hub");
    // Gate 3: hub NEVER carries agency overlays.
    assert.equal(r.overlaysAllowed, false);
  }
});

test("hub: not_submitted hides talent", () => {
  const r = resolveTalentVisibility(
    {
      profile: publicApprovedProfile(),
      roster: roster({
        tenant_id: HUB_ID,
        hub_visibility_status: "not_submitted",
      }),
    },
    "hub",
    HUB_ID,
  );
  assert.equal(r.visible, false);
});

test("hub: pending hides talent", () => {
  const r = resolveTalentVisibility(
    {
      profile: publicApprovedProfile(),
      roster: roster({
        tenant_id: HUB_ID,
        hub_visibility_status: "pending",
      }),
    },
    "hub",
    HUB_ID,
  );
  assert.equal(r.visible, false);
});

// ---------------------------------------------------------------------------
// Admin surface
// ---------------------------------------------------------------------------

test("admin: always visible (caller pre-authorised)", () => {
  const r = resolveTalentVisibility(
    {
      profile: publicApprovedProfile({
        workflow_status: "pending",
        visibility: "hidden",
      }),
    },
    "admin",
  );
  assert.equal(r.visible, true);
  if (r.visible) {
    assert.equal(r.view, "admin");
    assert.equal(r.overlaysAllowed, true);
  }
});

// ---------------------------------------------------------------------------
// Serialization (Gate 3 — cross-surface leakage)
// ---------------------------------------------------------------------------

const CANONICAL = {
  id: "11111111-1111-1111-1111-111111111111",
  profile_code: "t_abc123",
  display_name: "Adriana Vega",
  short_bio: "Fashion model based in Cancun",
  bio_en: "Longer canonical bio",
};

const OVERLAY = {
  display_headline: "Agency headline — don't leak me",
  local_bio: "Agency-authored local bio — don't leak me",
  local_tags: ["cancun-exclusive", "editorial"],
};

test("serialize: freelancer surface NEVER includes overlays", () => {
  const out = serializeTalentForSurface({
    surface: "freelancer",
    canonical: CANONICAL,
    overlay: OVERLAY,
  });
  assert.equal(out.surface, "freelancer");
  assert.deepEqual(out.canonical, CANONICAL);
  assert.equal(out.overlays, null);
});

test("serialize: agency surface includes overlays when provided", () => {
  const out = serializeTalentForSurface({
    surface: "agency",
    canonical: CANONICAL,
    overlay: OVERLAY,
  });
  assert.equal(out.surface, "agency");
  assert.deepEqual(out.overlays, OVERLAY);
});

test("serialize: agency surface with no overlay row yields null overlays", () => {
  const out = serializeTalentForSurface({
    surface: "agency",
    canonical: CANONICAL,
  });
  assert.equal(out.overlays, null);
});

test("serialize: hub surface NEVER includes overlays even if passed", () => {
  const out = serializeTalentForSurface({
    surface: "hub",
    canonical: CANONICAL,
    overlay: OVERLAY,
  });
  assert.equal(out.surface, "hub");
  assert.equal(out.overlays, null);
});

test("serialize: admin surface includes overlays", () => {
  const out = serializeTalentForSurface({
    surface: "admin",
    canonical: CANONICAL,
    overlay: OVERLAY,
  });
  assert.deepEqual(out.overlays, OVERLAY);
});
