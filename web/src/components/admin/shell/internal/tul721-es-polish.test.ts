import { test } from "node:test";
import assert from "node:assert/strict";

import { riskScoreCopy } from "./primitives/risk-score-copy";
import { localizeAgeLabel } from "./notification-localize";
import { translateDashboardText } from "./dashboard-i18n";

// TUL-721: EXP8 admin Spanish polish.
test("risk score pill words and label read in Spanish", () => {
  assert.equal(riskScoreCopy(80, true).word, "saludable");
  assert.equal(riskScoreCopy(50, true).word, "con atención");
  assert.equal(riskScoreCopy(10, true).word, "revisar");
  assert.equal(riskScoreCopy(80, false).word, "healthy");
  assert.equal(riskScoreCopy(80, true).label, "Confianza");
});

test("a server-built '6h ago' age reads in Spanish when no timestamp exists", () => {
  assert.equal(localizeAgeLabel("6h ago", "es"), "hace 6 h");
  assert.equal(localizeAgeLabel("2d ago", "es"), "hace 2 d");
  assert.equal(localizeAgeLabel("just now", "es"), "ahora");
  assert.equal(localizeAgeLabel("6h ago", "en"), "6h ago");
  assert.equal(localizeAgeLabel("Mar 3", "es"), "Mar 3");
});

test("passkey card and the offer hint have Spanish copy", () => {
  for (const s of [
    "Sign in with passkey",
    "Set up a passkey",
    "Remove passkey",
    "Sign in to test",
    "Waiting for biometrics…",
    "Open the Offer tab to continue.",
  ]) {
    assert.notEqual(translateDashboardText(s, "es"), s, s);
  }
});
