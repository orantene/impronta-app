/**
 * TUL-1372 (slice 2): roster services reach the public catalog API
 * (`GET /api/public/booking/business-catalog`, the catalog page assistants and
 * the front-door chat read) for AGENCY hosts only. They are labelled as roster
 * entries, honour show-who, state "from" prices, and are request-only until the
 * listing checkout reader exists.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { mergeRosterIntoCatalog, rosterServicesToCatalog } from "./roster-catalog";
import type { RosterServiceItem } from "./roster-services";

const item = (over: Partial<RosterServiceItem> = {}): RosterServiceItem => ({
  listingId: "L1", offeringId: "S1", title: "Chef for dinners", talentProfileId: "tp1", talentName: "Rafa Chef",
  priceCents: 150000, priceIsFrom: false, currency: "MXN", bookingType: "request", clientContact: "workspace", ...over,
});

test("a roster entry becomes a catalog service labelled roster, request-only, in the service currency", () => {
  const [s] = rosterServicesToCatalog([item()], "en");
  assert.equal(s!.id, "roster_L1", "opaque, listing-derived: never the real offering id");
  assert.equal(s!.guest_sellable, false, "request-only: not guest-sellable");
  assert.equal(s!.title, "Chef for dinners");
  assert.equal(s!.source, "roster");
  assert.equal(s!.booking, "request", "request-only until the listing checkout reader is wired");
  assert.equal(s!.amount_cents, 150000);
  assert.equal(s!.currency, "MXN");
  assert.match(s!.price, /1,?500/);
});

test("from prices say From/Desde; a quote-only entry states no figure", () => {
  assert.match(rosterServicesToCatalog([item({ priceIsFrom: true })], "en")[0]!.price, /^From /);
  assert.match(rosterServicesToCatalog([item({ priceIsFrom: true })], "es")[0]!.price, /^Desde /);
  const quote = rosterServicesToCatalog([item({ priceCents: null })], "es")[0]!;
  assert.equal(quote.amount_cents, null);
  assert.equal(quote.price, "A cotizar");
  assert.equal(rosterServicesToCatalog([item({ priceCents: null })], "en")[0]!.price, "Quote");
});

test("show-who: the talent name only when the entry shows it; never a profile id or contact", () => {
  assert.equal(rosterServicesToCatalog([item({ talentName: "Rafa Chef" })], "en")[0]!.talent, "Rafa Chef");
  const hidden = rosterServicesToCatalog([item({ talentName: null, talentProfileId: null })], "en")[0]!;
  assert.equal(hidden.talent, null);
  assert.ok(!JSON.stringify(rosterServicesToCatalog([item()], "en")).match(/tp1|phone|email|whatsapp/i));
});

test("merge: roster entries follow the workspace's own services and never expose a real offering id", () => {
  const own = [{ id: "OWN", title: "House service", description: null, category: null, duration_minutes: null, price: "$500", amount_cents: 50000, currency: "MXN", guest_sellable: true as const }];
  const merged = mergeRosterIntoCatalog(own, rosterServicesToCatalog([item(), item({ offeringId: "OWN", listingId: "L2" })], "en"));
  assert.deepEqual(merged.map((s) => s.id), ["OWN", "roster_L1", "roster_L2"]);
  assert.ok(!JSON.stringify(rosterServicesToCatalog([item({ talentName: null, talentProfileId: null })], "en")).includes("S1"), "a hidden-who entry never leaks the offering id");
});

test("the route merges roster services for AGENCY hosts only (never the shared hub host)", () => {
  const src = readFileSync(join(process.cwd(), "src/app/api/public/booking/business-catalog/route.ts"), "utf8");
  assert.match(src, /loadRosterServicesWithHub\(admin, host\.tenantId\)/);
  assert.match(src, /hostKind === "agency"[\s\S]{0,200}loadRosterServicesWithHub/);
  assert.match(src, /mergeRosterIntoCatalog\(/);
});
