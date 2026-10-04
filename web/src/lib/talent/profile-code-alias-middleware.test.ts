import test from "node:test";
import assert from "node:assert/strict";

import { matchTalentProfileCodePath } from "./profile-code-alias-middleware";
import { isNumericTalentProfileCode } from "./profile-code";

test("matchTalentProfileCodePath extracts code + suffix", () => {
  assert.deepEqual(matchTalentProfileCodePath("/t/TAL-JORGBEAUTY"), {
    code: "TAL-JORGBEAUTY",
    prefix: "/t/",
    suffix: "",
  });
  assert.deepEqual(matchTalentProfileCodePath("/t/TAL-JORGBEAUTY/politicas"), {
    code: "TAL-JORGBEAUTY",
    prefix: "/t/",
    suffix: "/politicas",
  });
  assert.equal(matchTalentProfileCodePath("/talent/today"), null);
  assert.equal(matchTalentProfileCodePath("/t/"), null);
});

test("numeric fast-path skips alias RPC for live codes", () => {
  assert.equal(isNumericTalentProfileCode("TAL-93938"), true);
  assert.equal(isNumericTalentProfileCode("TAL-JORGBEAUTY"), false);
});
