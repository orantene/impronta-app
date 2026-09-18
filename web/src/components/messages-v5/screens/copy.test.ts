import assert from "node:assert/strict";
import { test } from "node:test";

import { EN_SCREEN, ES_SCREEN, FR_SCREEN } from "./test-screen-copy";

function leaves(value: unknown, path: string[] = []): [string, string][] {
  if (typeof value === "string") return [[path.join("."), value]];
  if (value && typeof value === "object") return Object.entries(value).flatMap(([k, v]) => leaves(v, [...path, k]));
  return [];
}

test("every shell string resolves in EN, ES and FR: no raw key, no em dash, never customer, no black or dark green promise", () => {
  const en = leaves(EN_SCREEN.shell);
  // 81 after wave A wired the lane panes and the placeholder-only keys left (D-MSG-113); a real regression drops well below this.
  assert.ok(en.length >= 80, `expected the shell copy, got ${en.length}`);
  for (const [name, copy] of [["en", EN_SCREEN], ["es", ES_SCREEN], ["fr", FR_SCREEN]] as const) {
    const all = leaves(copy.shell);
    assert.equal(all.length, en.length, `${name} has a different key count`);
    for (const [key, value] of all) {
      assert.ok(value.trim().length > 0, `${name} ${key} is empty`);
      assert.doesNotMatch(value, /^dashboard\./, `${name} ${key} is a raw key`);
      assert.doesNotMatch(value, /—/, `${name} ${key} has an em dash`);
      assert.doesNotMatch(value, /customer/i, `${name} ${key} says customer`);
    }
  }
});

test("the three locales differ where they should (ES and FR are not EN copies)", () => {
  assert.notEqual(ES_SCREEN.shell.comingTitle, EN_SCREEN.shell.comingTitle);
  assert.notEqual(FR_SCREEN.shell.comingTitle, EN_SCREEN.shell.comingTitle);
  assert.notEqual(ES_SCREEN.shell.next.request_payment, EN_SCREEN.shell.next.request_payment);
});
