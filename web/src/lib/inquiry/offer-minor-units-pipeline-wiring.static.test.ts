/**
 * Pins TUL-353: _pipeline-actions booking revenue + offer total convert via
 * offer-minor-units (currency divisor), never a hard-coded `* 100`.
 * Run: node --require ./scripts/register-server-only-test.cjs --import tsx --test src/lib/inquiry/offer-minor-units-pipeline-wiring.static.test.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { WEB_ROOT } from "../quality/supabase-unchecked-read";

const read = (rel: string) => readFileSync(join(WEB_ROOT, rel), "utf8");

describe("pipeline-actions minor-unit wiring", () => {
  it("booking revenue and offer total use tryMajorToMinor, not bare * 100", () => {
    const src = read("src/app/(workspace)/[tenantSlug]/admin/_pipeline-actions.ts");
    assert.match(src, /from ["']@\/lib\/inquiry\/offer-minor-units["']/);
    assert.match(src, /tryMajorToMinor\(Number\(rawRevenue\), bookingCurrency\)/);
    assert.match(
      src,
      /tryMajorToMinor\(\s*Number\(booking\.total_client_revenue\),\s*booking\.currency_code as string \| null,\s*\)/,
    );
    assert.match(
      src,
      /tryMajorToMinor\(\s*Number\(offer\.total_client_price \?\? 0\),\s*offer\.currency_code,\s*\)/,
    );
    assert.doesNotMatch(src, /Number\(rawRevenue\) \* 100/);
    assert.doesNotMatch(src, /Number\(booking\.total_client_revenue\) \* 100/);
    assert.doesNotMatch(src, /Number\(offer\.total_client_price \?\? 0\) \* 100/);
    assert.match(src, /offer_currency_unreadable/);
  });
});
