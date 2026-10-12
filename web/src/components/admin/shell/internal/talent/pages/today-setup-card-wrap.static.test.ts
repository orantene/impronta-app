/**
 * TUL-576 — the Today "Finish setting up your profile" card wraps its header
 * row on phones instead of squeezing the title to one word per line.
 *
 *   cd web && npx tsx --test src/components/admin/shell/internal/talent/pages/today-setup-card-wrap.static.test.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const src = readFileSync(
  join(process.cwd(), "src/components/admin/shell/internal/talent/pages/TodayPage.tsx"),
  "utf8",
);

test("setup card header row wraps and the title block keeps a minimum width", () => {
  const title = src.indexOf('copy.t("Finish setting up your profile")');
  assert.ok(title > 0, "setup card title not found");
  const head = src.slice(src.lastIndexOf("{onboardingCompleteness.percent}%", title) - 600, title);
  assert.match(head, /className="flex flex-wrap items-center gap-3\.5"/);
  assert.match(head, /className="min-w-0 flex-\[1_1_180px\]"/);
  assert.doesNotMatch(head, /className="flex-1 min-w-0"/);
});
