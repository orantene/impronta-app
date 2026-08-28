import assert from "node:assert/strict";
import { test } from "node:test";

import { wantsHumanSupport } from "./support-human-prefilter";

test("detects English human-request phrases", () => {
  assert.equal(wantsHumanSupport("can I talk to a human"), true);
  assert.equal(wantsHumanSupport("I want a real person"), true);
  assert.equal(wantsHumanSupport("please call me"), true);
  assert.equal(wantsHumanSupport("how do I add a domain"), false);
});

test("detects Spanish human-request phrases", () => {
  assert.equal(wantsHumanSupport("quiero hablar con un humano"), true);
  assert.equal(wantsHumanSupport("llámame"), true);
  assert.equal(wantsHumanSupport("gracias por la ayuda"), false);
});
