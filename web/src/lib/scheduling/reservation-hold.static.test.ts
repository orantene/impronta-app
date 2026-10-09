import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

describe("placeReservationHold agenda busy check (Track D6)", () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const src = readFileSync(join(here, "reservation-hold.ts"), "utf8");

  it("pre-checks via checkReservationWindowFree", () => {
    assert.match(src, /checkReservationWindowFree/);
    assert.match(src, /slot_taken/);
  });

  it("re-checks after insert and releases the hold on conflict", () => {
    assert.match(src, /stillFree/);
    assert.match(src, /from\("talent_holds"\)\.delete\(\)\.eq\("id"/);
  });

  it("post-insert re-check excludes the hold just created (TUL-433)", () => {
    assert.match(src, /excludeHoldIds:\s*\[\s*data\.id/);
  });

  it("slot_taken refusals log tenant/offering/window (never silent)", () => {
    assert.match(src, /reservation-hold\/slot_taken/);
    assert.match(src, /logSlotTaken\("pre_check"/);
    assert.match(src, /logSlotTaken\("exclusion"/);
    assert.match(src, /logSlotTaken\("post_insert"/);
  });
});
