import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const rd = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");
const panel = rd("../../components/admin/shell/internal/talent/agenda/SendQuotePanel.tsx");

describe("a quote that cannot be priced says why and where to fix it (never a guessed currency)", () => {
  it("both send paths keep the server's reason instead of dropping it", () => {
    assert.equal((panel.match(/setFailReason\(res\.ok \? null/g) ?? []).length, 2);
  });

  it("offer_currency_unresolved shows the actionable message with a link to Services", () => {
    assert.match(panel, /!sent && failReason === "offer_currency_unresolved"/);
    assert.match(panel, /href="\/talent\/services"/);
    for (const key of ["This service has no usable currency, so the quote could not be priced.", "Set the service's currency in Services", ", then send the quote again."]) {
      assert.ok(panel.includes(key), `panel uses "${key}"`);
    }
  });

  it("every new string has Spanish", () => {
    const es = rd("../../components/admin/shell/internal/dashboard-i18n-quote.ts");
    for (const key of ["This service has no usable currency, so the quote could not be priced.", "Set the service's currency in Services", ", then send the quote again."]) {
      assert.ok(es.includes(`"${key}"`), `ES for "${key}"`);
    }
  });

  it("the server still refuses with the typed reason and never defaults a currency", () => {
    const q = rd("../server-actions/messaging-talent-quote.ts");
    assert.match(q, /created\.reason === "offer_currency_unresolved"\) return fail\("offer_currency_unresolved"\)/);
    assert.match(q, /currencyCode: offering\.currency/);
  });
});
