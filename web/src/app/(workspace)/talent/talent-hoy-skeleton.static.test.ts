/**
 * TUL-536: phone Hoy must show a visible skeleton after sign-in — never a
 * blank paint from unset --tc-* CSS variables.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const here = join(process.cwd(), "src/app/(workspace)/talent");
const read = (rel: string) => readFileSync(join(here, rel), "utf8");

test("TalentShellSkeleton uses visible black/alpha pulses, not --tc-border", () => {
  const src = read("_talent-shell-skeleton.tsx");
  assert.match(src, /data-testid="talent-shell-skeleton"/);
  assert.match(src, /bg-black\/\[0\.06\]/);
  assert.doesNotMatch(src, /bg-\[var\(--tc-border\)\]/);
  assert.match(src, /data-talent-shell-skeleton="hoy"/);
});

test("talent/today loading uses TodaySkeleton", () => {
  const src = read("today/loading.tsx");
  assert.match(src, /TodaySkeleton/);
  assert.match(src, /today-skeleton/);
});

test("TodaySkeleton stays on black/alpha pulses (TUL-303 + TUL-536)", () => {
  const src = readFileSync(
    join(process.cwd(), "src/components/admin/shell/internal/talent/pages/today-skeleton.tsx"),
    "utf8",
  );
  assert.match(src, /data-testid="today-skeleton"/);
  assert.match(src, /bg-black\/\[0\.06\]/);
  assert.doesNotMatch(src, /--tc-/);
});
