import assert from "node:assert/strict";
import test from "node:test";

import { signupDefaultCurrency, workspaceLocaleSettingsForFlow } from "./workspace-signup-locale";

test("a Spanish flow makes Spanish the default and keeps English supported, Spanish first", () => {
  assert.deepEqual(workspaceLocaleSettingsForFlow("es"), { defaultLocale: "es", supportedLocales: ["es", "en"] });
});

test("an English flow keeps English the default and adds Spanish, English first", () => {
  assert.deepEqual(workspaceLocaleSettingsForFlow("en"), { defaultLocale: "en", supportedLocales: ["en", "es"] });
});

test("the default is always the first supported locale (DB check: default is a member)", () => {
  for (const l of ["en", "es"]) {
    const s = workspaceLocaleSettingsForFlow(l)!;
    assert.equal(s.supportedLocales[0], s.defaultLocale);
    assert.ok(s.supportedLocales.includes("en") && s.supportedLocales.includes("es"));
  }
});

test("an unknown, empty or non-platform locale keeps today's behavior (null)", () => {
  assert.equal(workspaceLocaleSettingsForFlow(null), null);
  assert.equal(workspaceLocaleSettingsForFlow(undefined), null);
  assert.equal(workspaceLocaleSettingsForFlow(""), null);
  assert.equal(workspaceLocaleSettingsForFlow("fr"), null);
  assert.equal(workspaceLocaleSettingsForFlow("ES"), null);
});

/**
 * TUL-1993: an MXN-context (Spanish) signup must land on an MXN account, not
 * the column's own USD default. Same `es` -> MXN rule as the flow's own
 * language (workspaceLocaleSettingsForFlow) and the rest of the product's
 * no-country-yet convention (pickMarketingCurrency TUL-864, setupCurrency
 * TUL-16 b).
 */
test("a Spanish /start flow signs up an MXN account", () => {
  assert.equal(signupDefaultCurrency("es"), "MXN");
});

test("English, unset, empty or non-platform locales keep USD", () => {
  assert.equal(signupDefaultCurrency("en"), "USD");
  assert.equal(signupDefaultCurrency(null), "USD");
  assert.equal(signupDefaultCurrency(undefined), "USD");
  assert.equal(signupDefaultCurrency(""), "USD");
  assert.equal(signupDefaultCurrency("fr"), "USD");
  // Case-sensitive on purpose, same as workspaceLocaleSettingsForFlow: the
  // flow only ever passes its own canonical "es" / "en" tokens.
  assert.equal(signupDefaultCurrency("ES"), "USD");
});
