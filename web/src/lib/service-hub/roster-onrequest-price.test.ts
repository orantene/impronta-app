/**
 * TUL-1604 (rule D-10a): a price is shown only when the item is public. End to end from the
 * readers: an on_request roster item (loose or inside a hub entry) carries no price on ANY
 * surface (book page list, Services widget grid, catalog API, guest dock, front-door request),
 * not as an amount, a "from" or a label. A public item keeps its price.
 */
import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";

import { rosterGridEntries } from "./roster-grid";
import { rosterItemsToCatalogRows, rosterServicesToCatalog, mergeRosterIntoCatalog } from "./roster-catalog";
import { buildRosterRequestDraft, buildRosterRequestMessage } from "./roster-chat-request";
import { loadRosterServicesWithHub } from "./hub-roster.server";
import { rosterRequestHref, rosterRequestMessage } from "./roster-request";
import { _resetRosterSellableCacheForTests, type RosterServiceItem } from "./roster-services";

beforeEach(() => _resetRosterSellableCacheForTests());

type Row = Record<string, unknown>;
const T = "tenant-1";
const AMOUNT = 123456; // "1,234.56" / "1234": any trace of this in an on_request output is a leak

function fakeDb(tables: Record<string, Row[]>) {
  return {
    from(table: string) {
      let rows = [...(tables[table] ?? [])];
      const q: Record<string, unknown> = {};
      Object.assign(q, {
        select: () => q,
        eq: (c: string, v: unknown) => ((rows = rows.filter((r) => r[c] === v)), q),
        in: (c: string, vs: unknown[]) => ((rows = rows.filter((r) => vs.includes(r[c]))), q),
        neq: (c: string, v: unknown) => ((rows = rows.filter((r) => r[c] !== v)), q),
        order: () => q,
        limit: () => q,
        maybeSingle: async () => ({ data: rows[0] ?? null, error: null }),
        then: (res: (v: unknown) => unknown) => Promise.resolve({ data: rows, error: null }).then(res),
      });
      return q;
    },
    // the batch sellable function answers with the ids it was asked about (every listing here is sellable)
    rpc: async (_name: string, args: { p_listing_ids?: string[] }) => ({ data: args?.p_listing_ids ?? true, error: null }),
    storage: { from: () => ({ getPublicUrl: () => ({ data: { publicUrl: "" } }) }) },
  } as never;
}

const listing = (id: string, entryId: string | null): Row => ({
  id, tenant_id: T, talent_profile_id: `p-${id}`, offering_id: `o-${id}`, status: "accepted", price_mode: "talent_price", margin_bps: null, price_cents: null,
  currency: "USD", show_who: "name", client_contact: "workspace", booking_type: "request", entry_id: entryId, owner_skipped_at: null, created_at: "2026-10-01",
});
const entry = (id: string, name: string): Row => ({ id, tenant_id: T, name, category: null, photo_media_id: null, hub_price_cents: null, currency: "USD", show_who: "name", featured: false, hidden: false, own_offering_id: null });

// loose: "pub" (public) and "req" (on_request); hub entries: "Massage" (member on_request), "Facial" (member public)
const KEYS = ["pub", "req", "m-req", "m-pub"] as const;
const TITLE: Record<string, string> = { pub: "Chef dinner", req: "Private lesson", "m-req": "Massage", "m-pub": "Facial" };
const world = (): Record<string, Row[]> => ({
  workspace_service_entries: [entry("e-req", "Massage"), entry("e-pub", "Facial")],
  workspace_service_listings: [listing("pub", null), listing("req", null), listing("m-req", "e-req"), listing("m-pub", "e-pub")],
  talent_offerings: KEYS.map((k) => ({
    id: `o-${k}`, talent_profile_id: `p-${k}`, title: TITLE[k], category: "x", amount_cents: AMOUNT, currency: "USD", status: "published", moderation_state: "approved",
    visibility: k === "req" || k === "m-req" ? "on_request" : "public",
  })),
  talent_profiles: KEYS.map((k) => ({ id: `p-${k}`, display_name: `T ${k}`, deleted_at: null, is_publicly_hidden: false, is_publicly_listed: true, visibility: "public", profile_kind: "talent" })),
  agency_talent_roster: KEYS.map((k) => ({ tenant_id: T, talent_profile_id: `p-${k}`, status: "active" })),
});

const LEAK = /123456|1,?234|1\.234|\bdesde\b|\bfrom\b/i;

async function items(): Promise<RosterServiceItem[]> {
  return loadRosterServicesWithHub(fakeDb(world()), T);
}
const byTitle = (list: readonly RosterServiceItem[], title: string) => list.filter((i) => i.title === title);

test("reader: on_request loose and hub items carry priceCents null; public ones keep it", async () => {
  const list = await items();
  assert.deepEqual(list.map((i) => i.title).sort(), ["Chef dinner", "Facial", "Massage", "Private lesson"]);
  assert.equal(byTitle(list, "Private lesson")[0].priceCents, null);
  assert.equal(byTitle(list, "Massage")[0].priceCents, null);
  assert.equal(byTitle(list, "Chef dinner")[0].priceCents, AMOUNT);
  assert.equal(byTitle(list, "Facial")[0].priceCents, AMOUNT);
});

for (const [name, titles] of [["loose", ["Private lesson"]], ["hub entry", ["Massage"]]] as const) {
  test(`${name} on_request: no price on the book list, widget grid, catalog API, dock and request`, async () => {
    const list = (await items()).filter((i) => titles.includes(i.title));
    assert.equal(list.length, 1);
    // /book list + widget grid (both read rosterServicesToCatalog / rosterGridEntries)
    const api = rosterServicesToCatalog(list, "en");
    assert.equal(api[0].amount_cents, null);
    assert.doesNotMatch(JSON.stringify(mergeRosterIntoCatalog([], api)), LEAK);
    assert.doesNotMatch(JSON.stringify(rosterServicesToCatalog(list, "es")), LEAK);
    assert.doesNotMatch(JSON.stringify(rosterGridEntries(list, "en", "/contact")), LEAK);
    assert.doesNotMatch(JSON.stringify(rosterGridEntries(list, "es", "/contact")), LEAK);
    // guest dock
    const rows = rosterItemsToCatalogRows(list);
    assert.equal(rows[0].amountCents, null);
    assert.doesNotMatch(JSON.stringify(rows), LEAK);
    // contact-form request + front-door chat request
    assert.doesNotMatch(rosterRequestMessage(list[0], "en") + rosterRequestHref("/contact", list[0], "es"), LEAK);
    const draft = buildRosterRequestDraft(`quiero ${list[0].title}`, list);
    assert.equal(draft.lines.length, 1);
    assert.doesNotMatch(JSON.stringify(draft) + buildRosterRequestMessage(draft, "es").message + buildRosterRequestMessage(draft, "en").message, LEAK);
  });
}

test("public items keep their price on every surface", async () => {
  const list = (await items()).filter((i) => i.title === "Chef dinner" || i.title === "Facial");
  assert.equal(list.length, 2);
  assert.ok(rosterServicesToCatalog(list, "en").every((c) => c.amount_cents === AMOUNT && /1,234/.test(c.price)));
  assert.ok(rosterItemsToCatalogRows(list).every((r) => r.amountCents === AMOUNT));
  assert.ok(rosterGridEntries(list, "en", "/contact").every((g) => /1,234/.test(g.price)));
});
