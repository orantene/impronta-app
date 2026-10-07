import assert from "node:assert/strict";
import test from "node:test";

import { workspaceLocaleSettingsForFlow } from "./workspace-signup-locale";

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
