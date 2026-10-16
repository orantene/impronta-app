import test from "node:test";
import assert from "node:assert/strict";

import { looksLikeAccountHandle, resolveGreetingName } from "./greeting-name";

test("qa onboarding handles are not person names", () => {
  assert.equal(looksLikeAccountHandle("qa-onb-choice-studio-desktop-baffsd"), true);
  assert.equal(looksLikeAccountHandle("qa-onb-choice-both-phone-bgiuem"), true);
  assert.equal(looksLikeAccountHandle("mariana@example.com"), true);
});

test("real people and businesses are accepted", () => {
  assert.equal(looksLikeAccountHandle("Mariana Cruz"), false);
  assert.equal(looksLikeAccountHandle("Estudio R6S"), false);
  assert.equal(looksLikeAccountHandle("Nia"), false);
});

test("greeting prefers the first name, then the business name", () => {
  assert.equal(
    resolveGreetingName({ personName: "Mariana Cruz", businessName: "Uñas Mariana" }),
    "Mariana",
  );
  assert.equal(
    resolveGreetingName({
      personName: "qa-onb-choice-studio-desktop-baffsd",
      businessName: "Estudio R6S",
    }),
    "Estudio R6S",
  );
  assert.equal(
    resolveGreetingName({ personName: "qa-onb-x", businessName: "qa-onb-y" }),
    null,
  );
});
