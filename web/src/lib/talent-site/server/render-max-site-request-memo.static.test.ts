/**
 * TUL-1181: generateMetadata and the page both call renderTalentMaxSite in one
 * request. The export must memoize per request so a cold miss renders once.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const src = readFileSync(join(__dirname, "render-max-site.tsx"), "utf8");

test("renderTalentMaxSite memoizes per request with React cache", () => {
  assert.match(src, /import \{ cache, type ReactNode \} from "react"/);
  assert.match(src, /const renderMemo = cache\(\(\) => new Map</);
  assert.match(src, /JSON\.stringify\(input\)/);
});

test("a mainOverride (ReactNode) call bypasses the memo", () => {
  assert.match(src, /if \(input\.mainOverride\) return failOnReadTimeout/);
});
