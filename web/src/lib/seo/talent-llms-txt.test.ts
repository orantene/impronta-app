import assert from "node:assert/strict";
import { TALENT_MAX_PLAN_KEY } from "@/lib/talent-site/resolve-max-site-core";
import { test } from "node:test";
import { decideLlmsRoute, isTalentLlmsEligible, buildTalentLlmsTxt, talentServicePriceText } from "./talent-llms-txt";
import { isTalentSiteHostPathAllowed } from "@/lib/saas/talent-site-host-routing";

const base = new URL("https://jorge.tulala.digital");
const live = {
  deletedAt: null,
  isPubliclyHidden: false,
  profileKind: "talent",
  isDemo: false,
  sitePublishedAt: "2026-10-01T00:00:00Z",
  planKey: TALENT_MAX_PLAN_KEY,
};

test("builder lists name, trade, city, services, languages and booking link", () => {
  const txt = buildTalentLlmsTxt(base, {
    name: "Jorgelina",
    trade: "Nail artist",
    city: "Cancun",
    languages: ["Spanish", "English"],
    services: [
      { title: "Gel set", priceText: "from $900 MXN" },
      { title: "Bridal trial", priceText: "Price on request" },
    ],
  });
  assert.match(txt, /^# Jorgelina\n/);
  assert.ok(txt.includes("Nail artist"));
  assert.ok(txt.includes("Cancun"));
  assert.ok(txt.includes("- Gel set: from $900 MXN"));
  assert.ok(txt.includes("Spanish, English"));
  assert.ok(txt.includes("https://jorge.tulala.digital/"));
  assert.equal(txt.includes("—"), false);
});

test("builder omits empty sections instead of inventing them", () => {
  const txt = buildTalentLlmsTxt(base, { name: "A", trade: null, city: null, languages: [], services: [] });
  assert.equal(txt.includes("Services"), false);
  assert.equal(txt.includes("Languages"), false);
});

test("price text follows the display mode", () => {
  const s = { amountCents: 90000, currency: "MXN" };
  assert.equal(talentServicePriceText({ ...s, priceDisplay: "quote" }), "Price on request");
  assert.equal(talentServicePriceText({ amountCents: null, currency: "MXN", priceDisplay: "exact" }), "Price on request");
  assert.ok(talentServicePriceText({ ...s, priceDisplay: "from" }).startsWith("from "));
  assert.ok(!talentServicePriceText({ ...s, priceDisplay: "exact" }).startsWith("from "));
});

test("only a live, published, real talent is eligible", () => {
  assert.equal(isTalentLlmsEligible(live), true);
  assert.equal(isTalentLlmsEligible({ ...live, sitePublishedAt: null }), false);
  assert.equal(isTalentLlmsEligible({ ...live, isPubliclyHidden: true }), false);
  assert.equal(isTalentLlmsEligible({ ...live, deletedAt: "2026-01-01" }), false);
  assert.equal(isTalentLlmsEligible({ ...live, isDemo: true }), false);
  assert.equal(isTalentLlmsEligible({ ...live, profileKind: "resource" }), false);
  assert.equal(isTalentLlmsEligible({ ...live, planKey: null }), false);
});

test("/llms.txt passes through the talent host allow-list", () => {
  assert.deepEqual(isTalentSiteHostPathAllowed("/llms.txt"), { kind: "passthrough" });
});

test("route decision: marketing and talent hosts only, never unknown or spoofed", () => {
  const h = (kind: string, ctx: string | null, id: string | null) =>
    decideLlmsRoute({ kind, hostContextHeader: ctx, talentProfileHeader: id });
  assert.deepEqual(h("marketing", null, null), { route: "marketing" });
  assert.deepEqual(h("talent_site", "talent_site", "p1"), { route: "talent", talentProfileId: "p1" });
  assert.deepEqual(h("talent_site", "talent_site", null), { route: "not_found" });
  assert.deepEqual(h("talent_site", "app", "p1"), { route: "not_found" });
  for (const k of ["agency", "hub", "app", "unknown"]) assert.deepEqual(h(k, null, "p1"), { route: "not_found" });
});
