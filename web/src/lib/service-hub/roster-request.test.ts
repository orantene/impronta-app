/**
 * TUL-1372 (slice 3): roster services on the workspace /book page are REQUEST-ONLY
 * (PM decision): the button opens the workspace contact form with the service and
 * the talent (when the entry shows them) written into the message. No price
 * checkout, no pay button, until the listing checkout reader lands.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { contactMessagePrefill, rosterRequestHref, rosterRequestMessage } from "./roster-request";
import type { RosterServiceItem } from "./roster-services";

const item = (over: Partial<RosterServiceItem> = {}): RosterServiceItem => ({
  listingId: "L1", offeringId: "S1", title: "Chef for dinners", talentProfileId: "tp1", talentName: "Rafa Chef",
  priceCents: 150000, priceIsFrom: true, currency: "MXN", bookingType: "request", clientContact: "workspace", ...over,
});

test("the request message names the service and the talent, in ES and EN", () => {
  assert.equal(rosterRequestMessage(item(), "en"), "I'd like to request: Chef for dinners (with Rafa Chef).");
  assert.equal(rosterRequestMessage(item(), "es"), "Quiero solicitar: Chef for dinners (con Rafa Chef).");
});

test("when the entry hides the talent, the message never names them", () => {
  assert.equal(rosterRequestMessage(item({ talentName: null, talentProfileId: null }), "en"), "I'd like to request: Chef for dinners.");
  assert.doesNotMatch(rosterRequestMessage(item({ talentName: null }), "es"), /con /);
});

test("the href is the workspace contact page with a prefilled message, never a checkout", () => {
  const href = rosterRequestHref("/contact", item(), "en");
  assert.match(href, /^\/contact\?message=/);
  assert.equal(decodeURIComponent(href.split("message=")[1]!), "I'd like to request: Chef for dinners (with Rafa Chef).");
  assert.doesNotMatch(href, /pay|checkout|listing|tp1|L1/i, "no ids, no payment");
  assert.match(rosterRequestHref("/w/studio/contact", item(), "es"), /^\/w\/studio\/contact\?message=/);
});

test("the contact prefill is trimmed, stripped of control characters and capped", () => {
  assert.equal(contactMessagePrefill({ message: "  hello\u0000 there  " }), "hello there");
  assert.equal(contactMessagePrefill({ message: "x".repeat(900) })!.length, 600);
  assert.equal(contactMessagePrefill({ message: ["first", "second"] }), "first");
  assert.equal(contactMessagePrefill({ message: "   " }), null);
  assert.equal(contactMessagePrefill({}), null);
  assert.equal(contactMessagePrefill(undefined), null);
});

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

test("wiring: /book lists roster services for agency hosts, the contact form takes the prefill, copy is ES and EN", () => {
  const book = read("src/app/(public)/book/page.tsx");
  assert.match(book, /host\.kind === "agency"[\s\S]{0,400}loadWorkspaceRosterServices\(/);
  assert.match(book, /RosterRequestList/);
  const contact = read("src/app/(public)/contact/page.tsx");
  assert.match(contact, /contactMessagePrefill\(/);
  assert.match(read("src/app/(public)/contact/ContactInquiryForm.tsx"), /defaultMessage/);
  for (const loc of ["en", "es"]) {
    const j = JSON.parse(read(`messages/${loc}.json`)) as { public: { bookPage: Record<string, string> } };
    for (const k of ["rosterHeading", "rosterRequest", "rosterNote"]) assert.ok(j.public.bookPage[k], `${loc} ${k}`);
  }
  // No pay button on a roster entry.
  const list = read("src/app/(public)/book/RosterRequestList.tsx");
  assert.doesNotMatch(list, /from "@\/lib\/(payments|orders|cart)/);
  assert.doesNotMatch(list, /startCard|createCheckout|CheckoutSession|<button/);
});
