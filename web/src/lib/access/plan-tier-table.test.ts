/**
 * TUL-839: the plan catalog encodes the approved tier table exactly.
 * Table-driven: one row per tier, every field asserted.
 */
import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import { getPlan, planDisplayNameFor, planLabel, type PlanKey } from "./plan-catalog";
import { APPROVED_TIER_TABLE, allTierFeatures, tierFeatureBullets, tierRow } from "./plan-tier-table";
import { hasEntitlement } from "./talent-entitlements";
import { CAPABILITY_KEYS } from "./capabilities";
import { getPricingLaddersCopy, pricingTierFeatured, pricingTierName } from "../marketing/pricing-ladders-copy";

const ENV = "TALENT_FREE_WEBSITE_ENABLED";
const saved = process.env[ENV];
afterEach(() => {
  if (saved === undefined) delete process.env[ENV];
  else process.env[ENV] = saved;
});

type Expected = {
  plan: PlanKey;
  en: string;
  es: string;
  monthly: number;
  yearly: number;
  popular: boolean;
  features: string[];
};

const APPROVED: Expected[] = [
  {
    plan: "talent_basic", en: "Free", es: "Gratis", monthly: 0, yearly: 0, popular: false,
    features: ["live_site", "services_catalog", "booking", "chat", "payments", "subdomain", "basic_seo"],
  },
  {
    plan: "talent_pro", en: "Pro", es: "Pro", monthly: 900, yearly: 9000, popular: false,
    features: ["no_badge", "premium_themes", "social_links", "reviews_showcase", "basic_stats"],
  },
  {
    plan: "talent_portfolio", en: "Web Office", es: "Oficina Web", monthly: 1500, yearly: 15000, popular: true,
    features: ["sections", "page_seo", "custom_domain", "instagram_feed", "premium_apps", "ai_assistant", "advanced_stats"],
  },
  {
    plan: "studio", en: "Studio", es: "Studio", monthly: 2900, yearly: 29000, popular: false,
    features: ["team_seats", "shared_calendar", "roster", "branded_login", "priority_support"],
  },
  {
    plan: "agency", en: "Agency", es: "Agencia", monthly: 7900, yearly: 79000, popular: false,
    features: ["business_site", "managed_talents", "directory_listing", "higher_ai", "admin_roles"],
  },
];

