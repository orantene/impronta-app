/**
 * The POS bridge read — specifically its two fallbacks, which is where the
 * shipped defect lived.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { DEFAULT_POS_MODES, readWorkspacePosBridge } from "./pos-bridge";

test("an absent platform switch reads as off", () => {
  assert.equal(readWorkspacePosBridge(undefined, undefined).posEnabled, false);
  assert.equal(readWorkspacePosBridge(null, null).posEnabled, false);
  assert.equal(readWorkspacePosBridge({}, null).posEnabled, false);
  assert.equal(readWorkspacePosBridge({ posEnabled: true }, null).posEnabled, true);
});

test("an absent mode list falls back to counter, NEVER to an empty list", () => {
  // The whole defect in one assertion: `[]` here can only ever intersect to
  // nothing, so every POS entry point would be permanently unreachable.
  assert.deepEqual(DEFAULT_POS_MODES, ["counter"]);
  assert.deepEqual(readWorkspacePosBridge(null, undefined).posModes, ["counter"]);
  assert.deepEqual(readWorkspacePosBridge(null, {}).posModes, ["counter"]);
  assert.notDeepEqual(readWorkspacePosBridge(null, {}).posModes, []);
});

test("a workspace that really has every mode off is preserved, not overwritten by the default", () => {
  // The mirror image: the fallback must apply to ABSENCE only. A workspace
  // that deliberately turned every mode off must stay off.
  assert.deepEqual(readWorkspacePosBridge({ posEnabled: true }, { posModes: [] }).posModes, []);
});

test("a real mode list passes through untouched", () => {
  assert.deepEqual(
    readWorkspacePosBridge({ posEnabled: true }, { posModes: ["counter", "floor"] }).posModes,
    ["counter", "floor"],
  );
});
