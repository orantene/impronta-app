import assert from "node:assert/strict";
import { test } from "node:test";

import { personalPageLabel } from "./personal-page-label";

test("personalPageLabel swaps the <code> placeholder for the real profile code", () => {
  assert.equal(personalPageLabel("Personal page at tulala.digital/t/<code>", "TAL-93938"), "Personal page at tulala.digital/t/TAL-93938");
  assert.equal(personalPageLabel("Página personal en tulala.digital/t/<code>", "TAL-1"), "Página personal en tulala.digital/t/TAL-1");
});

test("personalPageLabel leaves the label alone without a code", () => {
  assert.equal(personalPageLabel("Page templates", "TAL-1"), "Page templates");
  assert.equal(personalPageLabel("x/t/<code>", null), "x/t/<code>");
});
