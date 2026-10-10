import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { shapeMeData, type MeRow } from "@/lib/me/shape-me";

import { resolveBookingLocation } from "./service-address-server";

const SRC = join(new URL(".", import.meta.url).pathname, "..", "..");
const read = (rel: string) => readFileSync(join(SRC, rel), "utf8");

test("client-place service: the server demands an address, whatever the sheet sent", () => {
  const r = resolveBookingLocation({ where: ["client"], serviceAddress: null, sheetLabel: "At the client's place" });
  assert.deepEqual(r, { ok: false, error: "address_required" });
  const short = resolveBookingLocation({ where: ["client"], serviceAddress: { address: "Ab" }, sheetLabel: "x" });
  assert.deepEqual(short, { ok: false, error: "address_too_short" });
});

test("client-place service: a valid address becomes the booking's place, with the note", () => {
  const r = resolveBookingLocation({
    where: ["studio", "client"],
    serviceAddress: { address: "  Calle 10 #45,   Tulum ", note: "Portón azul" },
    sheetLabel: "Studio or client's place",
  });
  assert.deepEqual(r, { ok: true, eventLocation: "Calle 10 #45, Tulum (Portón azul)" });
});

test("studio, remote, agreed and unknown services never ask for an address", () => {
  for (const where of [["studio"], ["remote"], ["agreed"], []] as const) {
    const r = resolveBookingLocation({ where, serviceAddress: { address: "ignored" }, sheetLabel: "Studio" });
    assert.deepEqual(r, { ok: true, eventLocation: "Studio" });
  }
});

test("the booking action validates against the offering, not the sheet", () => {
  const src = read("lib/server-actions/instant-book-action.ts");
  assert.match(src, /loadOfferingWhere\(payload\.offeringId\)/);
  assert.match(src, /eventLocation: place\.eventLocation/);
});

test("the place reaches the talent calendar mirror and the agency booking (ICS reads venue_location_text)", () => {
  const src = read("lib/scheduling/reservation-convert.ts");
  assert.match(src, /location_text: place/);
  assert.match(src, /venue_location_text: place/);
  assert.match(read("lib/calendar/feed-read.ts"), /venue_address \?\? row\.venue_location_text/);
});

test("the booking-confirmed email escapes the visitor-typed place", () => {
  const src = read("lib/email/templates.ts");
  assert.equal((src.match(/escapeHtml\(data\.eventLocation\)/g) ?? []).length, 3);
  assert.doesNotMatch(src, /\$\{data\.eventLocation\}/);
});

test("/me: the loader selects event_location and the list shows the address", () => {
  assert.match(read("lib/me/load-me.ts"), /event_date, event_location/);
  assert.match(read("app/(public)/me/page.tsx"), /item\.eventLocation/);
  const row: MeRow = {
    id: "i1", tenantId: "t1", status: "confirmed", title: "Home visit",
    eventDate: new Date(Date.now() + 86_400_000).toISOString(),
    eventLocation: "Calle 10 #45, Tulum (Portón azul)",
    createdAt: new Date().toISOString(), nextActionBy: null, booking: null,
  };
  assert.equal(shapeMeData([row], Date.now()).upcoming[0]?.eventLocation, "Calle 10 #45, Tulum (Portón azul)");
});

test("the sheet shows the field for client-place services and blocks confirm until it is valid", () => {
  const sheet = read("components/public-booking/CatalogBookingSheet.tsx");
  assert.match(sheet, /addr\.rule === "required" \? <ServiceAddressField/);
  assert.match(read("components/public-booking/use-catalog-booking-confirm.ts"), /serviceAddressValid === false/);
});

test("TUL-516 E2: the sheet passes where into payment copy and the who-step place note", () => {
  const sheet = read("components/public-booking/CatalogBookingSheet.tsx");
  assert.match(sheet, /resolveWhoStepPaymentUi\(\{[\s\S]*where: detail\.where/);
  assert.match(sheet, /<CatalogWhoSummary[\s\S]*where=\{detail\.where\}/);
  assert.match(sheet, /doneStepNextActionCopy\(\{[\s\S]*where: detail\.where/);
});
