/**
 * TUL-81 builder — draft chip must truncate before sticky Publicar clips it.
 *
 * Run: node_modules/.bin/tsx --test \
 *   src/components/edit-chrome/talent-draft-chip-clip.static.test.ts
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const CHIP = join(dirname(fileURLToPath(import.meta.url)), "talent-draft-chip.tsx");

test("TalentDraftChip caps width and ellipsizes (TUL-81 builder)", () => {
  const src = readFileSync(CHIP, "utf8");
  assert.match(src, /maxWidth:\s*"min\(200px,\s*28vw\)"/);
  assert.match(src, /textOverflow:\s*"ellipsis"/);
  assert.match(src, /max-w-\[min\(200px,28vw\)\]/);
  assert.match(src, /draftTitle/);
});
