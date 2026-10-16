/**
 * TUL-817: the platform-admin Health / Catalog / Revenue / Tenants screens
 * print plan names ONLY through the plan catalog (`catalogPlanLabel` /
 * `planCatalogLabel`). No local plan-name map, no hardcoded plan name.
 */
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { planCatalogLabel } from "./plan-catalog";

const ADMIN = join(process.cwd(), "src/app/(workspace)/platform/admin");
const SCREENS = ["commerce/health", "commerce/catalog", "commerce/revenue", "tenants"];

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return sourceFiles(p);
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [p] : [];
  });
}

const FILES = SCREENS.flatMap((s) => sourceFiles(join(ADMIN, s)));
const PLAN_NAMES = ["Free", "Gratis", "Pro", "Web Office", "Oficina Web", "Portfolio", "Portafolio", "Studio", "Agency", "Agencia", "Network", "Website", "Sitio web", "Legacy"];
const QUOTED_NAME = new RegExp(`(["'\`])(${PLAN_NAMES.join("|")})\\1`);

test("the screens exist (guard is not vacuous)", () => {
  assert.ok(FILES.length >= 20, `found ${FILES.length} files`);
});

test("no hardcoded plan display name in the four screens", () => {
  for (const f of FILES) {
    const code = readFileSync(f, "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
    const hit = code.match(QUOTED_NAME);
    assert.equal(hit, null, `${f} hardcodes plan name ${hit?.[0]}`);
  }
});

test("no local plan-label map or raw catalog name read (only hq-kit's deprecated export may define one)", () => {
  for (const f of FILES) {
    const code = readFileSync(f, "utf8");
    const isKit = f.endsWith("tenants/hq-kit.tsx");
    if (!isKit) assert.doesNotMatch(code, /PLAN_TIER_LABEL_KEY|PLAN_TIER_LABEL\b|planTierLabel\(/, f);
    assert.doesNotMatch(code, /PLAN_CATALOG\[[^\]]+\]\??\.displayName/, f);
  }
});

test("catalog labels: aliases and locales", () => {
  assert.equal(planCatalogLabel("max", "en"), "Web Office");
  assert.equal(planCatalogLabel("talent_portfolio", "es"), "Oficina Web");
  assert.equal(planCatalogLabel("hub", "en"), "Network");
  assert.equal(planCatalogLabel("free", "es"), "Gratis");
  assert.equal(planCatalogLabel("agency", "es"), "Agencia");
  assert.equal(planCatalogLabel("pro", "en"), "Pro");
  assert.equal(planCatalogLabel("mystery", "en"), "mystery");
});
