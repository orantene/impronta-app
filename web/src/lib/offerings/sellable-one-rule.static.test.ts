/**
 * D1 (TUL-1268 item 1): there is ONE "can this be sold" rule, `src/lib/offerings/sellable.ts`.
 * This ratchet fails when a NEW inline status / moderation / visibility sell check appears outside it.
 *
 * It counts inline moderation_state compares, `.eq("moderation_state"` / `.eq("visibility", "public")`
 * filters and `visibility === "agency_only"` compares per non-test source file. The BASELINE below is
 * what is left that is NOT a sell decision (admin editor chips, talent PROFILE visibility, directory
 * and sitemap listing of profiles, workspace menu board, cms). The count may go DOWN (update the
 * baseline) and may never go up, and a file not listed here may not gain a check. To sell, show or
 * quote an offering, call `sellability(row, ctx)` / `isSellable` / `scopeToSellableOfferings`.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { test } from "node:test";

const require = createRequire(import.meta.url);
const { scan } = require(join(process.cwd(), "scripts/d1-scan-sellable.cjs")) as { scan: (root: string) => Record<string, number> };

const BASELINE: Record<string, number> = {
  "src/app/api/directory/preview/[talentId]/route.ts": 1,
  "src/app/sitemap.ts": 2,
  "src/app/t/[profileCode]/_light/ServiceMenuBlock.tsx": 1,
  "src/app/t/[profileCode]/opengraph-image.tsx": 1,
  "src/app/t/[profileCode]/profile-view.tsx": 1,
  "src/components/admin/shell/internal/page-modules/catalog/catalog-model.ts": 1,
  "src/components/admin/shell/internal/page-modules/catalog/item-tab-channels.tsx": 1,
  "src/components/talent/services/ItemStateChips.tsx": 1,
  "src/lib/cms/posts-public.ts": 1,
  "src/lib/directory/apply-directory-field-facet-filters.ts": 1,
  "src/lib/directory/directory-filter-sections.ts": 1,
  "src/lib/directory/price-from.ts": 2,
  "src/lib/embed/roster-data.ts": 1,
  "src/lib/events/schedule/public-loader.ts": 1,
  "src/lib/events/schedule/staff-store.ts": 2,
  "src/lib/pitch/pitch-engine.ts": 1,
  "src/lib/seo/talent-json-ld.ts": 1,
  "src/lib/server-actions/admin-roster-rates.ts": 2,
  "src/lib/site-admin/builder-node/portfolio-sources.ts": 1,
  "src/lib/site-admin/server/native-data-block-sources.ts": 2,
  "src/lib/talent/offerings-public.ts": 1,
  "src/lib/talent-site/server/load-starter-data.ts": 1,
  "src/lib/talent-site/service-page.ts": 1,
};

test("no new inline sell check outside the one sellable module", () => {
  const found = scan(process.cwd());
  const grew: string[] = [];
  for (const [file, n] of Object.entries(found)) {
    const allowed = BASELINE[file] ?? 0;
    if (n > allowed) grew.push(`${file}: ${n} inline checks (allowed ${allowed}). Use sellability() / isSellable() / scopeToSellableOfferings() from @/lib/offerings/sellable.`);
  }
  assert.deepEqual(grew, []);
});

test("the baseline only lists files that still have a check (shrink it when you remove one)", () => {
  const found = scan(process.cwd());
  const stale = Object.keys(BASELINE).filter((f) => !(f in found));
  assert.deepEqual(stale, [], "remove these from BASELINE: they no longer have an inline check");
});

test("the sellable module is pure: no imports, so a client component can use it", () => {
  const src = readFileSync(join(process.cwd(), "src/lib/offerings/sellable.ts"), "utf8");
  assert.doesNotMatch(src, /^import\s/m);
  assert.doesNotMatch(src, /server-only/);
});

test("the old guest-sellable names are thin wrappers over the one rule", () => {
  const src = readFileSync(join(process.cwd(), "src/lib/offerings/guest-sellable.ts"), "utf8");
  assert.match(src, /from "\.\/sellable"/);
  assert.doesNotMatch(src, /moderation_state\s*===/);
});
