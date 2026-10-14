import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

import { PLAN_CATALOG } from "@/lib/access/plan-catalog";

import {
  buildUpgradeCheckoutHref,
  buildUpgradeOffer,
  formatCatalogPrice,
  isUpgradeFeature,
  normalizeUpgradeLocale,
  planForFeature,
  TALENT_UPGRADE_PLAN_KEY,
  UPGRADE_FEATURES,
} from "./upgrade-modal-model";
import {
  claimUpgradeHost,
  getUpgradeSnapshot,
  showUpgradeModal,
  closeUpgrade,
} from "./upgrade-store";

const SRC = join(__dirname, "..", "..", "..");
const read = (rel: string) => readFileSync(join(SRC, rel), "utf8");

describe("TUL-829 upgrade modal model", () => {
  it("every paywall feature is unlocked by the Web Office plan", () => {
    for (const f of UPGRADE_FEATURES) assert.equal(planForFeature(f), "talent_portfolio");
    assert.equal(TALENT_UPGRADE_PLAN_KEY, "talent_portfolio");
  });

  it("reads the price from the catalog for each interval (no math)", () => {
    const plan = PLAN_CATALOG.talent_portfolio;
    const m = buildUpgradeOffer({ feature: "apps", interval: "m", locale: "en" });
    const y = buildUpgradeOffer({ feature: "apps", interval: "y", locale: "en" });
    assert.equal(m.priceLabel, formatCatalogPrice(plan.monthlyPriceCents, plan.currency, "en"));
    assert.equal(y.priceLabel, formatCatalogPrice(plan.annualPriceCents, plan.currency, "en"));
    assert.equal(m.periodLabel, "/ mo");
    assert.equal(y.periodLabel, "/ yr");
  });

  it("ES copy says Mejorar a Oficina Web; EN says Upgrade to Web Office", () => {
    const es = buildUpgradeOffer({ feature: "custom-domain", interval: "m", locale: "es" });
    const en = buildUpgradeOffer({ feature: "custom-domain", interval: "m", locale: "en" });
    assert.equal(es.ctaLabel, "Mejorar a Oficina Web");
    assert.equal(en.ctaLabel, "Upgrade to Web Office");
    assert.match(es.title, /dominio/);
    assert.ok(es.benefits.length >= 3 && en.benefits.length === es.benefits.length);
  });

  it("a server-resolved plan label wins over the default", () => {
    const o = buildUpgradeOffer({ feature: "apps", interval: "m", locale: "en", planLabel: "Portfolio" });
    assert.equal(o.ctaLabel, "Upgrade to Portfolio");
  });

  it("user-facing copy has no em dashes", () => {
    for (const locale of ["es", "en"] as const) {
      for (const f of UPGRADE_FEATURES) {
        const o = buildUpgradeOffer({ feature: f, interval: "y", locale });
        const all = [o.title, o.subtitle, o.ctaLabel, o.notNowLabel, ...o.benefits].join(" ");
        assert.ok(!all.includes("\u2014"), `${locale}/${f} has an em dash`);
      }
    }
  });

  it("checkout href is the /pricing mock with plan, interval and from", () => {
    const href = buildUpgradeCheckoutHref({ planKey: "talent_portfolio", interval: "y", from: "custom-domain-row" });
    assert.equal(href, "/pricing?plan=talent_portfolio&interval=y&from=custom-domain-row");
  });

  it("locale + feature guards", () => {
    assert.equal(normalizeUpgradeLocale("es-MX"), "es");
    assert.equal(normalizeUpgradeLocale(undefined), "en");
    assert.ok(isUpgradeFeature("apps"));
    assert.ok(!isUpgradeFeature("nope"));
  });
});

describe("TUL-829 upgrade store", () => {
  it("openUpgrade returns false with no host, true once a host is mounted", () => {
    assert.equal(showUpgradeModal({ feature: "apps", from: "t" }), false);
    const { release } = claimUpgradeHost();
    assert.equal(showUpgradeModal({ feature: "apps", from: "t" }), true);
    assert.deepEqual(getUpgradeSnapshot().request, { feature: "apps", from: "t" });
    closeUpgrade();
    assert.equal(getUpgradeSnapshot().request, null);
    release();
    assert.equal(showUpgradeModal({ feature: "apps", from: "t" }), false);
  });

  it("only the first mounted host renders (no double modal)", () => {
    const a = claimUpgradeHost();
    const b = claimUpgradeHost();
    assert.equal(getUpgradeSnapshot().leader, a.id);
    a.release();
    assert.equal(getUpgradeSnapshot().leader, b.id);
    b.release();
    assert.equal(getUpgradeSnapshot().leader, null);
  });
});

describe("TUL-829 wiring", () => {
  it("one adapter named startUpgradeCheckout is the only checkout entry", () => {
    const adapter = read("components/talent/upgrade/start-upgrade-checkout.ts");
    assert.match(adapter, /export function startUpgradeCheckout\(/);
    assert.match(adapter, /buildUpgradeCheckoutHref/);
    const modal = read("components/talent/upgrade/TalentUpgradeModal.tsx");
    assert.match(modal, /startUpgradeCheckout\(/);
    assert.match(modal, /DialogContent/);
  });

  it("the host is mounted in the shell and the builder mount", () => {
    assert.match(read("components/admin/shell/internal/shell-upgrade-modal.tsx"), /<TalentUpgradeModalHost\s*\/>/);
    assert.match(read("components/talent/site/TalentMaxBuilderMount.tsx"), /<TalentUpgradeModalHost\s*\/>/);
  });

  it("top paywalls call openUpgrade instead of dead-ending", () => {
    const row = read("components/talent/site/CustomDomainRow.tsx");
    assert.match(row, /openUpgrade\(\{\s*feature: "custom-domain"/);
    const mount = read("components/talent/site/TalentMaxBuilderMount.tsx");
    assert.match(mount, /openUpgrade\(\{\s*feature: "extra-sections"/);
    assert.doesNotMatch(mount, /window\.location\.assign\("\/talent\/settings"\)/);
    const tiles = read("components/admin/shell/internal/talent/shared/profile-sections-2.tsx");
    for (const f of ["media-embeds", "press-band", "media-kit", "custom-domain", "extra-sections"]) {
      assert.match(tiles, new RegExp(`openUpgrade\\(\\{ feature: "${f}"`), `profile tile ${f}`);
    }
  });
});
