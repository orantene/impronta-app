import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

import { buildRobots, isNonProductionDeploy } from "./robots-rules";

const base = new URL("https://x.staging.tulala.digital");

test("TUL-857: non-production deploys disallow everything on indexable kinds", () => {
  for (const kind of ["marketing", "agency", "talent_site"]) {
    const r = buildRobots(kind, base, { nonProduction: true });
    assert.deepEqual(r.rules, [{ userAgent: "*", disallow: "/" }]);
    assert.equal(r.sitemap, undefined);
  }
});

test("TUL-857: production behaviour unchanged", () => {
  assert.equal(buildRobots("talent_site", base, { nonProduction: false }).sitemap, "https://x.staging.tulala.digital/sitemap.xml");
  assert.equal(isNonProductionDeploy("production"), false);
  assert.equal(isNonProductionDeploy(undefined), false);
  assert.equal(isNonProductionDeploy("preview"), true);
});

const cfg = readFileSync(path.join(process.cwd(), "next.config.ts"), "utf8");

test("TUL-895: vercel.live is allowed only through the preview gate", () => {
  assert.match(cfg, /isPreviewDeploy \? "https:\/\/vercel\.live" : ""/);
});

test("TUL-857: preview deploys send X-Robots-Tag noindex", () => {
  assert.match(cfg, /isPreviewDeploy[\s\S]{0,200}X-Robots-Tag/);
});

test("TUL-925: commerce tab paths redirect to the tab query", () => {
  assert.match(cfg, /commerce\/:tab\(health\|catalog\|discounts\|revenue\|commission\|entitlements\)/);
});
