/**
 * TUL-1708 follow-up: the tables, preparation, floor, reservations desk and projects counter writers name
 * their capability on the staff guard (editor and above hold `operate_venue`; a viewer does not). The local
 * `staff(capability)` wrapper takes the capability as an argument, so a bare `staff()` cannot compile.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { roleGrantsCapability } from "@/lib/access/roles";

const ADMIN = "src/app/(workspace)/[tenantSlug]/admin";
const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");
const BARE = /\brequireWorkspaceStaffAction\(\s*\)|\bawait staff\(\s*\)/;

const FILES = [
  `${ADMIN}/tables/actions.ts`,
  `${ADMIN}/preparation/actions.ts`,
  `${ADMIN}/pos/floor-actions.ts`,
  `${ADMIN}/pos/door-actions.ts`,
  `${ADMIN}/pos/_projects/projects-actions.ts`,
  `${ADMIN}/reservations/actions.ts`,
];

test("no bare staff guard is left in the venue-operations writers", () => {
  for (const f of FILES) assert.doesNotMatch(read(f), BARE, f);
});

test("tables and preparation: the wrapper forwards the capability and every call asks operate_venue", () => {
  for (const f of [`${ADMIN}/tables/actions.ts`, `${ADMIN}/preparation/actions.ts`]) {
    const src = read(f);
    assert.match(src, /requireWorkspaceStaffAction\(\{ capability \}\)/, f);
    const calls = src.match(/await staff\(([^)]*)\)/g) ?? [];
    assert.ok(calls.length > 0, f);
    // TUL-1838: tablesCancelVisit voids a check, so it is manager-tier (the one allowed exception).
    const money = calls.filter((c) => c === 'await staff("booking.payment.request")');
    assert.equal(money.length, f.endsWith("/tables/actions.ts") ? 1 : 0, `${f}: manager-tier calls`);
    for (const c of calls.filter((c) => !money.includes(c))) assert.equal(c, 'await staff("operate_venue")', `${f}: ${c}`);
  }
});

test("floor: the reserve-times read is a view, the reservation write is operate_venue", () => {
  const src = read(`${ADMIN}/pos/floor-actions.ts`);
  const write = src.indexOf("export async function floorCreateReservation");
  assert.match(src.slice(0, write), /await staff\("agency\.workspace\.view"\)/);
  assert.match(src.slice(write), /await staff\("operate_venue"\)/);
});

test("reservations desk: seating a booking and a walk-in need operate_venue", () => {
  const src = read(`${ADMIN}/reservations/actions.ts`);
  assert.equal((src.match(/requireWorkspaceStaffAction\(\{ capability: "operate_venue" \}\)/g) ?? []).length, 3); // seating, walk-in, and the no-show / cancel desk writer (TUL-1838 follow-up)
});

test("projects counter: collect and receipt lookup name booking.payment.request (money)", () => {
  const src = read(`${ADMIN}/pos/_projects/projects-actions.ts`);
  assert.match(src, /requireWorkspaceStaffAction\(\{ capability \}\)/);
  assert.equal((src.match(/await staff\("booking\.payment\.request"\)/g) ?? []).length, 2);
});

test("pos door: reads are explicit, writers keep the DOOR_WRITE_CAPABILITY map", () => {
  const src = read(`${ADMIN}/pos/door-actions.ts`);
  assert.equal((src.match(/await staff\("read"\)/g) ?? []).length, 3);
  assert.match(src, /DOOR_WRITE_CAPABILITY\[action\]/);
});

test("role matrix: a viewer is refused operate_venue; editor and above are allowed", () => {
  assert.equal(roleGrantsCapability("viewer", "operate_venue"), false);
  for (const r of ["editor", "manager", "admin", "owner"] as const) assert.equal(roleGrantsCapability(r, "operate_venue"), true, r);
  assert.equal(roleGrantsCapability("viewer", "booking.payment.request"), false);
  assert.equal(roleGrantsCapability("editor", "booking.payment.request"), false);
  assert.equal(roleGrantsCapability("manager", "booking.payment.request"), true);
});
