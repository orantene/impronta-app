import assert from "node:assert/strict";
import { test } from "node:test";

import { localizedLanguageName } from "./language-label";

test("language names read in the page locale (platform)", () => {
  assert.equal(localizedLanguageName({ name: "Spanish" }, "es"), "Español");
  assert.equal(localizedLanguageName({ name: "English" }, "es"), "Inglés");
  assert.equal(localizedLanguageName({ name: "Spanish" }, "en"), "Spanish");
  assert.equal(localizedLanguageName({ name: "English" }, "en"), "English");
});

test("a stored ISO code wins over the stored name", () => {
  assert.equal(localizedLanguageName({ name: "whatever", code: "fr" }, "es"), "Francés");
});

test("an unknown language passes through as stored, and nothing is invented", () => {
  assert.equal(localizedLanguageName({ name: "Klingon" }, "es"), "Klingon");
  assert.equal(localizedLanguageName({ name: null, code: null }, "es"), "");
});
