/**
 * GRK-055 — directory filter: first tap must register and survive scroll.
 * Guards the regressions that made the first tap a no-op:
 * scroll-snap eating the tap, pointer-events-none while pending, and
 * selection that only mirrors the URL (no optimistic chip state).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const SRC = readFileSync(
  join(process.cwd(), "src/components/directory/directory-talent-type-bar.tsx"),
  "utf8",
);

test("GRK-055: filter bar uses optimistic selection", () => {
  assert.match(SRC, /optimisticTermId/);
  assert.match(SRC, /setOptimisticTermId\(termId\)/);
});

test("GRK-055: pending transition does not steal pointer events", () => {
  assert.doesNotMatch(SRC, /pointer-events-none/);
});

test("GRK-055: horizontal pill rows do not use scroll-snap", () => {
  assert.doesNotMatch(SRC, /snap-x/);
  assert.doesNotMatch(SRC, /snap-proximity/);
  assert.doesNotMatch(SRC, /snap-start/);
});

test("GRK-055: tax commits read the latest search params ref", () => {
  assert.match(SRC, /searchParamsRef\.current/);
});
