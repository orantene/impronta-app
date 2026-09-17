import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { buildCriticPrompt, checkHeadlineBank, headlineSimilarity, parseCriticReply, retryInstruction } from "./copy-critic";

const facts = {
  businessName: "Parrilla El Paisa",
  city: "Cancún",
  tagline: null,
  familyLabel: "dining",
  typeLabel: { es: "Parrilla argentina", en: "Argentine grill" },
  audience: null,
  tone: null,
  differentiator: null,
  description: null,
  services: ["Parrilla", "Empanadas"],
};

describe("headline bank", () => {
  test("the bake-off's generic line fails even with an empty bank", () => {
    const problems = checkHeadlineBank({ "home.offer.headline": { es: "Hecho con cariño, para ti", en: "Sabor que se comparte" } }, []);
    assert.equal(problems.length, 1);
    assert.match(problems[0].reason, /generic headline \(es\)/);
  });

  test("a headline another site carries fails; a fresh one passes", () => {
    const bank = ["Sabor que se comparte", "Pretty hands, pretty feet"];
    assert.equal(checkHeadlineBank({ "home.offer.headline": { es: "Sabor que se comparte", en: "Flavor to share" } }, bank).length, 1);
    assert.equal(checkHeadlineBank({ "home.offer.headline": { es: "El sabor que se comparte", en: "Flavor to share" } }, bank).length, 1, "near-duplicate");
    assert.equal(checkHeadlineBank({ "home.offer.headline": { es: "Parrilla argentina en Cancún", en: "Argentine grill in Cancún" } }, bank).length, 0);
  });

  test("similarity ignores accents, case and short words", () => {
    assert.equal(headlineSimilarity("Sabor que se comparte", "sabor que se COMPARTE"), 1);
    assert.ok(headlineSimilarity("Sabor que se comparte", "Uñas bonitas en Tulum") < 0.2);
  });
});

describe("model half", () => {
  test("prompt carries the facts and every copy line", () => {
    const p = buildCriticPrompt({ copy: { "about.body": { es: "Asado los domingos", en: "Sunday asado" } }, facts, primaryLocale: "es" });
    assert.match(p.userMessage, /services: Parrilla; Empanadas/);
    assert.match(p.userMessage, /about\.body: es="Asado los domingos"/);
    assert.match(p.systemPrompt, /Do not rewrite anything/);
  });

  test("reply parsing: fenced JSON, missing list, garbage", () => {
    assert.deepEqual(parseCriticReply('```json\n{"problems":[{"key":"about.body","reason":"mentions delivery"}]}\n```'), [{ key: "about.body", reason: "mentions delivery" }]);
    assert.deepEqual(parseCriticReply('{"problems":[]}'), []);
    assert.equal(parseCriticReply('{"nope":1}'), null);
    assert.equal(parseCriticReply("not json"), null);
    assert.equal(parseCriticReply(null), null);
  });

  test("retry instruction lists the problems and the headlines to avoid", () => {
    const text = retryInstruction([{ key: "home.offer.headline", reason: "generic" }], ["Sabor que se comparte"]);
    assert.match(text, /- home\.offer\.headline: generic/);
    assert.match(text, /- Sabor que se comparte/);
  });
});
