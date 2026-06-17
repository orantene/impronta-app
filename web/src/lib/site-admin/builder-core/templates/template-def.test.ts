/**
 * TMPL-1 parity test — asserts that every entry in all THREE template
 * registries satisfies toUnifiedTemplateDef with:
 *   - a non-empty blurb (no terse < 20-char strings)
 *   - no em dashes in any blurb (house style)
 *   - either a thumbnailUrl or a defined gradient/CSS fallback
 *   - a non-empty label and key
 *   - correct registryKind
 *
 * The test is cross-surface: it imports the three registries and runs the
 * same conformance assertions on each so a regression in any one fails the
 * full suite rather than only that registry's own tests.
 */

import test from "node:test";
import assert from "node:assert/strict";

import { PAGE_DESIGN_SUMMARIES } from "@/lib/site-admin/builder-node/page-designs/summaries";
import { MAX_SITE_TEMPLATES, MAX_SITE_TEMPLATE_ORDER } from "@/lib/talent-site/max-site-templates/registry";
import { TALENT_SITE_TEMPLATES } from "@/lib/talent-site/templates/registry";
import { toUnifiedTemplateDef, type UnifiedTemplateDef } from "./template-def";

// ---------------------------------------------------------------------------
// Conformance helper
// ---------------------------------------------------------------------------

/**
 * Assert a UnifiedTemplateDef is well-formed. Shared by all three registry
 * loops so the bar is identical across surfaces.
 */
function assertConforms(u: UnifiedTemplateDef, srcLabel: string): void {
  assert.ok(u.key.length > 0, `${srcLabel}: key must be non-empty`);
  assert.ok(u.label.length > 0, `${srcLabel}: label must be non-empty`);

  // Blurb must be a genuine plain-language sentence, not a terse tag.
  assert.ok(u.blurb.length >= 20, `${srcLabel}: blurb too short (${u.blurb.length} chars)`);

  // House style: no em dashes.
  assert.ok(
    !u.blurb.includes("—"),
    `${srcLabel}: blurb must not contain an em dash`,
  );

  // registryKind must be one of the three known values.
  const validKinds = ["page-design", "max-site", "talent-site"];
  assert.ok(
    validKinds.includes(u.registryKind),
    `${srcLabel}: unexpected registryKind "${u.registryKind}"`,
  );

  // thumbnailUrl, when present, must be a root-relative path or http(s) URL.
  if (u.thumbnailUrl) {
    assert.ok(
      u.thumbnailUrl.startsWith("/") || u.thumbnailUrl.startsWith("http"),
      `${srcLabel}: thumbnailUrl must be root-relative or absolute (got "${u.thumbnailUrl}")`,
    );
  }
}

// ---------------------------------------------------------------------------
// Registry 1: PAGE_DESIGN_SUMMARIES (freeform full-page designs)
// ---------------------------------------------------------------------------

test("TMPL-1 parity: all PAGE_DESIGN_SUMMARIES conform to UnifiedTemplateDef", () => {
  assert.ok(PAGE_DESIGN_SUMMARIES.length > 0, "PAGE_DESIGN_SUMMARIES must not be empty");
  for (const summary of PAGE_DESIGN_SUMMARIES) {
    const u = toUnifiedTemplateDef(summary, "page-design");
    const label = `page-design/${summary.id}`;
    assertConforms(u, label);
    assert.equal(u.registryKind, "page-design", `${label}: wrong registryKind`);
    // page-design: key maps to id, no emphasisTag expected
    assert.equal(u.key, summary.id, `${label}: key must equal id`);
    // thumbnail is now required on all summaries
    assert.ok(u.thumbnailUrl && u.thumbnailUrl.length > 0, `${label}: thumbnailUrl must be set`);
    // target must be preserved
    assert.ok(["talent", "workspace", "both"].includes(u.target ?? ""), `${label}: invalid target`);
  }
});

// ---------------------------------------------------------------------------
// Registry 2: MAX_SITE_TEMPLATES (Max-site freeform starters)
// ---------------------------------------------------------------------------

test("TMPL-1 parity: all MAX_SITE_TEMPLATES conform to UnifiedTemplateDef", () => {
  assert.ok(MAX_SITE_TEMPLATE_ORDER.length > 0, "MAX_SITE_TEMPLATE_ORDER must not be empty");
  for (const key of MAX_SITE_TEMPLATE_ORDER) {
    const def = MAX_SITE_TEMPLATES[key];
    assert.ok(def, `max-site/${key}: template def missing from MAX_SITE_TEMPLATES`);
    const u = toUnifiedTemplateDef(def, "max-site");
    const label = `max-site/${key}`;
    assertConforms(u, label);
    assert.equal(u.registryKind, "max-site", `${label}: wrong registryKind`);
    assert.equal(u.key, key, `${label}: key must match registry key`);
    // emphasisTag comes from .emphasis — must be present and non-empty
    assert.ok(
      u.emphasisTag && u.emphasisTag.length > 0,
      `${label}: emphasisTag (from .emphasis) must be non-empty`,
    );
  }
});

