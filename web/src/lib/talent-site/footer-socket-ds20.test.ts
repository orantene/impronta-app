/**
 * DS-20 (TUL-121 design polish): platform privacy/terms labels name Tulala so
 * the strip never shows two identical "Privacidad" / "Privacy" links.
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

test("DS-20: site privacy stays short; Tulala privacy/terms carry Tulala in the label", () => {
  const es = model("es");
  const en = model("en");
  const esPrivacy = es.siteLinks.find((l) => l.key === "privacy")!;
  const esTulalaPrivacy = es.tulalaLinks.find((l) => l.key === "tulala-privacy")!;
  const esTulalaTerms = es.tulalaLinks.find((l) => l.key === "tulala-terms")!;
  assert.equal(esPrivacy.label, "Privacidad");
  assert.equal(esTulalaPrivacy.label, "Privacidad Tulala");
  assert.equal(esTulalaTerms.label, "Términos Tulala");
  assert.notEqual(esPrivacy.label, esTulalaPrivacy.label);

  const enPrivacy = en.siteLinks.find((l) => l.key === "privacy")!;
  const enTulalaPrivacy = en.tulalaLinks.find((l) => l.key === "tulala-privacy")!;
  const enTulalaTerms = en.tulalaLinks.find((l) => l.key === "tulala-terms")!;
  assert.equal(enPrivacy.label, "Privacy");
  assert.equal(enTulalaPrivacy.label, "Tulala privacy");
  assert.equal(enTulalaTerms.label, "Tulala terms");
  assert.notEqual(enPrivacy.label, enTulalaPrivacy.label);

  const esLabels = [...es.siteLinks, ...es.tulalaLinks].map((l) => l.label);
  assert.equal(esLabels.filter((l) => l === "Privacidad").length, 1);
  assert.equal(esLabels.includes("Términos"), false);
});
