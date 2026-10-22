import assert from "node:assert/strict";
import test from "node:test";

import { datedAnchorHref, DATED_STEP_ANCHOR_ID, shouldMountDatedStep } from "./dated-mount";

const date = (state: string) => ({ state });

test("mount only when the picker loaded and at least one date can be shown", () => {
  assert.equal(shouldMountDatedStep({ ok: true, dates: [date("open")] }), true);
  // sold out / closed / private dates still mount: the step explains them (waitlist, closed, request)
  assert.equal(shouldMountDatedStep({ ok: true, dates: [date("sold_out")] }), true);
  assert.equal(shouldMountDatedStep({ ok: true, dates: [date("closed"), date("private")] }), true);
  assert.equal(shouldMountDatedStep({ ok: true, dates: [] }), false);
  assert.equal(shouldMountDatedStep({ ok: false }), false);
  assert.equal(shouldMountDatedStep(null), false);
});

test("the sticky bar jumps to the step", () => {
  assert.equal(datedAnchorHref(), `#${DATED_STEP_ANCHOR_ID}`);
});
