import assert from "node:assert/strict";
import test from "node:test";

import { dropCoveredRoster, hubEntriesToRosterItems, mergeHubAndLoose } from "./hub-entry-items";
import type { PublicEntry } from "./public-hub";
import { rosterServicesToCatalog, rosterItemsToCatalogRows } from "./roster-catalog";
import { buildRosterRequestDraft } from "./roster-chat-request";
import type { RosterServiceItem } from "./roster-services";

const entry = (over: Partial<PublicEntry> = {}): PublicEntry => ({ id: "e1", name: " Massage ", category: null, photoUrl: null, priceCents: 50000, from: true, currency: "MXN", who: ["Ana", "Bea"], cta: "request", ...over });
const loose = (id: string, title = id): RosterServiceItem => ({ listingId: id, offeringId: `o-${id}`, title, talentProfileId: `p-${id}`, talentName: "Ana", priceCents: 1000, priceIsFrom: false, currency: "USD", bookingType: "instant", clientContact: "talent" });

test("an entry becomes a request-only item with opaque ids and no talent id", () => {
  const [i] = hubEntriesToRosterItems([entry()]);
  assert.deepEqual([i.listingId, i.offeringId, i.talentProfileId, i.talentName, i.bookingType, i.clientContact], ["entry_e1", "", null, "Ana, Bea", "request", "workspace"]);
  assert.deepEqual([i.title, i.priceCents, i.priceIsFrom, i.currency], ["Massage", 50000, true, "MXN"]);
});

test("a hidden-who entry carries no names; a quote-only entry has no price and no 'from'", () => {
  const [i] = hubEntriesToRosterItems([entry({ who: [], priceCents: null, from: true, currency: null })]);
  assert.equal(i.talentName, null);
  assert.deepEqual([i.priceCents, i.priceIsFrom, i.currency], [null, false, ""]);
});

test("an entry with a price but no currency shows no price (never a guessed currency)", () => {
  const [i] = hubEntriesToRosterItems([entry({ priceCents: 50000, from: false, currency: null })]);
  assert.deepEqual([i.priceCents, i.priceIsFrom, i.currency], [null, false, ""]);
});

test("covered loose rows are dropped, review-queue rows stay, and an empty covered set changes nothing", () => {
  const rows = [loose("a"), loose("b"), loose("queued")];
  assert.deepEqual(dropCoveredRoster(rows, new Set(["a", "b"])).map((r) => r.listingId), ["queued"]);
  assert.deepEqual(dropCoveredRoster(rows, new Set()).map((r) => r.listingId), ["a", "b", "queued"]);
});

test("merge puts entries first then remaining loose rows; unreadable hub = today's list", () => {
  const out = mergeHubAndLoose({ entries: [entry()], coveredListingIds: new Set(["a"]) }, [loose("a"), loose("q")]);
  assert.deepEqual(out.map((r) => r.listingId), ["entry_e1", "q"]);
  assert.deepEqual(mergeHubAndLoose({ entries: [], coveredListingIds: new Set() }, [loose("a")]).map((r) => r.listingId), ["a"]);
});

test("the catalog API, the guest dock and the front-door request all render an entry item", () => {
  const items = mergeHubAndLoose({ entries: [entry({ id: "e9" })], coveredListingIds: new Set() }, []);
  const api = rosterServicesToCatalog(items, "es");
  assert.deepEqual([api[0].id, api[0].booking, api[0].guest_sellable, api[0].talent, api[0].price.startsWith("Desde")], ["roster_entry_e9", "request", false, "Ana, Bea", true]);
  const rows = rosterItemsToCatalogRows(items);
  assert.deepEqual([rows[0].id, rows[0].requestOnly, rows[0].ownerName], ["roster:entry_e9", true, "Ana, Bea"]);
  const draft = buildRosterRequestDraft("quiero un massage", items);
  assert.equal(draft.lines[0]?.entryId, "roster_entry_e9");
});
