/**
 * TUL-1372 (slice 5): the Services widget shows the workspace's roster services in
 * the same band, REQUEST-ONLY, with a client-side Service filter and Who filter
 * over the entries already loaded. Roster entries come only from the host-resolved
 * tenant and only on tenant (agency) pages, never on a talent's own site.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { filterRosterEntries, rosterGridEntries, rosterGridFilters } from "./roster-grid";
import type { RosterServiceItem } from "./roster-services";

const item = (over: Partial<RosterServiceItem> = {}): RosterServiceItem => ({
  listingId: "L1", offeringId: "S1", title: "Chef for dinners", talentProfileId: "tp1", talentName: "Rafa Chef",
  priceCents: 150000, priceIsFrom: true, currency: "MXN", bookingType: "request", clientContact: "workspace", ...over,
});

test("entries carry the talent name, or the workspace label when the entry hides the talent", () => {
  const entries = rosterGridEntries([item(), item({ listingId: "L2", offeringId: "S2", title: "Waiter", talentName: null, talentProfileId: null })], "en", "/contact");
  assert.equal(entries[0]!.who, "Rafa Chef");
  assert.equal(entries[1]!.who, "Our team");
  assert.equal(rosterGridEntries([item({ talentName: null })], "es", "/contact")[0]!.who, "Nuestro equipo");
});

test("entries show the price or From, and the Request link is the prefilled contact form (no ids, no payment)", () => {
  const [e] = rosterGridEntries([item()], "en", "/w/studio/contact");
  assert.match(e!.price, /^From /);
  assert.match(e!.href, /^\/w\/studio\/contact\?message=/);
  assert.doesNotMatch(JSON.stringify(e), /tp1|L1|checkout|pay/i);
  assert.equal(rosterGridEntries([item({ priceCents: null })], "es", "/contact")[0]!.price, "A cotizar");
});

test("Service and Who filter options come from the loaded entries (distinct, sorted); filters combine", () => {
  const entries = rosterGridEntries(
    [
      item(),
      item({ listingId: "L2", offeringId: "S2", title: "Waiter service", talentName: "Ana Server" }),
      item({ listingId: "L3", offeringId: "S3", title: "Chef for dinners", talentName: "Ana Server" }),
    ],
    "en",
    "/contact",
  );
  const f = rosterGridFilters(entries);
  assert.deepEqual(f.services, ["Chef for dinners", "Waiter service"]);
  assert.deepEqual(f.who, ["Ana Server", "Rafa Chef"]);
  assert.equal(filterRosterEntries(entries, {}).length, 3);
  assert.deepEqual(filterRosterEntries(entries, { service: "Chef for dinners" }).map((e) => e.id), ["r0", "r2"]);
  assert.deepEqual(filterRosterEntries(entries, { who: "Ana Server" }).map((e) => e.id), ["r1", "r2"]);
  assert.deepEqual(filterRosterEntries(entries, { service: "Chef for dinners", who: "Ana Server" }).map((e) => e.id), ["r2"]);
  assert.deepEqual(filterRosterEntries(entries, { service: "Nope" }), []);
});

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

test("wiring: tenant pages only, the widget renders the grid, no checkout in the client component", () => {
  const sources = read("src/components/home/homepage-cms-data-sources.ts");
  assert.match(sources, /nativeNeeds\.servicesCatalog && !catalogTalentId && tenantId[\s\S]{0,400}loadRosterServicesWithHub\(/);
  assert.match(sources, /getPlatformHubTenant\(\)[\s\S]{0,200}hub\?\.tenantId !== dataTenantId|dataTenantId !== hub/, "the shared hub tenant never gets roster services");
  const render = read("src/lib/site-admin/builder-node/render.tsx");
  assert.match(render, /RosterServicesGrid/);
  assert.match(render, /rosterServices/);
  const grid = read("src/lib/site-admin/builder-node/roster-services-grid.tsx");
  assert.match(grid, /^"use client";/);
  assert.doesNotMatch(grid, /from "@\/lib\/(payments|orders|cart)/);
  assert.doesNotMatch(grid, /startCard|createCheckout|CheckoutSession/);
});
