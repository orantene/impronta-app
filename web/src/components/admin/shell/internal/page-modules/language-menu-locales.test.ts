import assert from "node:assert/strict";
import { test } from "node:test";

import { workspaceMenuLocales } from "./language-menu-locales";

test("English-only workspace still offers ES and EN (TUL-731)", () => {
  assert.deepEqual([...workspaceMenuLocales(["en"], "en")], ["en", "es"]);
});

test("extra site languages follow, no duplicates", () => {
  assert.deepEqual([...workspaceMenuLocales(["fr", "en"], "en")], ["fr", "en", "es"]);
  assert.deepEqual([...workspaceMenuLocales([], "es")], ["es", "en"]);
});
