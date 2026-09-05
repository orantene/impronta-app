import test from "node:test";
import assert from "node:assert/strict";

import { buildConfirmation, type ConfirmationInput } from "./confirmation";

/**
 * A RESTAURANT reservation must read like a restaurant reservation.
 *
 * This product has two things called a "reservation": an appointment on the
 * inquiry spine, where a booking is a REQUEST that becomes a conversation with
 * an agency about its talent — and a table, which is an order plus an
 * admission and involves no talent, no agency and no request at all. The two
 * ride different notification catalogs for exactly that reason.
 *
 * The failure this guards is not a crash. It is a diner in Glew receiving a
 * confirmation that calls them a client, mentions an agency, or asks them to
 * wait for someone to confirm — every word of which is true of the OTHER
 * product and none of which is true of dinner.
 */

// El Paisa, the real seeded venue: a parrilla in Glew, Buenos Aires. Free,
// pay in person, no card, no deposit.
const EL_PAISA: ConfirmationInput = {
  locale: "es",
  venueName: "El Paisa",
  timeZone: "America/Argentina/Buenos_Aires",
  guestName: "Lucía",
  partySize: 4,
  // 22:00Z on 5 September is 19:00 in Buenos Aires — the seeded dinner window.
  startsAt: new Date("2026-09-05T22:00:00Z"),
  collectedCents: 0,
  cardOnFile: false,
  freeCancelHours: 2,
  graceMinutes: 15,
  addressLine: null,
};

/** Words that belong to the appointments product, never to a table. */
const TALENT_WORDS = [
  "talent", "talento", "agency", "agencia", "roster", "model", "modelo",
  "artist", "artista", "client", "cliente", "booking request", "solicitud",
  "inquiry", "consulta", "quote", "cotización", "pitch",
];

function allText(input: ConfirmationInput): string {
  const c = buildConfirmation(input);
  assert.ok(c, "confirmation must build for a valid zone");
  return [c.subject, c.heading, ...c.lines].join(" \n ").toLowerCase();
}

test("a table booking uses NO talent, agency or client vocabulary", () => {
  const text = allText(EL_PAISA);
  for (const word of TALENT_WORDS) {
    assert.ok(
      !text.includes(word),
      `"${word}" belongs to the appointments product, not to a table: ${text}`,
    );
  }
});

test("the Spanish confirmation is Spanish throughout, not English with a translated line", () => {
  const c = buildConfirmation(EL_PAISA);
  assert.ok(c);
  const text = [c.subject, c.heading, ...c.lines].join(" ");
  // Words that would only appear if an English branch leaked through.
  for (const leak of ["A table for", "at El Paisa,", "Nothing to pay", "Free to cancel", "We hold"]) {
    assert.ok(!text.includes(leak), `English leaked into the Spanish copy: ${leak}`);
  }
  assert.match(text, /Mesa para 4/);
  assert.match(text, /No hay nada que pagar ahora\./);
});

test("a pay-in-person table says nothing was charged and never mentions a card", () => {
  const c = buildConfirmation(EL_PAISA);
  assert.ok(c);
  const text = c.lines.join(" ").toLowerCase();
  assert.ok(text.includes("no hay nada que pagar ahora"), "must say there is nothing to pay");
  // A card sentence here would be a lie: El Paisa stores no card at all.
  for (const card of ["tarjeta", "card", "depósito", "deposito", "deposit"]) {
    assert.ok(!text.includes(card), `a free reservation must not mention "${card}"`);
  }
});

test("the time is the RESTAURANT'S clock, so a diner reads what the door says", () => {
  const c = buildConfirmation(EL_PAISA);
  assert.ok(c);
  // 22:00Z is 19:00 in Buenos Aires. `whenTime` is the SEATING, and it is the
  // only unambiguous witness: 22:00 there means the zone was dropped, 17:00
  // means someone used Cancún, the zone this venue was mistakenly seeded with
  // on 2026-09-05.
  //
  // The first version of this test also banned "17:00" from every line — and
  // failed, because 17:00 is LEGITIMATELY the free-cancel deadline two hours
  // before a 19:00 seating, which the next test requires. A fingerprint that
  // also matches a correct value is not a fingerprint; it just makes the suite
  // red for the right reason at the wrong place. Assert on the field that
  // means one thing.
  assert.equal(c.whenTime, "19:00");
  assert.notEqual(c.whenTime, "22:00");
  assert.notEqual(c.whenTime, "17:00");
  assert.ok(!c.subject.includes("22:00"), "UTC must never reach a diner");
});

test("the free-cancel deadline is the venue's clock too, not the guest's", () => {
  const c = buildConfirmation(EL_PAISA);
  assert.ok(c);
  // 19:00 minus 2 hours, in Buenos Aires.
  assert.ok(
    c.lines.some((l) => l.includes("17:00")),
    `expected a 17:00 deadline in the venue's clock: ${c.lines.join(" | ")}`,
  );
});

test("English renders the restaurant copy too, with the same facts", () => {
  const c = buildConfirmation({ ...EL_PAISA, locale: "en", guestName: null });
  assert.ok(c);
  const text = [c.subject, c.heading, ...c.lines].join(" ").toLowerCase();
  for (const word of TALENT_WORDS) {
    assert.ok(!text.includes(word), `"${word}" leaked into the English table copy`);
  }
  assert.ok(text.includes("a table for 4"));
  assert.ok(text.includes("nothing to pay now"));
  assert.ok(text.includes("19:00"), "the venue's clock, in English too");
});

test("a venue with no street address omits the line rather than printing an empty one", () => {
  // El Paisa genuinely has no address yet, so this is the live case.
  const c = buildConfirmation(EL_PAISA);
  assert.ok(c);
  assert.ok(!c.lines.some((l) => l.trim().length === 0), "no blank line stands in for a missing address");
});
