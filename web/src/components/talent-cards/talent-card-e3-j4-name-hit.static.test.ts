import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

/**
 * E3-J4 — directory card name tap must open the profile (not only select text).
 */

const here = dirname(fileURLToPath(import.meta.url));
const cardSrc = readFileSync(join(here, "TalentCard.tsx"), "utf8");
const adapterSrc = readFileSync(
  join(here, "../../lib/site-admin/sections/directory/DirectoryCardAdapter.tsx"),
  "utf8",
);
const marketingSrc = readFileSync(
  join(here, "../marketing/directory/DirectoryTalentCard.tsx"),
  "utf8",
);

test("E3-J4: every data-card-name heading is select-none", () => {
  // Match name hooks only (not data-card-name-rule).
  const names = [...cardSrc.matchAll(/data-card-name(?!-rule)[\s\S]{0,220}?className=\{`([^`]+)`/g)];
  assert.ok(names.length >= 4, `expected ≥4 name headings, found ${names.length}`);
  for (const match of names) {
    assert.match(
      match[1] ?? "",
      /select-none/,
      "name heading className must include select-none",
    );
  }
});

test("E3-J4: hub capture hard-navs name taps outside a.talent-card", () => {
  assert.match(
    adapterSrc,
    /closest\?\.\("\[data-card-name\]"\)/,
    "DirectoryCardAdapter must closest([data-card-name])",
  );
  assert.match(
    adapterSrc,
    /if \(!link && !nameEl\) return/,
    "capture must accept name taps when the card link was repaired away",
  );
});

test("E3-J4: marketing capture hard-navs name taps outside a.talent-card", () => {
  assert.match(
    marketingSrc,
    /closest\?\.\("\[data-card-name\]"\)/,
    "DirectoryTalentCard must closest([data-card-name])",
  );
  assert.match(
    marketingSrc,
    /if \(!link && !nameEl\) return/,
    "capture must accept name taps when the card link was repaired away",
  );
});
