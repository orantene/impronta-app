import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { instantMountShouldHandle } from "./profile-booking-owner";

const ROOT = join(__dirname, "..", "..", "app", "t", "[profileCode]");
const CHROME = readFileSync(join(ROOT, "hub-profile-booking-chrome.tsx"), "utf8");
const MOUNT = readFileSync(join(ROOT, "_shared", "OfferingInstantMount.tsx"), "utf8");
const WRAP = readFileSync(join(ROOT, "_shared", "ProfileInstantBookingMount.tsx"), "utf8");

const timed = { kind: "service", intent: "instant", durationMinutes: 60, amountCents: 5000 } as const;
const product = { kind: "product", intent: "instant", durationMinutes: null, amountCents: 5000 } as const;

test("TUL-707: with the catalog sheet mounted, the instant mount ignores timed services", () => {
  assert.equal(instantMountShouldHandle(timed, true), false);
});

test("TUL-707: products and untimed packages stay on the purchase rail", () => {
  assert.equal(instantMountShouldHandle(product, true), true);
});

test("TUL-707: without the catalog sheet the instant mount still handles everything", () => {
  assert.equal(instantMountShouldHandle(timed, false), true);
});

test("TUL-707: wiring passes the sheet flag and the mount honours it", () => {
  assert.match(CHROME, /catalogSheetMounted=\{bookable\}/);
  assert.match(WRAP, /catalogSheetMounted/);
  assert.match(MOUNT, /instantMountShouldHandle\(d, catalogSheetMounted\)/);
});
