/**
 * TUL-1708: a viewer must not write through a capability-less staff guard. The door (POS) actions name
 * the capability they need on the guard itself for every WRITE; the three reads (tonight's list, reading
 * an open sale, the tickets issued on an order) keep the default `agency.workspace.view`, which a viewer
 * holds — a viewer can look at the door, just not write to it.
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

test("the local staff() guard never calls requireWorkspaceStaffAction bare", () => {
  assert.doesNotMatch(src, /\brequireWorkspaceStaffAction\(\s*\)/);
  assert.match(
    src,
    /requireWorkspaceStaffAction\(action \? \{ capability: DOOR_WRITE_CAPABILITY\[action\] \} : undefined\)/,
  );
});

test("every writer passes its own key from DOOR_WRITE_CAPABILITY", () => {
  for (const [action, fn] of WRITERS) {
    const body = bodyOf(fn);
    assert.match(body.slice(0, 900), new RegExp(`await staff\\("${action}"\\)`), fn);
    assert.ok(action in DOOR_WRITE_CAPABILITY, action);
  }
});

test("the three reads keep the viewer default (no capability passed)", () => {
  for (const fn of READERS) {
    const body = bodyOf(fn);
    assert.match(body.slice(0, 300), /await staff\(\);/, fn);
  }
});

test("no capability-less guard call remains unaccounted for: exactly the three known reads stay bare", () => {
  const bare = (src.match(/\bawait staff\(\s*\)/g) ?? []).length;
  assert.equal(bare, READERS.length, "only the known reads may call staff() with no action");
});

test("a viewer is refused every capability a door writer requires; manager, admin and owner are allowed", () => {
  for (const cap of new Set(Object.values(DOOR_WRITE_CAPABILITY))) {
    assert.equal(roleGrantsCapability("viewer", cap as CapabilityKey), false, `viewer must not hold ${cap}`);
    assert.equal(roleGrantsCapability("editor", cap as CapabilityKey), false, `editor must not hold ${cap}`);
    for (const role of ["manager", "admin", "owner"] as const) {
      assert.equal(roleGrantsCapability(role, cap as CapabilityKey), true, `${role} should hold ${cap}`);
    }
  }
  assert.equal(roleGrantsCapability("viewer", "agency.workspace.view"), true, "the viewer default still reads");
});
