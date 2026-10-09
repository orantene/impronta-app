import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { blankOffering } from "./offerings-types";

const rd = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");

describe("a new service takes the talent's currency (never a silent USD)", () => {
  it("a blank service is created in the currency it is given", () => {
    assert.equal(blankOffering({ kind: "talent", talentProfileId: "t1" }, "MXN", 0).currency, "MXN");
    assert.equal(blankOffering({ kind: "talent", talentProfileId: "t1" }, "USD", 0).currency, "USD");
  });

  it("the editor builds every new service from the talent's own default (loaded server side)", () => {
    const hook = rd("../../components/talent/services/use-offerings-editor.ts");
    assert.match(hook, /setDefaultCurrency\(res\.defaultCurrency\)/);
    assert.match(hook, /blankOffering\(stableOwner, defaultCurrency, items\.length\)/);
    const load = rd("./offerings-actions.ts");
    assert.match(load, /defaultCurrency: auth\.defaultCurrency/);
    assert.match(rd("./offerings-auth.server.ts"), /defaultCurrency: resolveDefaultCurrencyForUI\(tp\.default_currency\)/);
  });

  it("the currency stays visible in the editor even for 'Contact for price' (it prices the quotes she sends)", () => {
    const ui = rd("../../components/talent/services/TalentOfferingsManager.tsx");
    assert.match(ui, /\{!showAmount && \([\s\S]{0,400}data-service-currency/);
    assert.match(ui, /data-service-currency[\s\S]{0,600}onPatch\(\{ currency: e\.target\.value \}\)/);
  });

  it("changing the default never rewrites her services; it says how many keep another currency", () => {
    const act = rd("../../app/(workspace)/[tenantSlug]/talent/settings/actions.ts");
    assert.match(act, /\.neq\("currency", normalized\)/);
    assert.match(act, /return \{ ok: true, otherCurrencyServices \}/);
    // No write to talent_offerings in this action: the count is a head-only read.
    const fn = act.slice(act.indexOf("export async function updateTalentDefaultCurrency"));
    assert.doesNotMatch(fn.slice(0, fn.indexOf("function backToTalentSettings")), /from\("talent_offerings"\)\s*\.(update|insert|upsert|delete)/);
    const card = rd("../../app/(workspace)/[tenantSlug]/talent/settings/DefaultCurrencyCard.tsx");
    assert.match(card, /setOtherCurrencyServices\(res\.otherCurrencyServices\)/);
    assert.match(card, /href="\/talent\/services"/);
  });

  it("the new strings have Spanish", () => {
    const es = rd("../../components/admin/shell/internal/dashboard-i18n-money-home.ts");
    assert.ok(es.includes('"Open Services": "Abrir Servicios"'));
    assert.ok(es.includes("Los servicios nuevos usarán esta moneda."));
  });
});
