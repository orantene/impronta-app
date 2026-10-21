/**
 * TUL-1708: a viewer must not write through a capability-less staff guard. The door (POS) actions name
 * the capability they need on the guard itself for every WRITE, from DOOR_WRITE_CAPABILITY. The three
 * reads (tonight's list, reading an open sale, the tickets issued on an order) call `staff()` with no
 * action, but on main today EVERY door action, reads included, needs `booking.payment.request` (the door
 * shows sales figures and ticket holder names) — so the reads keep that same bar, not the guard's bare
 * default, to match exact main behaviour and not newly expose the door to a viewer.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import type { CapabilityKey } from "@/lib/access";
import { roleGrantsCapability } from "@/lib/access/roles";

import { DOOR_WRITE_CAPABILITY } from "@/lib/pos/door-write-capabilities";

const src = readFileSync(
  join(process.cwd(), "src/app/(workspace)/[tenantSlug]/admin/pos/door-actions.ts"),
  "utf8",
).replace(/\/\*[\s\S]*?\*\//g, "");

const WRITERS = [
  ["openTicketSale", "posDoorOpenTicketSale"],
  ["addTicketLine", "posDoorAddTicketLine"],
  ["nameTicket", "posDoorNameTicket"],
  ["cancelTicketSale", "posDoorCancelTicketSale"],
  ["collectTicket", "posDoorCollectTicket"],
] as const;

const READERS = ["posDoorTonight", "posDoorReadSale", "posDoorIssuedTickets"] as const;

function bodyOf(fnName: string): string {
  const start = src.indexOf(`export async function ${fnName}`);
  assert.ok(start >= 0, `could not find ${fnName}`);
  const rest = src.slice(start);
  const next = rest.indexOf("export async function", 10);
  return next > 0 ? rest.slice(0, next) : rest;
}

test("the local staff() guard never calls requireWorkspaceStaffAction with no capability", () => {
  assert.doesNotMatch(src, /\brequireWorkspaceStaffAction\(\s*\)/);
  assert.doesNotMatch(src, /\brequireWorkspaceStaffAction\(action \? [^:]+: undefined\)/);
  assert.match(
    src,
    /requireWorkspaceStaffAction\(\{\s*capability: action \? DOOR_WRITE_CAPABILITY\[action\] : "booking\.payment\.request",?\s*\}\)/,
  );
});

test("every writer passes its own key from DOOR_WRITE_CAPABILITY", () => {
  for (const [action, fn] of WRITERS) {
    const body = bodyOf(fn);
    assert.match(body.slice(0, 900), new RegExp(`await staff\\("${action}"\\)`), fn);
    assert.ok(action in DOOR_WRITE_CAPABILITY, action);
  }
});

test("the three reads call staff() with no action, same as the writers' underlying guard requires booking.payment.request", () => {
  for (const fn of READERS) {
    const body = bodyOf(fn);
    assert.match(body.slice(0, 300), /await staff\(\);/, fn);
  }
});

test("no capability-less guard call remains: reads fall through to booking.payment.request, same as every writer", () => {
  const bare = (src.match(/\bawait staff\(\s*\)/g) ?? []).length;
  assert.equal(bare, READERS.length, "only the known reads call staff() with no action, and staff() itself now requires a capability either way");
});

test("a viewer is refused every capability a door writer requires, including the reads' booking.payment.request; manager, admin and owner are allowed", () => {
  const caps = new Set<string>([...Object.values(DOOR_WRITE_CAPABILITY), "booking.payment.request"]);
  for (const cap of caps) {
    assert.equal(roleGrantsCapability("viewer", cap as CapabilityKey), false, `viewer must not hold ${cap}`);
    assert.equal(roleGrantsCapability("editor", cap as CapabilityKey), false, `editor must not hold ${cap}`);
    for (const role of ["manager", "admin", "owner"] as const) {
      assert.equal(roleGrantsCapability(role, cap as CapabilityKey), true, `${role} should hold ${cap}`);
    }
  }
});

test("a viewer can no longer read the door either (closes the relaxation vs main)", () => {
  assert.equal(roleGrantsCapability("viewer", "booking.payment.request"), false);
});
