/**
 * TUL-983 (Batch 13): #3835 fixed the MOBILE status pills (`.mx-th .st`) but QA still
 * saw the open thread's header clip at desktop width ('Pedido · Abierto · En e…',
 * next-step bar ellipsized): `.th-head .who span` and `.nextbar .why` were
 * nowrap + overflow hidden. They must wrap, like the mobile pills.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const css = readFileSync(join(process.cwd(), "src/components/messages-v5/kit/tokens.css"), "utf8");
const rule = (selector: string) => {
  const line = css.split("\n").find((l) => l.startsWith(selector + " {"));
  assert.ok(line, `rule ${selector} exists`);
  return line!;
};

test("desktop thread header subject wraps instead of clipping", () => {
  const who = rule(".msgv5 .th-head .who span");
  assert.match(who, /flex-wrap: wrap/);
  assert.match(who, /white-space: normal/);
  assert.doesNotMatch(rule(".msgv5 .th-head .who .subj"), /text-overflow: ellipsis/);
});

test("the next-step reason wraps instead of ending in an ellipsis", () => {
  const why = rule(".msgv5 .nextbar .why");
  assert.match(why, /white-space: normal/);
  assert.doesNotMatch(why, /text-overflow: ellipsis/);
  assert.match(css, /\.msgv5 \.nextbar \{[^}]*flex-wrap: wrap/);
});

test("the mobile pills fix from #3835 stays", () => {
  assert.match(rule(".msgv5 .mx-th .st"), /flex-wrap: wrap/);
});
