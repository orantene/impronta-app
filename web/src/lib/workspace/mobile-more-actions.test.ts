/**
 * The phone More sheet's auxiliary rows — and specifically the one that was
 * shipped dead.
 *
 * WHAT WENT WRONG. The first cut of the mobile nav rewrite dropped the point
 * of sale from the phone (the old bar mapped `state.visiblePages`, which
 * carries `pos` unconditionally, so it was always one tap away in the More
 * sheet) and replaced it with an "Open POS" row gated on two constants: a
 * hardcoded `posEnabled: false` in the component, and
 * `modesForPerson({ ..., workspaceEnabledModes: [] })`, whose empty list can
 * only ever intersect to nothing. Both halves were unreachable, so the phone
 * lost a destination and the replacement could not fire on any workspace.
 *
 * These tests run the real gate over real inputs, so a constant on either side
 * shows up as a failure here instead of as silence.
 */
import test from "node:test";
import assert from "node:assert/strict";

import {
  mobileMoreActions,
  showsOpenPosRow,
  type MobileMoreActionsInput,
} from "./mobile-more-actions";
import { enabledPosModesFromSettings } from "@/lib/pos/modes";

/** What a workspace that has never opened the POS settings page reports. */
const DEFAULT_MODES = enabledPosModesFromSettings(undefined);

function input(overrides: Partial<MobileMoreActionsInput> = {}): MobileMoreActionsInput {
  return {
    posEnabled: true,
    role: "owner",
    workspaceEnabledModes: DEFAULT_MODES,
    ...overrides,
  };
}

const ids = (i: MobileMoreActionsInput) => mobileMoreActions(i).map((a) => a.id);

test("the workspace's default enabled modes are not empty — an unconfigured workspace still has counter", () => {
  // If this ever became `[]`, every check below would pass for the wrong
  // reason and the Open POS row would go dead again on every workspace that
  // has no `pos` settings blob (which is all of them today).
  assert.deepEqual(DEFAULT_MODES, ["counter"]);
});

test("an owner on a workspace with the point of sale enabled sees the Open POS row", () => {
  assert.equal(showsOpenPosRow(input()), true);
  assert.ok(ids(input()).includes("open-pos"));
  const row = mobileMoreActions(input()).find((a) => a.id === "open-pos");
  assert.equal(row?.label, "Open POS");
  assert.equal(row?.icon, "credit");
});

test("the Open POS row is absent when the platform flag is off", () => {
  const off = input({ posEnabled: false });
  assert.equal(showsOpenPosRow(off), false);
  assert.ok(!ids(off).includes("open-pos"));
  // and the rest of the sheet is untouched by the switch
  assert.deepEqual(ids(off), ["search", "notifications"]);
});

test("the flag alone is not enough — a read-only viewer never reaches the POS", () => {
  assert.equal(showsOpenPosRow(input({ role: "viewer" })), false);
  assert.equal(showsOpenPosRow(input({ role: "editor" })), true);
});

test("a workspace that has switched every mode off hides the row even for an owner", () => {
  // `[]` is a real, meaningful value here: it means the workspace turned the
  // modes off, not that the caller failed to look them up. The distinction is
  // the whole point of defaulting to `["counter"]` at the read, never here.
  assert.equal(showsOpenPosRow(input({ workspaceEnabledModes: [] })), false);
});

test("search and notifications are unconditional, and order is stable", () => {
  assert.deepEqual(ids(input({ posEnabled: false, role: "viewer" })), [
    "search",
    "notifications",
  ]);
  assert.deepEqual(ids(input()), ["search", "notifications", "open-pos"]);
});
