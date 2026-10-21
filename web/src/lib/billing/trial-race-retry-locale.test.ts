/**
 * TUL-1412: the free-trial "try again" refusal for a parallel checkout must
 * reach the buyer in the active locale. EN text is unchanged.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { TRIAL_RACE_RETRY_ERROR, trialRaceRetryError } from "./trial-session-reconcile";

const EN = "Another checkout was opened at the same time. Please try again.";
const ES = "Se abrió otro pago al mismo tiempo. Inténtalo de nuevo.";

describe("trial race retry message locale", () => {
  it("EN is unchanged, and is the default", () => {
    assert.equal(TRIAL_RACE_RETRY_ERROR, EN);
    assert.equal(trialRaceRetryError("en"), EN);
    assert.equal(trialRaceRetryError(undefined), EN);
    assert.equal(trialRaceRetryError(null), EN);
  });
  it("ES (and es-MX) gets the Spanish text with no em dash", () => {
    assert.equal(trialRaceRetryError("es"), ES);
    assert.equal(trialRaceRetryError("es-MX"), ES);
    assert.doesNotMatch(ES, /—/);
  });
  for (const file of ["talent-billing.ts", "workspace-billing.ts"]) {
    it(`${file} threads the locale into the reconcile`, () => {
      const src = readFileSync(new URL(`../stripe/${file}`, import.meta.url), "utf8");
      assert.match(src, /reconcileTrialSession\([^\n]*locale: opts\.locale/, file);
    });
  }
});
