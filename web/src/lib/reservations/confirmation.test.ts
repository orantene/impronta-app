import test from "node:test";
import assert from "node:assert/strict";
import { buildConfirmation, type ConfirmationInput } from "./confirmation";

const AT = new Date("2026-09-06T01:00:00Z"); // Saturday 5 September, 20:00 in Cancun (UTC-5)

const base = (over: Partial<ConfirmationInput> = {}): ConfirmationInput => ({
  locale: "en",
  venueName: "Casa Rizo",
  timeZone: "America/Cancun",
  guestName: "Ana",
  partySize: 4,
  startsAt: AT,
  collectedCents: 0,
  cardOnFile: false,
  freeCancelHours: 2,
  graceMinutes: 15,
  addressLine: "Calle 8 Sur, Tulum",
  ...over,
});

test("the time is the VENUE'S clock, not UTC and not the guest's", () => {
  // A diner in Madrid booking a table in Tulum must read 20:00, because that is
  // what the door will say.
  const c = buildConfirmation(base())!;
  assert.equal(c.whenTime, "20:00");
  assert.ok(c.subject.includes("20:00"));

  const madrid = buildConfirmation(base({ timeZone: "Europe/Madrid" }))!;
  assert.equal(madrid.whenTime, "03:00", "same instant, different venue, different clock");
});

test("an unknown zone returns NULL rather than falling back to UTC", () => {
  // A confirmation naming the wrong hour is worse than one that did not send:
  // the guest acts on it and arrives when the restaurant is shut.
  assert.equal(buildConfirmation(base({ timeZone: "Mars/Olympus" })), null);
  assert.equal(buildConfirmation(base({ timeZone: "" })), null);
});

test("the cancellation deadline is computed on the INSTANT, then rendered locally", () => {
  const c = buildConfirmation(base({ freeCancelHours: 2 }))!;
  assert.ok(
    c.lines.some((l) => l.includes("18:00")),
    `expected an 18:00 deadline, got: ${c.lines.join(" | ")}`,
  );
});

test("the deadline survives a DST boundary, because hours are subtracted from the instant", () => {
  // Europe/Madrid springs forward 2027-03-28 at 02:00. A 03:30 local seating is
  // 01:30Z; two hours before is 23:30Z, which reads 00:30 local — NOT 01:30,
  // which is what subtracting on the wall clock would produce.
  const c = buildConfirmation(
    base({
      timeZone: "Europe/Madrid",
      startsAt: new Date("2027-03-28T01:30:00Z"),
      freeCancelHours: 2,
    }),
  )!;
  assert.ok(
    c.lines.some((l) => l.includes("00:30")),
    `expected a 00:30 deadline across the gap, got: ${c.lines.join(" | ")}`,
  );
});

test("nothing charged says NOTHING WAS CHARGED before it mentions the card", () => {
  // A guest who reads "we have your card" without reading "nothing is charged"
  // phones the restaurant.
  const c = buildConfirmation(base({ cardOnFile: true, collectedCents: 0 }))!;
  const line = c.lines.find((l) => l.toLowerCase().includes("card"))!;
  assert.ok(line.startsWith("Nothing was charged"), line);
});

test("a deposit says what it is FOR, not just that it was taken", () => {
  const c = buildConfirmation(base({ collectedCents: 2000 }))!;
  assert.ok(c.lines.some((l) => l.includes("$20.00") && l.includes("applied to your bill")));
});

test("the hold length is stated, because a guest who does not know arrives at 20:25", () => {
  const c = buildConfirmation(base({ graceMinutes: 15 }))!;
  assert.ok(c.lines.some((l) => l.includes("15 minutes")));
});

test("Spanish is a real translation, not English with a flag", () => {
  const c = buildConfirmation(base({ locale: "es", collectedCents: 2000 }))!;
  assert.ok(c.heading.includes("Listo"));
  assert.ok(c.lines.some((l) => l.startsWith("Mesa para 4")));
  assert.ok(c.lines.some((l) => l.includes("Deposito")));
  assert.ok(c.subject.startsWith("Tu mesa"));
  // The date is localised too, not just the sentences around it.
  assert.ok(/septiembre/i.test(c.whenDate), c.whenDate);
});

test("no em dashes anywhere in guest-facing copy", () => {
  for (const locale of ["en", "es"] as const) {
    const c = buildConfirmation(base({ locale, collectedCents: 2000, cardOnFile: true }))!;
    const all = [c.subject, c.heading, ...c.lines].join(" ");
    assert.ok(!all.includes("—"), `em dash in ${locale}: ${all}`);
  }
});

test("a missing guest name does not produce a greeting with a hole in it", () => {
  for (const name of [null, "", "   "]) {
    const c = buildConfirmation(base({ guestName: name }))!;
    assert.equal(c.heading, "You are booked.");
    assert.ok(!c.heading.includes("null") && !c.heading.includes("undefined"));
  }
});

test("a venue with no address simply omits the line", () => {
  const c = buildConfirmation(base({ addressLine: null }))!;
  assert.ok(!c.lines.some((l) => l.includes("Calle")));
  assert.ok(c.lines.length >= 4, "the rest of the confirmation survives");
});
