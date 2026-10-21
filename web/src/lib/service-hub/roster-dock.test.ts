/**
 * TUL-1372 (slice 4): roster services in the guest dock catalog (the front-door chat).
 * REQUEST-ONLY: the row carries no offering id, so it can never be added to an
 * inquiry as a line or sold through /book; the guest's action is "Ask".
 * Host-resolved tenant only; per-talent pages never show the workspace roster.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { loadCatalogRowsForScope } from "@/lib/messages-v5/items-catalog";
import { rosterItemsToCatalogRows } from "./roster-catalog";
import type { RosterServiceItem } from "./roster-services";

const item = (over: Partial<RosterServiceItem> = {}): RosterServiceItem => ({
  listingId: "L1", offeringId: "S1", title: "Chef for dinners", talentProfileId: "tp1", talentName: "Rafa Chef",
  priceCents: 150000, priceIsFrom: false, currency: "MXN", bookingType: "request", clientContact: "workspace", ...over,
});

function emptyAdmin() {
  const q = (): Record<string, unknown> => {
    const c: Record<string, unknown> = {};
    Object.assign(c, {
      select: () => c, eq: () => c, neq: () => c, in: () => c, is: () => c, gte: () => c, order: () => c, limit: () => c,
      maybeSingle: async () => ({ data: null, error: null }),
      then: (res: (v: { data: unknown[]; error: null }) => unknown) => Promise.resolve({ data: [], error: null }).then(res),
    });
    return c;
  };
  return { from: () => q() } as never;
}

test("a roster entry becomes a request-only service row: no offering id, no talent id, owner chip only when named", () => {
  const [row] = rosterItemsToCatalogRows([item()]);
  assert.equal(row!.category, "service");
  assert.equal(row!.id, "roster:L1");
  assert.equal(row!.requestOnly, true);
  assert.equal(row!.offeringId, undefined, "cannot be added as an inquiry line or booked");
  assert.equal(row!.talentProfileId, undefined, "never enters the talent lineup cart");
  assert.equal(row!.ownerName, "Rafa Chef");
  assert.equal(row!.amountCents, 150000);
  assert.equal(row!.currency, "MXN");
  assert.equal(rosterItemsToCatalogRows([item({ talentName: null })])[0]!.ownerName, null);
  assert.equal(rosterItemsToCatalogRows([item({ priceCents: null })])[0]!.amountCents, null);
});

const base = { window: null, now: new Date(), date: null, reservations: false };

test("tenant-wide dock catalogs append the roster rows; a talent-bound dock never does", async () => {
  const roster = [item()];
  const wide = await loadCatalogRowsForScope(emptyAdmin(), { ...base, tenantId: "t1", talentProfileId: null, forcedTalent: false, roster });
  assert.deepEqual(wide.map((r) => r.id), ["roster:L1"]);
  const talentOwned = await loadCatalogRowsForScope(emptyAdmin(), { ...base, tenantId: "t1", talentProfileId: "tp9", forcedTalent: false, roster });
  assert.ok(!talentOwned.some((r) => r.id.startsWith("roster:")));
  const forced = await loadCatalogRowsForScope(emptyAdmin(), { ...base, tenantId: "t1", talentProfileId: "tp9", forcedTalent: true, roster });
  assert.ok(!forced.some((r) => r.id.startsWith("roster:")));
});

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

test("wiring: guest scope only, host-resolved tenant, request-only flag reaches the dock and suppresses Add/Buy", () => {
  const catalog = read("src/lib/messages-v5/items-catalog.ts");
  assert.match(catalog, /input\.includeRoster && !talentProfileId \? await loadRosterServicesWithHub\(admin, input\.tenantId\)/);
  const actions = read("src/app/t/[profileCode]/_actions/guest-catalog-actions.ts");
  assert.match(actions, /guestCatalogTenantAllowed/);
  assert.match(actions, /includeRoster: tenantKind !== "hub"/);
  assert.doesNotMatch(read("src/lib/server-actions/messaging-items.ts"), /includeRoster/, "staff Messages never asks for the roster rows");
  assert.match(actions, /requestOnly: r\.requestOnly === true/);
  const dock = read("src/app/t/[profileCode]/_chat/GuestDockCatalog.tsx");
  assert.match(dock, /buyHref && row\.available && !row\.requestOnly/);
});