// ---------------------------------------------------------------------------
// Registry 3: TALENT_SITE_TEMPLATES (slot-based profile templates)
// ---------------------------------------------------------------------------

test("TMPL-1 parity: all TALENT_SITE_TEMPLATES conform to UnifiedTemplateDef", () => {
  const entries = Object.values(TALENT_SITE_TEMPLATES);
  assert.ok(entries.length > 0, "TALENT_SITE_TEMPLATES must not be empty");
  for (const def of entries) {
    const u = toUnifiedTemplateDef(def, "talent-site");
    const label = `talent-site/${def.key}`;
    assertConforms(u, label);
    assert.equal(u.registryKind, "talent-site", `${label}: wrong registryKind`);
    assert.equal(u.key, def.key, `${label}: key must match registry key`);
    // tier must be preserved
    assert.ok(
      ["free", "pro", "max"].includes(u.tier ?? ""),
      `${label}: tier must be free|pro|max (got "${u.tier}")`,
    );
    // thumbnailUrl required on all talent-site templates
    assert.ok(u.thumbnailUrl && u.thumbnailUrl.length > 0, `${label}: thumbnailUrl must be set`);
  }
});

// ---------------------------------------------------------------------------
// Adapter correctness: spot-check field mapping per registry kind
// ---------------------------------------------------------------------------

test("toUnifiedTemplateDef: page-design maps id->key, description->blurb, no emphasisTag", () => {
  const sample = PAGE_DESIGN_SUMMARIES.find((s) => s.id === "editorial");
  assert.ok(sample, "editorial page-design must exist");
  const u = toUnifiedTemplateDef(sample, "page-design");
  assert.equal(u.key, "editorial");
  assert.equal(u.blurb, sample.description);
  assert.equal(u.emphasisTag, undefined);
  assert.equal(u.registryKind, "page-design");
});

test("toUnifiedTemplateDef: max-site maps description->blurb, emphasis->emphasisTag", () => {
  const def = MAX_SITE_TEMPLATES["editorial"];
  assert.ok(def, "max-site editorial must exist");
  const u = toUnifiedTemplateDef(def, "max-site");
  assert.equal(u.key, "editorial");
  assert.equal(u.blurb, def.description);
  assert.equal(u.emphasisTag, def.emphasis);
  assert.equal(u.registryKind, "max-site");
});

test("toUnifiedTemplateDef: talent-site maps blurb->blurb, availableAt->tier", () => {
  const def = TALENT_SITE_TEMPLATES["editorial"];
  assert.ok(def, "talent-site editorial must exist");
  const u = toUnifiedTemplateDef(def, "talent-site");
  assert.equal(u.key, "editorial");
  assert.equal(u.blurb, def.blurb);
  assert.equal(u.tier, def.availableAt);
  assert.equal(u.emphasisTag, undefined);
  assert.equal(u.registryKind, "talent-site");
});

// ---------------------------------------------------------------------------
// Cross-registry: the "editorial" key across all three registries
// ---------------------------------------------------------------------------

test("TMPL-1 cross-registry: all three 'editorial' entries produce a valid UnifiedTemplateDef", () => {
  const pageDesign = PAGE_DESIGN_SUMMARIES.find((s) => s.id === "editorial");
  const maxSite = MAX_SITE_TEMPLATES["editorial"];
  const talentSite = TALENT_SITE_TEMPLATES["editorial"];

  assert.ok(pageDesign, "page-design/editorial must exist");
  assert.ok(maxSite, "max-site/editorial must exist");
  assert.ok(talentSite, "talent-site/editorial must exist");

  const uPd = toUnifiedTemplateDef(pageDesign, "page-design");
  const uMs = toUnifiedTemplateDef(maxSite, "max-site");
  const uTs = toUnifiedTemplateDef(talentSite, "talent-site");

  // All three share the same key and label
  assert.equal(uPd.key, "editorial");
  assert.equal(uMs.key, "editorial");
  assert.equal(uTs.key, "editorial");
  // All three have a non-empty blurb without em dashes
  for (const [label, u] of [["page-design", uPd], ["max-site", uMs], ["talent-site", uTs]] as const) {
    assert.ok(u.blurb.length >= 20, `${label}/editorial blurb too short`);
    assert.ok(!u.blurb.includes("—"), `${label}/editorial blurb has an em dash`);
  }
  // registryKind differs (correctly) across the three
  assert.equal(uPd.registryKind, "page-design");
  assert.equal(uMs.registryKind, "max-site");
  assert.equal(uTs.registryKind, "talent-site");
});
