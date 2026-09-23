import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { PLAN_CATALOG } from "./plan-catalog";
import {
  TALENT_TIER_CATALOG,
  TALENT_TIER_META,
  TALENT_PAGE_TEMPLATES,
} from "@/components/admin/shell/internal/state/fixtures";

/**
 * Pro fold + Web Office rename (Phase 1.C, 2026-09-23, decision-log L45
 * reversal). Founder decision: one paid talent tier, sold and shown
 * everywhere as "Web Office". "Pro" and "Portfolio" ("Max" internally)
 * never render as a TIER label again.
 *
 * WHAT THIS DOES NOT COVER
 * ─────────────────────────
 * "Portfolio" and "Pro" are also ordinary English words used for things
 * that are NOT the talent subscription tier — a photo tagged "Portfolio"
 * (`PHOTO_TAG_META`), a "media portfolio" section, a template literally
 * named "portfolio", the grandfathered-but-unrendered `pro`/`Portfolio`
 * catalog column values, and comments narrating this very fold. Those are
 * deliberately out of scope; this file only pins down the specific plan
 * metadata and component strings the Phase 1.C sweep touched.
 *
 * A remaining, larger sweep (talent-drawers.tsx, TalentMaxSiteManager.tsx,
 * TalentPageBuilderScreen.tsx, and the rest of dashboard-i18n.ts's ES_TEXT
 * dictionary) is tracked separately — those files are owned by other
 * workstreams and are not scanned here.
 */

test("plan-catalog: talent_pro is folded (invisible, not self-serve), key/price/rank untouched", () => {
  const pro = PLAN_CATALOG.talent_pro;
  assert.equal(pro.isVisible, false);
  assert.equal(pro.isSelfServe, false);
  assert.equal(pro.key, "talent_pro");
  assert.equal(pro.monthlyPriceCents, 900);
  assert.equal(pro.rank, 1);
});

test("plan-catalog: talent_portfolio is displayed as Web Office, key/price/rank untouched", () => {
  const portfolio = PLAN_CATALOG.talent_portfolio;
  assert.equal(portfolio.displayName, "Web Office");
  assert.equal(portfolio.key, "talent_portfolio");
  assert.equal(portfolio.monthlyPriceCents, 1500);
  assert.equal(portfolio.rank, 2);
  assert.notEqual(portfolio.displayName, "Portfolio");
  assert.notEqual(portfolio.displayName, "Max");
});

test("fixtures: TALENT_TIER_META.max is labelled Web Office, never Portfolio/Max/Pro", () => {
  assert.equal(TALENT_TIER_META.max.label, "Web Office");
  for (const forbidden of ["Portfolio", "Max", "Pro"]) {
    assert.notEqual(TALENT_TIER_META.max.label, forbidden);
  }
});

test("fixtures: no TALENT_TIER_CATALOG row unlocks at the folded pro tier", () => {
  for (const row of TALENT_TIER_CATALOG) {
    if (row.unlockedAt) {
      assert.notEqual(
        row.unlockedAt,
        "pro",
        `row "${row.label}" still unlocks at "pro" — the Pro fold requires "max"`,
      );
    }
  }
});

test("fixtures: no TALENT_PAGE_TEMPLATES entry is gated behind the folded pro tier", () => {
  for (const tpl of TALENT_PAGE_TEMPLATES) {
    assert.notEqual(
      tpl.availableAt,
      "pro",
      `template "${tpl.id}" is still gated at "pro" — the Pro fold requires "max"`,
    );
  }
});

test("fixtures: the discovery plan-badge cell reads Web Office, not Portfolio", () => {
  const badgeRow = TALENT_TIER_CATALOG.find((r) => r.label === "Plan badge on cards & inquiries");
  assert.ok(badgeRow, "expected the plan-badge row to still exist in the catalog");
  assert.equal(badgeRow!.max, "Web Office badge");
});

/**
 * Scoped source scan — the exact set of Phase 1.C component files, checked
 * for the JSX-visible tier-label literals a talent could actually read.
 * Excludes comments (which legitimately narrate the fold using the old
 * names) by only failing on the rendered patterns below.
 */
const WEB_ROOT = join(__dirname, "../../..");
const SCANNED_FILES = [
  "src/components/admin/shell/internal/talent-drawers/premium-pages.tsx",
  "src/components/talent/site/TalentSiteLockedCard.tsx",
  "src/components/talent/site/TalentSiteAppearancesPanel.tsx",
  "src/components/talent/site/TalentSiteDomainPanel.tsx",
];

/** Rendered-label patterns that must never appear again in the scanned files. */
const FORBIDDEN_RENDER_PATTERNS: RegExp[] = [
  />\s*Portfolio\s*</,
  /label\s*=\s*["'`]Portfolio["'`]/,
  /Upgrade to Max\b/,
  /Upgrade to Portfolio\b/,
  /\ba Max feature\b/i,
];

test("scoped scan: Phase 1.C files never render Portfolio/Max as the paid-tier label", () => {
  for (const relPath of SCANNED_FILES) {
    const source = readFileSync(join(WEB_ROOT, relPath), "utf8");
    for (const pattern of FORBIDDEN_RENDER_PATTERNS) {
      assert.equal(
        pattern.test(source),
        false,
        `${relPath} matches forbidden pattern ${pattern} — Pro fold requires "Web Office"`,
      );
    }
  }
});
