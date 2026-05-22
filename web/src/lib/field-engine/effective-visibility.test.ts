// effective-visibility.test.ts
// Test suite for the single visibility decision primitive.
// Run: npx tsx --test src/lib/field-engine/effective-visibility.test.ts

import test from "node:test";
import assert from "node:assert/strict";

import {
  platformBaseVisibility,
  effectiveFieldVisibility,
  canViewerSee,
  visibilityToOverrideColumns,
  type FieldVisibility,
  type ViewerRole,
} from "@/lib/field-engine/effective-visibility";

// ─────────────────────────────────────────────────────────────────────────────
// 1. platformBaseVisibility — every combination of flags
// ─────────────────────────────────────────────────────────────────────────────

test("platformBaseVisibility: admin_only=true → admin (regardless of other flags)", () => {
  assert.equal(
    platformBaseVisibility({ default_visibility: ["public"], show_in_public: true, admin_only: true }),
    "admin",
  );
});

test("platformBaseVisibility: is_sensitive=true → admin (regardless of show_in_public)", () => {
  assert.equal(
    platformBaseVisibility({ default_visibility: ["public"], show_in_public: true, is_sensitive: true }),
    "admin",
  );
});

test("platformBaseVisibility: admin_only and is_sensitive both true → admin", () => {
  assert.equal(
    platformBaseVisibility({ default_visibility: null, admin_only: true, is_sensitive: true }),
    "admin",
  );
});

test("platformBaseVisibility: show_in_public=true → public", () => {
  assert.equal(
    platformBaseVisibility({ default_visibility: null, show_in_public: true }),
    "public",
  );
});

test("platformBaseVisibility: default_visibility includes 'public' → public", () => {
  assert.equal(
    platformBaseVisibility({ default_visibility: ["public", "agency"] }),
    "public",
  );
});

test("platformBaseVisibility: show_in_public=false but default_visibility includes public → public", () => {
  assert.equal(
    platformBaseVisibility({ default_visibility: ["public"], show_in_public: false }),
    "public",
  );
});

test("platformBaseVisibility: default_visibility includes 'agency' (no public) → admin", () => {
  assert.equal(
    platformBaseVisibility({ default_visibility: ["agency"] }),
    "admin",
  );
});

test("platformBaseVisibility: default_visibility includes 'admin' (no public) → admin", () => {
  assert.equal(
    platformBaseVisibility({ default_visibility: ["admin"] }),
    "admin",
  );
});

test("platformBaseVisibility: default_visibility=['agency','admin'] → admin", () => {
  assert.equal(
    platformBaseVisibility({ default_visibility: ["agency", "admin"] }),
    "admin",
  );
});

test("platformBaseVisibility: empty default_visibility array → hidden", () => {
  assert.equal(
    platformBaseVisibility({ default_visibility: [] }),
    "hidden",
  );
});

test("platformBaseVisibility: null default_visibility, no show_in_public → hidden", () => {
  assert.equal(
    platformBaseVisibility({ default_visibility: null }),
    "hidden",
  );
});

test("platformBaseVisibility: undefined default_visibility → hidden", () => {
  assert.equal(
    platformBaseVisibility({ default_visibility: undefined }),
    "hidden",
  );
});

test("platformBaseVisibility: default_visibility=['private'] → hidden", () => {
  assert.equal(
    platformBaseVisibility({ default_visibility: ["private"] }),
    "hidden",
  );
});

