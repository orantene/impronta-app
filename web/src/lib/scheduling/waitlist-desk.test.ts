/**
 * waitlist-desk.test.ts — the rule that decides whose queue is worth showing.
 *
 * WHY THIS TEST IS SHORT AND WHY IT IS THE RIGHT ONE. The defect it guards was
 * not a wrong calculation; it was a list built from the wrong source. The
 * loader took its sessions from the waitlist rows that already existed, so a
 * workspace with a full class and nobody queued got nothing, the screen drew
 * its empty state, and the control that adds the FIRST person never rendered.
 * Every unit test passed the whole time, because each one handed the code a
 * fixture in which the row already existed.
 *
 * So the check here is on the PREDICATE — the one decision that was wrong and
 * the only part of the loader that can be exercised without a database. The
 * database half is proven by `scripts/proof-appointments-journey.ts`, which
 * runs `loadWaitlistDesk` and `joinWaitlist` themselves against the isolated
 * branch, starting from an empty table.
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { belongsOnWaitlistDesk } from "@/lib/scheduling/waitlist-desk";

const WEB_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

test("a class the engine calls full earns a card even with nobody on it", () => {
  // This is the entry point. Without it the journey cannot start.
  assert.equal(
    belongsOnWaitlistDesk({
      hasEntries: false,
      seats: { kind: "counted", total: 12, remaining: 0 },
    }),
    true,
  );
});

test("a class with seats left stays off the desk", () => {
  // The answer to a free seat is to sell it, not to start a queue for it, and
  // a desk listing every class in the calendar buries the ones that need a
  // phone call.
  assert.equal(
    belongsOnWaitlistDesk({
      hasEntries: false,
      seats: { kind: "counted", total: 12, remaining: 3 },
    }),
    false,
  );
});

test("a class nobody ever counted seats for is not full, it is uncounted", () => {
  // No pool means no place can ever be said to have come free: `promote`
  // refuses that shape with `no_pool`. Showing it here would offer an operator
  // a queue that nothing could ever promote from.
  assert.equal(
    belongsOnWaitlistDesk({ hasEntries: false, seats: { kind: "uncounted" } }),
    false,
  );
});

test("a seat count that could not be read is not a full class", () => {
  // The failure mode this shape exists to prevent: a nullable remaining read
  // as zero, and a class with seats on it declared sold out.
  assert.equal(
    belongsOnWaitlistDesk({ hasEntries: false, seats: { kind: "unreadable", total: 12 } }),
    false,
  );
});

test("somebody already waiting keeps the card, whatever the seats say", () => {
  // A queue that vanishes because seats came back, or because the read failed,
  // loses the people on it. Every seat state keeps the card once anybody is
  // on the list.
  for (const seats of [
    { kind: "counted", total: 12, remaining: 5 },
    { kind: "counted", total: 12, remaining: 0 },
    { kind: "unreadable", total: 12 },
    { kind: "uncounted" },
  ] as const) {
    assert.equal(belongsOnWaitlistDesk({ hasEntries: true, seats }), true, JSON.stringify(seats));
  }
});

test("the loader never short-circuits on an empty queue", () => {
  // The exact line that killed the journey:
  //     if (entries.length === 0) return { ok: true, sessions: [] };
  // It cannot come back. A source scan is the only thing that can see it,
  // because a build in which it is present is a build in which everything
  // still type-checks and every test above still passes.
  const src = readFileSync(join(WEB_ROOT, "src/lib/scheduling/waitlist-desk.ts"), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((line) => !line.trim().startsWith("//"))
    .join("\n");
  assert.ok(
    !/entries\.length\s*===\s*0/.test(src),
    "the desk is deciding what to show from whether the queue is already occupied",
  );
  assert.ok(
    /\.from\("sessions"\)[\s\S]{0,400}\.eq\("status", "scheduled"\)/.test(src),
    "the desk no longer reads the sessions in its own right, so it cannot answer for an empty queue",
  );
});
