import { test } from "node:test";
import assert from "node:assert/strict";

import {
  LABEL_TO_CAPABILITY,
  auditCapabilityClaims,
  classifyCapabilityClaim,
  unknownMappedCapabilities,
  findUnbuiltClaims,
} from "./plan-claim-audit";
import { entitlementKey } from "@/lib/access/plan-capabilities";
import type { CompareRowClaim } from "./enforced-plan-facts";

const row = (
  tierSlug: string,
  label: string,
  included: boolean,
): CompareRowClaim => ({ tierSlug, label, valueText: null, included });

/** The six rows as they stand in production: three capabilities, free+studio. */
const PRODUCTION_ENTITLEMENTS = new Map<string, boolean>([
  [entitlementKey("free", "manage_agency_domains"), false],
  [entitlementKey("studio", "manage_agency_domains"), false],
  [entitlementKey("free", "agency.site_admin.design.publish"), false],
  [entitlementKey("studio", "agency.site_admin.design.publish"), false],
  [entitlementKey("free", "agency.pitch.manage"), false],
  [entitlementKey("studio", "agency.pitch.manage"), false],
]);

test("every mapped label points at a capability that exists", () => {
  // A mapping onto a key the registry does not have would resolve fail-open
  // forever: the guard would pass while checking nothing.
  assert.deepEqual(unknownMappedCapabilities(), []);
});

test("withholding what the table withholds agrees", () => {
  const v = classifyCapabilityClaim(
    row("free", "Custom domain", false),
    PRODUCTION_ENTITLEMENTS,
  );
  assert.equal(v.kind, "agrees");
});

test("offering what the table withholds is an overclaim", () => {
  const v = classifyCapabilityClaim(
    row("studio", "Custom domain", true),
    PRODUCTION_ENTITLEMENTS,
  );
  assert.equal(v.kind, "overclaims");
  assert.match(v.kind === "overclaims" ? v.detail : "", /withholds/);
});

test("withholding what nothing withholds is selling air", () => {
  // Agency has no row, so the capability is granted by fail-open. A compare
  // row that denies it promises an upgrade that buys nothing.
  const v = classifyCapabilityClaim(
    row("agency", "Custom domain", false),
    PRODUCTION_ENTITLEMENTS,
  );
  assert.equal(v.kind, "sells_air");
  assert.match(v.kind === "sells_air" ? v.detail : "", /missing row means granted/);
});

test("an EMPTY entitlement map grants everything, so every denial sells air", () => {
  // This is the state the table shipped in, and it must not read as a failure
  // of the loader. Everything is granted; only denials are wrong.
  const empty = new Map<string, boolean>();
  assert.equal(
    classifyCapabilityClaim(row("free", "Custom domain", true), empty).kind,
    "agrees",
  );
  assert.equal(
    classifyCapabilityClaim(row("free", "Custom domain", false), empty).kind,
    "sells_air",
  );
});

test("an unmapped label is UNBACKED, never a pass", () => {
  const v = classifyCapabilityClaim(
    row("free", "Bulk watermark apply", false),
    PRODUCTION_ENTITLEMENTS,
  );
  assert.equal(v.kind, "unbacked");
});

test("an unknown tier slug is unbacked rather than silently skipped", () => {
  const v = classifyCapabilityClaim(
    row("enterprise", "Custom domain", false),
    PRODUCTION_ENTITLEMENTS,
  );
  assert.equal(v.kind, "unbacked");
});

test("the audit keeps agrees, contradictions and unbacked separate", () => {
  // The separation is the load-bearing part: a row nobody can check must never
  // be counted alongside a row that passed.
  const audit = auditCapabilityClaims(
    [
      row("free", "Custom domain", false), // agrees
      row("agency", "Custom domain", false), // sells air
      row("free", "Bulk watermark apply", false), // unbacked
      row("studio", "Photo usage tracking", false), // unbacked
    ],
    PRODUCTION_ENTITLEMENTS,
  );

  assert.equal(audit.agrees.length, 1);
  assert.equal(audit.contradictions.length, 1);
  assert.equal(audit.unbacked.length, 2);

  // And the three buckets must account for every row, so nothing is dropped.
  assert.equal(
    audit.agrees.length + audit.contradictions.length + audit.unbacked.length,
    4,
  );
});

test("the label map is lowercased, or lookups silently miss", () => {
  for (const label of Object.keys(LABEL_TO_CAPABILITY)) {
    assert.equal(label, label.toLowerCase(), `${label} must be lowercased`);
  }
});

test("an unbuilt feature is caught in a LABEL", () => {
  const found = findUnbuiltClaims([row("hub", "SSO (SAML, Google, Okta)", true)]);
  assert.equal(found.length, 1);
  assert.match(found[0].why, /no SSO implementation/);
});

test("an unbuilt feature is caught in a VALUE, which is where it actually shipped", () => {
  // "API access" was a value_text, not a label. A label-only guard misses it.
  const found = findUnbuiltClaims([
    { tierSlug: "hub", label: "Data export", valueText: "API access", included: true },
  ]);
  assert.equal(found.length, 1);
  assert.match(found[0].why, /no public API surface/);
});

test("a real feature with no unbuilt claim passes", () => {
  const found = findUnbuiltClaims([
    { tierSlug: "hub", label: "Data export", valueText: null, included: true },
    row("free", "Workspace media gallery", true),
  ]);
  assert.deepEqual(found, []);
});

test("the patterns do not fire on innocent words containing the letters", () => {
  // "Bossom", "Sokta" etc. must not match: the patterns are word-bounded.
  const found = findUnbuiltClaims([
    row("free", "Cross-sell bundles", true),
    { tierSlug: "free", label: "Analytics", valueText: "Basic", included: true },
  ]);
  assert.deepEqual(found, []);
});