test("platformBaseVisibility: show_in_public=false, no default_visibility → hidden", () => {
  assert.equal(
    platformBaseVisibility({ default_visibility: null, show_in_public: false }),
    "hidden",
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. effectiveFieldVisibility — no overrides (pass-through)
// ─────────────────────────────────────────────────────────────────────────────

test("effectiveFieldVisibility: no tenant, no value override → mirrors platformBase (public)", () => {
  assert.equal(
    effectiveFieldVisibility({ default_visibility: ["public"] }),
    "public",
  );
});

test("effectiveFieldVisibility: no tenant, no value override → mirrors platformBase (admin)", () => {
  assert.equal(
    effectiveFieldVisibility({ default_visibility: ["agency"] }),
    "admin",
  );
});

test("effectiveFieldVisibility: no tenant, no value override → mirrors platformBase (hidden)", () => {
  assert.equal(
    effectiveFieldVisibility({ default_visibility: [] }),
    "hidden",
  );
});

test("effectiveFieldVisibility: null tenant → same as absent tenant", () => {
  assert.equal(
    effectiveFieldVisibility({ default_visibility: ["public"] }, null),
    "public",
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. Tenant override — restrict only
// ─────────────────────────────────────────────────────────────────────────────

test("tenant admin_only_override=true restricts public→admin", () => {
  assert.equal(
    effectiveFieldVisibility(
      { default_visibility: ["public"] },
      { admin_only_override: true },
    ),
    "admin",
  );
});

test("tenant show_in_public_override=false restricts public→admin", () => {
  assert.equal(
    effectiveFieldVisibility(
      { default_visibility: ["public"] },
      { show_in_public_override: false },
    ),
    "admin",
  );
});

test("tenant default_visibility_override=[] (hidden) restricts public→hidden", () => {
  assert.equal(
    effectiveFieldVisibility(
      { default_visibility: ["public"] },
      { default_visibility_override: [] },
    ),
    "hidden",
  );
});

test("tenant default_visibility_override=['agency'] restricts public→admin", () => {
  assert.equal(
    effectiveFieldVisibility(
      { default_visibility: ["public"] },
      { default_visibility_override: ["agency"] },
    ),
    "admin",
  );
});

test("tenant cannot raise admin→public via show_in_public_override=true", () => {
  assert.equal(
    effectiveFieldVisibility(
      { default_visibility: ["agency"] },
      { show_in_public_override: true },
    ),
    "admin",
  );
});

test("tenant cannot raise hidden→public via show_in_public_override=true", () => {
  assert.equal(
    effectiveFieldVisibility(
      { default_visibility: [] },
      { show_in_public_override: true },
    ),
    "hidden",
  );
});

test("tenant show_in_public_override=true on a public field leaves it public", () => {
  assert.equal(
    effectiveFieldVisibility(
      { default_visibility: ["public"] },
      { show_in_public_override: true },
    ),
    "public",
  );
});

test("platform admin_only cannot be made public by tenant show_in_public_override=true", () => {
  assert.equal(
    effectiveFieldVisibility(
      { default_visibility: null, admin_only: true },
      { show_in_public_override: true },
    ),
    "admin",
  );
});

test("platform is_sensitive cannot be made public by tenant show_in_public_override=true", () => {
  assert.equal(
    effectiveFieldVisibility(
      { default_visibility: null, is_sensitive: true },
      { show_in_public_override: true },
    ),
    "admin",
  );
});

test("tenant admin_only_override on already-hidden field stays hidden (most-restrictive)", () => {
  assert.equal(
    effectiveFieldVisibility(
      { default_visibility: [] },
      { admin_only_override: true },
    ),
    "hidden",
  );
});

test("tenant: combined admin_only_override=true + show_in_public_override=false both agree → admin", () => {
  assert.equal(
    effectiveFieldVisibility(
      { default_visibility: ["public"] },
      { admin_only_override: true, show_in_public_override: false },
    ),
    "admin",
  );
});

test("tenant: admin_only_override=true + default_visibility_override=[] → hidden (most restrictive)", () => {
  assert.equal(
    effectiveFieldVisibility(
      { default_visibility: ["public"] },
      { admin_only_override: true, default_visibility_override: [] },
    ),
    "hidden",
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. Value override (talent-set) — narrow only
// ─────────────────────────────────────────────────────────────────────────────

test("value override ['agency'] narrows public→admin", () => {
  assert.equal(
    effectiveFieldVisibility(
      { default_visibility: ["public"] },
      null,
      ["agency"],
    ),
    "admin",
  );
});

test("value override [] (empty) leaves visibility unchanged (public stays public)", () => {
  assert.equal(
    effectiveFieldVisibility(
      { default_visibility: ["public"] },
      null,
      [],
    ),
    "public",
  );
});

test("value override [] (empty) leaves visibility unchanged (admin stays admin)", () => {
  assert.equal(
    effectiveFieldVisibility(
      { default_visibility: ["agency"] },
      null,
      [],
    ),
    "admin",
  );
});

test("value override null leaves visibility unchanged", () => {
  assert.equal(
    effectiveFieldVisibility(
      { default_visibility: ["public"] },
      null,
      null,
    ),
    "public",
  );
});

test("value override ['private'] narrows public→hidden", () => {
  assert.equal(
    effectiveFieldVisibility(
      { default_visibility: ["public"] },
      null,
      ["private"],
    ),
    "hidden",
  );
});

test("value override cannot raise admin→public", () => {
  assert.equal(
    effectiveFieldVisibility(
      { default_visibility: ["agency"] },
      null,
      ["public"],
    ),
    "admin",
  );
});

test("value override cannot raise hidden→public", () => {
  assert.equal(
    effectiveFieldVisibility(
      { default_visibility: [] },
      null,
      ["public"],
    ),
    "hidden",
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. Precedence — all three layers interact
// ─────────────────────────────────────────────────────────────────────────────

test("precedence: platform public → tenant restricts to admin → value override to hidden", () => {
  assert.equal(
    effectiveFieldVisibility(
      { default_visibility: ["public"] },
      { admin_only_override: true },
      [],
    ),
    "admin",
  );
});

test("precedence: platform public → tenant no-op → value restricts to admin", () => {
  assert.equal(
    effectiveFieldVisibility(
      { default_visibility: ["public"] },
      { show_in_public_override: true },
      ["agency"],
    ),
    "admin",
  );
});

test("precedence: platform public → tenant restricts to admin → value further restricts to hidden", () => {
  assert.equal(
    effectiveFieldVisibility(
      { default_visibility: ["public"] },
      { admin_only_override: true },
      ["private"],
    ),
    "hidden",
  );
});

test("platform floor re-applied: is_sensitive + tenant tries public + value tries public → admin", () => {
  assert.equal(
    effectiveFieldVisibility(
      { default_visibility: null, is_sensitive: true },
      { show_in_public_override: true },
      ["public"],
    ),
    "admin",
  );
});

test("platform floor re-applied: admin_only + default_visibility=['public'] → admin", () => {
  assert.equal(
    effectiveFieldVisibility(
      { default_visibility: ["public"], admin_only: true },
      null,
      null,
    ),
    "admin",
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. canViewerSee — every role × every visibility
// ─────────────────────────────────────────────────────────────────────────────

const roles: ViewerRole[] = ["public", "client", "talent", "manager", "agency_admin", "platform_admin"];

// public visibility
test("canViewerSee: public visibility — all roles can see", () => {
  for (const role of roles) {
    assert.equal(canViewerSee("public", role), true, `role=${role} should see public`);
  }
});

// admin visibility
test("canViewerSee: admin visibility — public role cannot see", () => {
  assert.equal(canViewerSee("admin", "public"), false);
});

test("canViewerSee: admin visibility — client cannot see", () => {
  assert.equal(canViewerSee("admin", "client"), false);
});

test("canViewerSee: admin visibility — talent CAN see (own field)", () => {
  assert.equal(canViewerSee("admin", "talent"), true);
});

test("canViewerSee: admin visibility — coordinator can see", () => {
  assert.equal(canViewerSee("admin", "manager"), true);
});

test("canViewerSee: admin visibility — agency_admin can see", () => {
  assert.equal(canViewerSee("admin", "agency_admin"), true);
});

test("canViewerSee: admin visibility — platform_admin can see", () => {
  assert.equal(canViewerSee("admin", "platform_admin"), true);
});

// hidden visibility
test("canViewerSee: hidden visibility — public role cannot see", () => {
  assert.equal(canViewerSee("hidden", "public"), false);
});

test("canViewerSee: hidden visibility — client cannot see", () => {
  assert.equal(canViewerSee("hidden", "client"), false);
});

test("canViewerSee: hidden visibility — talent cannot see", () => {
  assert.equal(canViewerSee("hidden", "talent"), false);
});

test("canViewerSee: hidden visibility — coordinator can see", () => {
  assert.equal(canViewerSee("hidden", "manager"), true);
});

test("canViewerSee: hidden visibility — agency_admin can see", () => {
  assert.equal(canViewerSee("hidden", "agency_admin"), true);
});

test("canViewerSee: hidden visibility — platform_admin can see", () => {
  assert.equal(canViewerSee("hidden", "platform_admin"), true);
});

// ─────────────────────────────────────────────────────────────────────────────
// 7. visibilityToOverrideColumns — round-trip shape
// ─────────────────────────────────────────────────────────────────────────────

test("visibilityToOverrideColumns: 'public' → correct columns", () => {
  assert.deepEqual(visibilityToOverrideColumns("public"), {
    show_in_public_override: true,
    admin_only_override: false,
    default_visibility_override: null,
  });
});

test("visibilityToOverrideColumns: 'admin' → correct columns", () => {
  assert.deepEqual(visibilityToOverrideColumns("admin"), {
    show_in_public_override: false,
    admin_only_override: true,
    default_visibility_override: null,
  });
});

test("visibilityToOverrideColumns: 'hidden' → correct columns", () => {
  assert.deepEqual(visibilityToOverrideColumns("hidden"), {
    show_in_public_override: false,
    admin_only_override: false,
    default_visibility_override: [],
  });
});

// Round-trip: visibilityToOverrideColumns → effectiveFieldVisibility
// For a public platform field, applying the override columns should produce
// the same visibility that was encoded.

test("round-trip: 'public' columns fed back as tenant override on public base → public", () => {
  const cols = visibilityToOverrideColumns("public");
  assert.equal(
    effectiveFieldVisibility({ default_visibility: ["public"] }, cols),
    "public",
  );
});

test("round-trip: 'admin' columns fed back as tenant override on public base → admin", () => {
  const cols = visibilityToOverrideColumns("admin");
  assert.equal(
    effectiveFieldVisibility({ default_visibility: ["public"] }, cols),
    "admin",
  );
});

test("round-trip: 'hidden' columns fed back as tenant override on public base → hidden", () => {
  const cols = visibilityToOverrideColumns("hidden");
  assert.equal(
    effectiveFieldVisibility({ default_visibility: ["public"] }, cols),
    "hidden",
  );
});

test("round-trip: 'public' columns on admin-floor field → admin (floor enforced)", () => {
  const cols = visibilityToOverrideColumns("public");
  assert.equal(
    effectiveFieldVisibility({ default_visibility: null, admin_only: true }, cols),
    "admin",
  );
});

test("round-trip: all three FieldVisibility values encode distinct column shapes", () => {
  const vis: FieldVisibility[] = ["public", "admin", "hidden"];
  const shapes = vis.map((v) => JSON.stringify(visibilityToOverrideColumns(v)));
  assert.equal(new Set(shapes).size, 3);
});
