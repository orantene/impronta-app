import assert from "node:assert/strict";
import test from "node:test";

import { footerLocaleToggleShown, showCardLocaleToggle } from "./card-locale-toggle";

const tenant = { supportedLocales: ["en", "es"], defaultLocale: "en", showLanguageSwitcher: true } as const;

test("platform hosts have no footer toggle, so the card shows one", () => {
  for (const hostKind of ["app", "marketing", "unknown"]) {
    assert.equal(footerLocaleToggleShown({ hostKind, ...tenant }), false);
    assert.equal(showCardLocaleToggle({ hostKind }), true);
  }
});

test("agency and hub hosts with a switcher keep the footer toggle only", () => {
  for (const hostKind of ["agency", "hub"]) {
    assert.equal(showCardLocaleToggle({ hostKind, ...tenant }), false);
  }
});

test("an agency host with the switcher off or one language gets the card toggle", () => {
  assert.equal(showCardLocaleToggle({ hostKind: "agency", ...tenant, showLanguageSwitcher: false }), true);
  assert.equal(
    showCardLocaleToggle({ hostKind: "agency", supportedLocales: ["en"], defaultLocale: "en", showLanguageSwitcher: true }),
    true,
  );
});

test("exactly one toggle shows in every case", () => {
  for (const hostKind of ["app", "marketing", "agency", "hub"]) {
    const i = { hostKind, ...tenant };
    assert.notEqual(footerLocaleToggleShown(i), showCardLocaleToggle(i));
  }
});
