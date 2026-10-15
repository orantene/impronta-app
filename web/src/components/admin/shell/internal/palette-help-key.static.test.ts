import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const palette = readFileSync("src/components/admin/shell/internal/palette.tsx", "utf8");

test("TUL-906: the command palette does not react to the ? key", () => {
  assert.doesNotMatch(palette, /isHelpKey/);
  assert.doesNotMatch(palette, /setQuery\("shortcut"\)/);
});
