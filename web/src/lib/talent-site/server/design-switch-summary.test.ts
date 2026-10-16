/**
 * TUL-536: pure summary of a Design switch's warnings for the confirm sheet.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { summarizeSwitchWarnings } from "./design-switch-summary";

test("hidden lists unmatched theme sections, kept lists talent-added ones", () => {
  const s = summarizeSwitchWarnings(
    [
      { tree: "home", key: "home/reviews-wall", kind: "section", reason: "no_match" },
      { tree: "home", key: "home/reviews-wall/title", kind: "text", reason: "no_match" },
      { tree: "home", kind: "faq", reason: "talent_added" },
    ],
    "en",
  );
  assert.deepEqual(s.hidden, ["Reviews wall"]);
  assert.deepEqual(s.kept, ["Faq"]);
});

test("dedupes, localizes common words, and never emits em dashes", () => {
  const s = summarizeSwitchWarnings(
    [
      { tree: "home", key: "home/gallery", kind: "section", reason: "no_match" },
      { tree: "shell", key: "shell/gallery", kind: "section", reason: "no_match" },
    ],
    "es",
  );
  assert.deepEqual(s.hidden, ["Galería"]);
  assert.doesNotMatch(JSON.stringify(s), /—/);
});

test("no warnings yields empty lists", () => {
  assert.deepEqual(summarizeSwitchWarnings([], "en"), { hidden: [], kept: [] });
});
