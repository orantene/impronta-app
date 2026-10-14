/**
 * GRK-098 — closed mega-menu must stay out of the keyboard tab order.
 * Opening on focus dumped ~26 links ahead of the hero CTA.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const MEGA = readFileSync(
  join(process.cwd(), "src/components/marketing/marketing-header-mega.tsx"),
  "utf8",
);
const HEADER = readFileSync(
  join(process.cwd(), "src/components/marketing/header.tsx"),
  "utf8",
);

test("GRK-098: mega-menu trigger does not open on focus", () => {
  assert.doesNotMatch(MEGA, /onFocus=\{onOpen\}/);
});

test("GRK-098: desktop dropdown trigger does not open on focus", () => {
  assert.doesNotMatch(HEADER, /onFocus=\{onOpen\}/);
});

test("GRK-098: closed panel stays unmounted (no tab targets)", () => {
  assert.match(MEGA, /\{open \? \(/);
  assert.match(MEGA, /\) : null\}/);
});
