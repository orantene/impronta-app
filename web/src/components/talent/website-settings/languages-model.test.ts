import assert from "node:assert/strict";
import { test } from "node:test";

import {
  languagesChangeCount,
  secondaryDelta,
  suggestPrimary,
  toggleSecondary,
  withPrimary,
} from "./languages-model";

test("languagesChangeCount counts a primary switch and each secondary flip", () => {
  const saved = { primary: "es", secondary: ["en"] };
  assert.equal(languagesChangeCount(saved, saved), 0);
  assert.equal(languagesChangeCount(saved, { primary: "es", secondary: [] }), 1);
  assert.equal(languagesChangeCount(saved, { primary: "en", secondary: [] }), 2);
  assert.equal(languagesChangeCount(null, saved), 0);
});

test("withPrimary drops the new primary from the secondaries", () => {
  assert.deepEqual(withPrimary({ primary: "es", secondary: ["en"] }, "en"), { primary: "en", secondary: [] });
});

test("toggleSecondary never adds the primary and dedupes", () => {
  const d = { primary: "es", secondary: [] as string[] };
  assert.deepEqual(toggleSecondary(d, "es", true), d);
  assert.deepEqual(toggleSecondary(d, "en", true), { primary: "es", secondary: ["en"] });
  assert.deepEqual(toggleSecondary({ primary: "es", secondary: ["en"] }, "en", true).secondary, ["en"]);
  assert.deepEqual(toggleSecondary({ primary: "es", secondary: ["en"] }, "en", false).secondary, []);
});

test("secondaryDelta reports added and removed", () => {
  assert.deepEqual(secondaryDelta({ primary: "es", secondary: ["en"] }, { primary: "es", secondary: ["fr"] }), {
    added: ["fr"],
    removed: ["en"],
  });
});

test("suggestPrimary: browser languages first, then country, live set only", () => {
  assert.equal(suggestPrimary(["fr-FR", "es-MX"], "en"), "es");
  assert.equal(suggestPrimary(["fr-FR"], "es"), "es");
  assert.equal(suggestPrimary(["fr"], "fr"), null);
  assert.equal(suggestPrimary([], null), null);
});
