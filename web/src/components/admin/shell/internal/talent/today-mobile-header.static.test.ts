/**
 * TUL-950 — at 390px the Talent Studio page header must not slide under the
 * top bar, and Today row names wrap instead of truncating to "QA Cli...".
 *
 *   cd web && npx tsx --test src/components/admin/shell/internal/talent/today-mobile-header.static.test.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = join(process.cwd(), "src/components/admin/shell/internal");

test("mobile page header pulls back by the 14px main padding, not 28px", () => {
  const src = readFileSync(join(root, "talent/shared/page-chrome-1.tsx"), "utf8");
  assert.match(src, /margin: -14px -14px 16px !important/);
  assert.doesNotMatch(src, /margin: -28px -28px/);
});

test("Today appointment names wrap (line-clamp-2) instead of truncating", () => {
  const src = readFileSync(join(root, "talent/agenda/AgendaTodayPage.tsx"), "utf8");
  assert.match(src, /line-clamp-2 break-words text-\[14px\] font-semibold[^"]*">\s*\{copy\.t\(item\.client\?\.name/);
});
