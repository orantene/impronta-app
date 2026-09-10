/**
 * reschedule-refusal.test.ts — every refusal a reschedule can produce, and the
 * sentence an operator reads for it.
 *
 * THE CLAIM UNDER TEST is not "the map has ten rows". It is that a refusal
 * which KNOWS what collided says so by name, that one which does not never
 * renders a sentence with an empty hole in it, and that every reason the
 * engine can return reaches a key the catalogue actually carries. The last of
 * those is checked against `messages/{en,es,fr}.json` rather than against a
 * list written here, because a key with no row renders as its own key path and
 * nothing else in the build notices.
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  describeRescheduleRefusal,
  fillRefusalSentence,
  type RescheduleRefusalKey,
} from "./reschedule-refusal";
import type { RescheduleBookingReason } from "./reschedule-booking";

const WEB_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

/** Every reason the engine declares. Read from the type's own union in source. */
function reasonsFromSource(): RescheduleBookingReason[] {
  const src = readFileSync(join(WEB_ROOT, "src/lib/scheduling/reschedule-booking.ts"), "utf8");
  const start = src.indexOf("export type RescheduleBookingReason");
  assert.ok(start >= 0, "RescheduleBookingReason is gone from reschedule-booking.ts");
  const block = src.slice(start, src.indexOf(";", start));
  const reasons = [...block.matchAll(/"([a-z_]+)"/g)].map((m) => m[1] as RescheduleBookingReason);
  assert.ok(reasons.length >= 9, `expected the full reason union, found ${reasons.length}`);
  return reasons;
}

function catalogue(locale: "en" | "es" | "fr"): Record<string, string> {
  const json = JSON.parse(
    readFileSync(join(WEB_ROOT, "messages", `${locale}.json`), "utf8"),
  ) as Record<string, unknown>;
  const dashboard = json.dashboard as Record<string, unknown>;
  const appts = dashboard.adminAppointments as Record<string, unknown>;
  const reschedule = appts.reschedule as Record<string, unknown>;
  return reschedule.refusal as Record<string, string>;
}

test("a collision that knows the person names them; one that does not has no hole", () => {
  const named = describeRescheduleRefusal({ reason: "slot_taken", personName: "Ana" });
  assert.deepEqual(named, { key: "slotTakenNamed", params: { person: "Ana" } });
  assert.match(
    fillRefusalSentence(catalogue("en")[named.key]!, named.params),
    /^Ana is already booked/,
  );

  const unnamed = describeRescheduleRefusal({ reason: "slot_taken", personName: null });
  assert.equal(unnamed.key, "slotTaken");
  assert.deepEqual(unnamed.params, {});
  // The whole point of the second key: no `{person}` survives into the copy.
  assert.ok(!catalogue("en").slotTaken!.includes("{"), "the unnamed sentence still has a hole");
});

test("a whitespace name is an absent name, not an empty substitution", () => {
  const refusal = describeRescheduleRefusal({ reason: "slot_taken", personName: "   " });
  assert.equal(refusal.key, "slotTaken");
});

test("a full space names the room, and a full parent names the room it sits in", () => {
  const soldOut = describeRescheduleRefusal({ reason: "sold_out", spaceName: "Studio B" });
  assert.deepEqual(soldOut, { key: "roomFullNamed", params: { room: "Studio B" } });
  assert.match(
    fillRefusalSentence(catalogue("en")[soldOut.key]!, soldOut.params),
    /Studio B is full/,
  );

  const parent = describeRescheduleRefusal({ reason: "ancestor_full", spaceName: "Chair 3" });
  assert.deepEqual(parent, { key: "ancestorFullNamed", params: { room: "Chair 3" } });
  assert.match(
    fillRefusalSentence(catalogue("en")[parent.key]!, parent.params),
    /The room Chair 3 sits in/,
  );
});

test("a stale screen is refused in the operator's own words and names nothing", () => {
  // Naming a person or a room here would describe a state the operator was NOT
  // looking at, which is the exact confusion the refusal exists to prevent.
  const refusal = describeRescheduleRefusal({
    reason: "conflict",
    personName: "Ana",
    spaceName: "Studio B",
  });
  assert.deepEqual(refusal, { key: "changedSinceOpened", params: {} });
  assert.match(catalogue("en").changedSinceOpened!, /changed since you opened it/i);
});

test("a booking in another workspace is answered exactly like a missing one", () => {
  assert.equal(describeRescheduleRefusal({ reason: "wrong_tenant" }).key, "notFound");
  assert.equal(describeRescheduleRefusal({ reason: "not_found" }).key, "notFound");
});

test("every engine reason reaches a key that exists in all three languages", () => {
  const keys = new Set<RescheduleRefusalKey>();
  for (const reason of reasonsFromSource()) {
    const refusal = describeRescheduleRefusal({ reason });
    keys.add(refusal.key);
    // And again with names present, which selects the other branch.
    keys.add(
      describeRescheduleRefusal({ reason, personName: "Ana", spaceName: "Studio B" }).key,
    );
  }
  assert.ok(keys.size >= 9, `expected the refusal keys, found ${keys.size}`);
  for (const locale of ["en", "es", "fr"] as const) {
    const rows = catalogue(locale);
    for (const key of keys) {
      assert.equal(typeof rows[key], "string", `${locale} has no sentence for "${key}"`);
      assert.ok(rows[key]!.trim().length > 0, `${locale}.${key} is empty`);
      assert.ok(!rows[key]!.includes("—"), `${locale}.${key} uses an em dash`);
    }
  }
});

test("substitution replaces every occurrence and leaves unknown holes alone", () => {
  assert.equal(fillRefusalSentence("{a} and {a} and {b}", { a: "x" }), "x and x and {b}");
});
