/**
 * While the panel is open the round launcher is not rendered. The panel X is
 * the close control. A Close pill on the launcher would sit beside that X.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "TalentProfileChatLauncher.tsx"), "utf8");

test("the launcher button is omitted while the panel is open", () => {
  assert.match(src, /\{!open && <button/);
  assert.doesNotMatch(src, /open \? t\("public\.guestChat\.closeAria"\)/);
  assert.doesNotMatch(src, /CloseGlyph/);
});