describe("TUL-839 approved tier table", () => {
  it("the table has exactly the approved tiers, in order", () => {
    assert.deepEqual(APPROVED_TIER_TABLE.map((r) => r.planKey), APPROVED.map((r) => r.plan));
  });

  for (const row of APPROVED) {
    it(`${row.plan}: name, price, interval, popular flag, features`, () => {
      process.env[ENV] = "true";
      const def = getPlan(row.plan);
      assert.equal(planDisplayNameFor(row.plan, "en"), row.en);
      assert.equal(planDisplayNameFor(row.plan, "es-MX"), row.es);
      assert.equal(def.monthlyPriceCents, row.monthly, "monthly");
      assert.equal(def.annualPriceCents, row.yearly, "yearly");
      assert.equal(def.annualPriceCents, (def.monthlyPriceCents ?? 0) * 10, "yearly == 10x monthly");
      assert.equal(def.currency, "USD");
      const tr = tierRow(row.plan);
      assert.ok(tr);
      assert.equal(tr.mostPopular, row.popular);
      assert.deepEqual(tr.features.map((f) => f.id), row.features);
      for (const f of tr.features) {
        assert.ok(f.en.length > 0 && f.es.length > 0, `${f.id} has EN + ES`);
        assert.doesNotMatch(f.en + f.es, /—/, `${f.id} has no em dash`);
      }
    });
  }

  it("exactly one tier is most popular (Web Office)", () => {
    assert.deepEqual(APPROVED_TIER_TABLE.filter((r) => r.mostPopular).map((r) => r.planKey), ["talent_portfolio"]);
  });

  it("each talent plan holds every gated feature it sells (own + included)", () => {
    process.env[ENV] = "true";
    for (const plan of ["talent_basic", "talent_pro", "talent_portfolio"] as const) {
      for (const f of allTierFeatures(plan)) {
        if (f.gate.kind !== "talent") continue;
        assert.equal(hasEntitlement(plan, f.gate.key, "site"), true, `${plan} should have ${f.gate.key}`);
      }
    }
  });

  it("a lower talent plan does not get a higher tier's gated features", () => {
    process.env[ENV] = "true";
    // Known over-grant kept on purpose: existing Pro subscribers already have
    // paid AI credits; withdrawing them is a pricing call, not a catalog edit.
    const KNOWN_OVER_GRANT = new Set(["talent_pro ai.paidCredits"]);
    const ladder = ["talent_basic", "talent_pro", "talent_portfolio"] as const;
    ladder.forEach((lower, i) => {
      for (const higher of ladder.slice(i + 1)) {
        for (const f of tierRow(higher)?.features ?? []) {
          if (f.gate.kind !== "talent") continue;
          const key = f.gate.key;
          if (allTierFeatures(lower).some((g) => g.gate.kind === "talent" && g.gate.key === key)) continue;
          if (KNOWN_OVER_GRANT.has(`${lower} ${key}`)) continue;
          assert.equal(hasEntitlement(lower, key, "site"), false, `${lower} must not have ${key}`);
        }
      }
    });
  });

  it("every workspace gate names a registered capability", () => {
    for (const r of APPROVED_TIER_TABLE) {
      for (const f of r.features) {
        if (f.gate.kind === "workspace") assert.ok(CAPABILITY_KEYS.includes(f.gate.key), f.gate.key);
      }
    }
  });

  it("social links: Pro and Web Office, never Free (DEC-17)", () => {
    assert.equal(hasEntitlement("talent_basic", "profile.socialLinks"), false);
    assert.equal(hasEntitlement("talent_pro", "profile.socialLinks"), true);
    assert.equal(hasEntitlement("talent_portfolio", "profile.socialLinks"), true);
  });

  it("planLabel reads the catalog and passes unknown keys through", () => {
    process.env[ENV] = "true";
    assert.equal(planLabel("talent_portfolio", "es"), "Oficina Web");
    delete process.env[ENV];
    assert.equal(planLabel("talent_portfolio", "es"), "Portafolio");
    assert.equal(planLabel("agency"), "Agency");
    assert.equal(planLabel("enterprise_x"), "enterprise_x");
    assert.equal(planLabel(null), "");
  });
});

describe("TUL-839 /pricing reads the catalog", () => {
  it("card bullets are the catalog features (EN + ES)", () => {
    process.env[ENV] = "true";
    for (const locale of ["en", "es"]) {
      const c = getPricingLaddersCopy(locale);
      const name = (k: PlanKey) => planDisplayNameFor(k, locale);
      assert.deepEqual(c.talent.free.bullets, tierFeatureBullets("talent_basic", locale, name));
      assert.deepEqual(c.talent.pro.bullets, tierFeatureBullets("talent_pro", locale, name));
      assert.deepEqual(c.talent.max.bullets, tierFeatureBullets("talent_portfolio", locale, name));
      assert.deepEqual(c.workspace.studio.bullets, tierFeatureBullets("studio", locale, name));
      assert.deepEqual(c.workspace.agency.bullets, tierFeatureBullets("agency", locale, name));
    }
    assert.equal(getPricingLaddersCopy("es").talent.max.bullets[0], "Todo lo de Pro");
    assert.equal(getPricingLaddersCopy("en").workspace.studio.bullets[0], "Everything in Web Office");
  });

  it("card names and the popular flag come from the catalog", () => {
    process.env[ENV] = "true";
    assert.equal(pricingTierName("talent", "max", "Portfolio", "es"), "Oficina Web");
    assert.equal(pricingTierName("talent", "free", "Free", "es"), "Gratis");
    assert.equal(pricingTierName("workspace", "agency", "Business", "en"), "Agency");
    assert.equal(pricingTierName("workspace", "hub", "Hub", "en"), "Network");
    assert.equal(pricingTierFeatured("talent", "max", false), true);
    assert.equal(pricingTierFeatured("workspace", "studio", true), false);
    assert.equal(pricingTierFeatured("workspace", "unknown", true), true);
  });
});
