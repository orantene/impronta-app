/**
 * UNIT TEST — reminder-copy.ts.
 *
 * Runs in `test:sessions` (glob lane). `tsx --test` executes without
 * typechecking, so a pass is not a claim that the branch compiles.
 */

import { strict as assert } from "node:assert";
import { test } from "node:test";

import { buildSessionReminder } from "./reminder-copy";

const CANCUN = "America/Cancun";
const MADRID = "Europe/Madrid";

test("the time is the VENUE's clock, not the reader's, and the zone is named", () => {
  // 2027-09-12T01:00Z is 20:00 on the 11th in Cancun. A reader in Madrid must
  // be told the Cancun time, or they act on a plausible wrong answer.
  const copy = buildSessionReminder({
    startsAt: "2027-09-12T01:00:00.000Z",
    timeZone: CANCUN,
    title: "Posing course",
  });
  assert.ok(copy);
  assert.match(copy!.lines[0]!, /20:00/);
  assert.match(copy!.lines[0]!, /11/);
  // Named, because "20:00" alone is ambiguous to anyone reading it elsewhere.
  assert.match(copy!.lines[0]!, /America\/Cancun/);
});

test("the same instant reads differently for a different venue zone", () => {
  const instant = "2027-09-12T01:00:00.000Z";
  const a = buildSessionReminder({ startsAt: instant, timeZone: CANCUN, title: "X" });
  const b = buildSessionReminder({ startsAt: instant, timeZone: MADRID, title: "X" });
  assert.ok(a && b);
  assert.notEqual(a!.lines[0], b!.lines[0]);
});

test("NO ZONE IS A REFUSAL, never a UTC fallback", () => {
  // A reminder naming the wrong hour is worse than no reminder: the second is
  // visible to the operator who expected it, the first to nobody until somebody
  // misses a class.
  for (const tz of ["", "   "]) {
    assert.equal(
      buildSessionReminder({ startsAt: "2027-09-12T01:00:00.000Z", timeZone: tz, title: "X" }),
      null,
    );
  }
});

test("an unusable zone refuses rather than rendering in the server's clock", () => {
  assert.equal(
    buildSessionReminder({
      startsAt: "2027-09-12T01:00:00.000Z",
      timeZone: "Mars/Olympus",
      title: "X",
    }),
    null,
  );
});

test("an unparseable instant refuses rather than printing Invalid Date at a customer", () => {
  assert.equal(
    buildSessionReminder({ startsAt: "not-a-date", timeZone: CANCUN, title: "X" }),
    null,
  );
});

test("an empty title refuses — a reminder about nothing is not a reminder", () => {
  assert.equal(
    buildSessionReminder({ startsAt: "2027-09-12T01:00:00.000Z", timeZone: CANCUN, title: "  " }),
    null,
  );
});

test("es and en both render, and differ", () => {
  const base = { startsAt: "2027-09-12T01:00:00.000Z", timeZone: CANCUN, title: "Posing course" };
  const en = buildSessionReminder({ ...base, locale: "en" });
  const es = buildSessionReminder({ ...base, locale: "es" });
  assert.ok(en && es);
  assert.notEqual(en!.subject, es!.subject);
  assert.notEqual(en!.heading, es!.heading);
  assert.match(es!.subject, /Manana/);
  // Both name the class, so a customer with several knows which one.
  assert.match(en!.subject, /Posing course/);
  assert.match(es!.subject, /Posing course/);
});

test("an unknown locale falls back to en rather than refusing", () => {
  // A locale we do not speak is not a reason to send nothing — unlike a missing
  // zone, which changes the FACTS rather than the language.
  const copy = buildSessionReminder({
    startsAt: "2027-09-12T01:00:00.000Z",
    timeZone: CANCUN,
    title: "X",
    locale: "de",
  });
  assert.ok(copy);
  assert.match(copy!.subject, /Tomorrow/);
});

test("the venue line appears only when there is a venue", () => {
  const withVenue = buildSessionReminder({
    startsAt: "2027-09-12T01:00:00.000Z",
    timeZone: CANCUN,
    title: "X",
    venueName: "Impronta Studio",
  });
  const without = buildSessionReminder({
    startsAt: "2027-09-12T01:00:00.000Z",
    timeZone: CANCUN,
    title: "X",
    venueName: "   ",
  });
  assert.ok(withVenue && without);
  assert.equal(withVenue!.lines.length, without!.lines.length + 1);
  assert.ok(withVenue!.lines.some((l) => l.includes("Impronta Studio")));
});

test("no em dashes in anything a customer reads", () => {
  // Product copy rule, and easy to reintroduce by hand.
  const copy = buildSessionReminder({
    startsAt: "2027-09-12T01:00:00.000Z",
    timeZone: CANCUN,
    title: "Posing course",
    venueName: "Impronta Studio",
  });
  assert.ok(copy);
  for (const text of [copy!.subject, copy!.heading, ...copy!.lines]) {
    assert.ok(!text.includes("—"), `em dash in: ${text}`);
  }
});
