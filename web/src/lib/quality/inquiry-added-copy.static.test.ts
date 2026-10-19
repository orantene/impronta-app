import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// TUL-1239: the profile button fills the INQUIRY shelf ("En tu solicitud"),
// a separate store from the "Guardados" favorites shelf. Its pressed label must
// not claim "saved to your list", or the two panels look like they disagree.
type Msgs = {
  public: {
    directory: {
      inquiry: { savedToInquiryCart: string };
      ui: { preview: { savedToCart: string } };
    };
  };
};

for (const [locale, expected] of [
  ["en", "Added to your inquiry"],
  ["es", "Añadido a tu solicitud"],
] as const) {
  test(`${locale}: pressed inquiry button says it joined the inquiry, not a saved list`, () => {
    const m = JSON.parse(readFileSync(`messages/${locale}.json`, "utf8")) as Msgs;
    assert.equal(m.public.directory.inquiry.savedToInquiryCart, expected);
    assert.equal(m.public.directory.ui.preview.savedToCart, expected);
  });
}
