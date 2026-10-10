/**
 * TUL-121 design polish leftover: ES talent footer must not show bare English
 * "Cookies" (loanword). EN keeps Cookies; the Tulala group carries ownership.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { buildSocketModel } from "./footer-socket";

function model(locale: string) {
  return buildSocketModel({
    locale,
    publicPathPrefix: "",
    supportedLocales: [locale],
    showCredit: true,
    whitelabel: false,
    consentTooling: false,
  });
}

test("ES cookies footer label is Política de cookies, not the English loanword", () => {
  const es = model("es").tulalaLinks.find((l) => l.key === "tulala-cookies")!;
  const en = model("en").tulalaLinks.find((l) => l.key === "tulala-cookies")!;
  assert.equal(es.label, "Política de cookies");
  assert.equal(en.label, "Cookies");
  assert.notEqual(es.label, "Cookies");
  assert.match(es.href, /\/es\/legal\/cookies$/);
  assert.match(en.href, /\/legal\/cookies$/);
});
