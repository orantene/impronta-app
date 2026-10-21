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

// TUL-1239 (build 3 re-fail): the empty "Guardados" shelf must point at the inquiry shelf when
// something was added there, in both locales, and the lineup view must pick it by inquiryCount.
for (const locale of ["en", "es"] as const) {
  test(`${locale}: empty favorites note names the inquiry shelf`, () => {
    const m = JSON.parse(readFileSync(`messages/${locale}.json`, "utf8")) as { public: { guestChat: Record<string, string> } };
    assert.ok(m.public.guestChat.dockLineupEmptySavedInInquiry);
    assert.notEqual(m.public.guestChat.dockLineupEmptySavedInInquiry, m.public.guestChat.dockLineupEmptySaved);
  });
}

test("lineup view swaps the empty favorites note when the inquiry shelf has talent", () => {
  const src = readFileSync("src/app/t/[profileCode]/_chat/GuestDockLineupView.tsx", "utf8");
  assert.match(src, /inquiryCount > 0\s*\?\s*t\("public\.guestChat\.dockLineupEmptySavedInInquiry"\)/);
});
