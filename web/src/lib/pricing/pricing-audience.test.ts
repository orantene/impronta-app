import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { parsePricingAudience } from "./pricing-audience";
import { getPricingLaddersCopy } from "@/lib/marketing/pricing-ladders-copy";

const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");

test("TUL-1192: ?for= picks the audience tab, person is the default", () => {
  assert.equal(parsePricingAudience("business"), "business");
  assert.equal(parsePricingAudience("person"), "person");
  assert.equal(parsePricingAudience("talent"), "person");
  assert.equal(parsePricingAudience(undefined), "person");
  assert.equal(parsePricingAudience("nope"), "person");
});

test("TUL-1192: tab and tooltip copy in EN + ES, no em dashes", () => {
  for (const loc of ["en", "es"]) {
    const c = getPricingLaddersCopy(loc);
    assert.ok(c.audience.tablist.length > 0, loc);
    assert.ok(c.audience.approxTip.length > 0, loc);
    assert.ok(c.audience.infoLabel.length > 0, loc);
    assert.doesNotMatch(JSON.stringify(c.audience), /—/);
  }
  assert.notEqual(
    getPricingLaddersCopy("es").audience.tablist,
    getPricingLaddersCopy("en").audience.tablist,
  );
});

test("TUL-1192: ladders render inside accessible audience tabs, one CTA per card", () => {
  const tabs = read("src/components/marketing/pricing-audience-tabs.tsx");
  assert.match(tabs, /role="tablist"/);
  assert.match(tabs, /role="tab"/);
  assert.match(tabs, /role="tabpanel"/);
  assert.match(tabs, /searchParams\.set\("for"/);
  assert.match(tabs, /min-h-11/);
  assert.doesNotMatch(tabs, /\$\d|MX\$/);
  const section = read("src/components/marketing/pricing-ladders-section.tsx");
  assert.match(section, /<PricingAudienceTabs/);
  assert.match(section, /initialAudience=\{[\s\S]*audience[\s\S]*\}/);
  assert.equal(section.match(/<MarketingCta\b/g)?.length, 1);
  assert.match(section, /<InfoTip/);
  assert.match(
    read("src/app/(marketing)/pricing/page.tsx"),
    /parsePricingAudience\(resolved\.for\)/,
  );
});
