import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

import { PLAN_CATALOG } from "@/lib/access/plan-catalog";
import { parsePlanIntent } from "@/lib/onboarding/plan-intent";

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

  it("TUL-1821: trial line only when a trial applies; USD note always", () => {
    const none = buildUpgradeOffer({ feature: "apps", interval: "m", locale: "es" });
    assert.equal(none.trialLabel, null);
    const es = buildUpgradeOffer({ feature: "apps", interval: "m", locale: "es", trialDays: 14 });
    const en = buildUpgradeOffer({ feature: "apps", interval: "m", locale: "en", trialDays: 14 });
    assert.equal(es.trialLabel, "Incluye 14 días de prueba gratis");
    assert.equal(en.trialLabel, "Includes a 14-day free trial");
    assert.match(es.chargeNote, /Se cobra en USD; Stripe puede mostrar tu moneda local/);
    assert.match(en.chargeNote, /Billed in USD/);
    assert.equal(buildUpgradeOffer({ feature: "apps", interval: "m", locale: "en", trialDays: 0 }).trialLabel, null);
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

  it("checkout href is /talent/plan with plan, interval=month|year and from (BILL-B)", () => {
    assert.equal(
      buildUpgradeCheckoutHref({ planKey: "talent_portfolio", interval: "y", from: "custom-domain-row" }),
      "/talent/plan?plan=talent_portfolio&interval=year&from=custom-domain-row",
    );
    assert.equal(
      buildUpgradeCheckoutHref({ planKey: "talent_portfolio", interval: "m", from: "apps" }),
      "/talent/plan?plan=talent_portfolio&interval=month&from=apps",
    );
    assert.equal(
      buildUpgradeCheckoutHref({ planKey: "talent_pro", interval: "y", from: "" }),
      "/talent/plan?plan=talent_pro&interval=year&from=unknown",
    );
    assert.equal(
      buildUpgradeCheckoutHref({ planKey: "talent_pro", interval: "m", from: "x" }),
      "/talent/plan?plan=talent_pro&interval=month&from=x",
    );
  });

  it("the CTA href round-trips through plan-intent with the chosen plan and interval (BILL-B)", () => {
    for (const planKey of ["talent_pro", "talent_portfolio"] as const) {
      for (const interval of ["m", "y"] as const) {
        const href = buildUpgradeCheckoutHref({ planKey, interval, from: "t" });
        const sp = new URL(href, "https://app.example").searchParams;
        assert.equal(new URL(href, "https://app.example").pathname, "/talent/plan");
        assert.deepEqual(parsePlanIntent(sp.get("plan"), sp.get("interval")), {
          plan: planKey,
          interval: interval === "y" ? "year" : "month",
        });
      }
    }
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
    assert.match(read("components/admin/shell/internal/shell-upgrade-modal.tsx"), /<TalentUpgradeModalHost\b/);
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

describe("TUL-829 remaining paywalls", () => {
  it("settings plan card, Instagram and locked site dashboard open the modal", () => {
    const settings = read("components/admin/shell/internal/talent/pages/SettingsPage.tsx");
    assert.match(settings, /onUpgrade=\{\(\) => openUpgrade\(\{ feature: "generic", from: "settings-plan-card"/);
    assert.match(settings, /<TalentInstagramCard onUpgrade=\{\(\) => openUpgrade\(/);
    assert.doesNotMatch(settings, /onUpgrade=\{\(\) => openDrawer\("talent-tier-compare"\)\}/);
    const dash = read("components/talent/site/TalentSiteDashboardClient.tsx");
    assert.match(dash, /openUpgrade\(\{ feature: "generic", from: "site-dashboard-locked"/);
  });

  it("the modal keeps a secondary compare-all-plans link wired to the drawer, ES + EN", () => {
    const es = buildUpgradeOffer({ feature: "apps", interval: "m", locale: "es" });
    const en = buildUpgradeOffer({ feature: "apps", interval: "m", locale: "en" });
    assert.equal(es.compareAllLabel, "Ver todos los planes");
    assert.equal(en.compareAllLabel, "Compare all plans");
    assert.match(read("components/talent/upgrade/TalentUpgradeModal.tsx"), /offer\.compareAllLabel/);
    assert.match(
      read("components/admin/shell/internal/shell-upgrade-modal.tsx"),
      /onCompareAll=\{\(\) => openDrawer\("talent-tier-compare"\)\}/,
    );
  });
});
