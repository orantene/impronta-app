import test from "node:test";
import assert from "node:assert/strict";

import {
  enabledPosModesFromSettings,
  sellingModesAllowCounter,
  type PosMode,
} from "./modes";
import { showsOpenPosRow } from "../workspace/mobile-more-actions";

/**
 * THE BUG THIS FILE EXISTS FOR. `counter` is the only mode with screens
 * behind it, so it is the only switch the settings panel offers, so the only
 * write a person could ever reach was the empty list. `enabledPosModesFromSettings`
 * coerced that empty list straight back to `["counter"]`, which meant every
 * reachable persisted state equalled the default: the panel said "Saved",
 * drew the switch off, and the page repainted from the coerced value. The
 * write landed in the row and the read undid it.
 *
 * The rule now: a MISSING or MALFORMED path still answers `["counter"]` (a
 * workspace that never opened settings must keep its POS), and a LITERAL
 * empty array answers `[]` (deliberately off).
 */

function settingsWith(modes: unknown): unknown {
  return { pos: { locations: { default: { modes } } } };
}

test("an explicitly empty mode list survives the read", () => {
  // Pre-fix this returned ["counter"] and the panel could not persist anything.
  assert.deepEqual(enabledPosModesFromSettings(settingsWith([])), []);
});

test("a missing pos path still answers with the counter", () => {
  assert.deepEqual(enabledPosModesFromSettings(undefined), ["counter"]);
  assert.deepEqual(enabledPosModesFromSettings({}), ["counter"]);
  assert.deepEqual(enabledPosModesFromSettings({ pos: {} }), ["counter"]);
  assert.deepEqual(enabledPosModesFromSettings(settingsWith("counter")), ["counter"]);
});

test("an array of junk is malformed, not deliberate, and keeps the counter", () => {
  assert.deepEqual(enabledPosModesFromSettings(settingsWith(["nonsense"])), ["counter"]);
  assert.deepEqual(enabledPosModesFromSettings(settingsWith([1, null])), ["counter"]);
});

test("one bad entry beside a good one drops only itself", () => {
  assert.deepEqual(enabledPosModesFromSettings(settingsWith(["counter", "nonsense"])), ["counter"]);
});

test("the empty list closes the doors instead of leaving an engine with none", () => {
  const off: readonly PosMode[] = [];
  const on: readonly PosMode[] = ["counter"];

  // The register route asks exactly this before it renders.
  assert.equal(sellingModesAllowCounter(off), false);
  assert.equal(sellingModesAllowCounter(on), true);

  // The phone's More sheet drops its Open POS row, for an owner on a
  // POS-enabled platform — the most permissive caller there is.
  assert.equal(showsOpenPosRow({ posEnabled: true, role: "owner", workspaceEnabledModes: off }), false);
  assert.equal(showsOpenPosRow({ posEnabled: true, role: "owner", workspaceEnabledModes: on }), true);
});

test("switching the counter back on is reachable, so the state is not a trap", () => {
  // Round trip in the shape the store writes: off, then on again.
  assert.deepEqual(enabledPosModesFromSettings(settingsWith([])), []);
  assert.deepEqual(enabledPosModesFromSettings(settingsWith(["counter"])), ["counter"]);
});
