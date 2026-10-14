import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const src = readFileSync(join(process.cwd(), "src/components/talent/studio/MoreScreen.tsx"), "utf8");

test("mobile More sheet Get help opens the support panel (TUL-904)", () => {
  assert.match(src, /import \{ openSupportPanel \} from "@\/lib\/support\/open-support-panel"/);
  assert.match(src, /label: "Get help"[^\n]*run: \(\) => openSupportPanel\(\)/);
  assert.doesNotMatch(src, /openGuideHome/);
});
