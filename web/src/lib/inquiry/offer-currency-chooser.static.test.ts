import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const rd = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");

describe("484: an unresolved offer currency asks for one instead of dead-ending", () => {
  it("createOfferAction returns a typed refusal the UI can localize", () => {
    const a = rd("../../app/(workspace)/[tenantSlug]/admin/_pipeline-actions.ts");
    assert.match(a, /error: OFFER_CURRENCY_UNRESOLVED_MESSAGE, code: "offer_currency_unresolved"/);
    assert.match(rd("../../app/(workspace)/[tenantSlug]/admin/_pipeline-types.ts"), /code\?: "offer_currency_unresolved"/);
  });

  it("Start drafting shows an MXN / USD chooser and retries with the chosen currency", () => {
    const b = rd("../../components/admin/shell/internal/messages/shared/machinery-11.tsx");
    const btn = b.slice(b.indexOf("export function CreateOfferButton"));
    assert.match(btn, /r\.code === "offer_currency_unresolved"[\s\S]{0,60}setChooseCurrency\(true\)/);
    assert.match(btn, /\["MXN", "USD"\]/);
    assert.match(btn, /createOfferAction\(effectiveTenant\.slug, inquiryId, currencyCode\)/);
    // The English server string is never the toast for this case.
    assert.ok(btn.indexOf("offer_currency_unresolved") < btn.indexOf("startOfferFailed"));
  });

  it("the chooser prompt exists in en and es", () => {
    for (const l of ["en", "es"]) {
      assert.match(rd(`../../../messages/${l}.json`), /"offerCurrencyChoose": "/);
    }
  });
});
