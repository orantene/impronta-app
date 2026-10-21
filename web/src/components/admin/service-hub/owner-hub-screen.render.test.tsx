import assert from "node:assert/strict";
import { describe, it } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";

import type { OwnerHub } from "@/lib/service-hub/entries.server";
import type { EntryListing } from "@/lib/service-hub/entries";
import { OwnerHubScreen } from "./OwnerHubScreen";

type Ok = Extract<OwnerHub, { ok: true }>;

const router = { push() {}, replace() {}, refresh() {}, back() {}, forward() {}, prefetch() {} } as never;
const wrap = (node: React.ReactNode) => <AppRouterContext.Provider value={router}>{node}</AppRouterContext.Provider>;

const L = (id: string, over: Partial<EntryListing> = {}): EntryListing => ({
  listingId: id, talentProfileId: `p-${id}`, talentName: `Talent ${id}`, title: "Deep massage", categoryId: "massage",
  durationMinutes: 60, bookingType: "request", priceCents: 50000, currency: "USD", entryId: null, talentAccepted: true, ...over,
});

const hub: Ok = {
  ok: true,
  ready: true,
  entries: [
    { id: "e1", name: "Massage", category: "Massage", photoMediaId: null, photoChoices: [], bookingType: "request", hubPriceCents: 55000, currency: "USD", showWho: "name", clientContact: "workspace", featured: false, hidden: false, ownOfferingId: null, members: [L("m1", { entryId: "e1" }), L("m2", { entryId: "e1", priceCents: 45000 })], differences: [{ field: "price", values: [] }] },
    { id: "e2", name: "Studio hire", category: "Rooms", photoMediaId: null, photoChoices: [], bookingType: "request", hubPriceCents: 20000, currency: "USD", showWho: "name", clientContact: "workspace", featured: false, hidden: false, ownOfferingId: "own-1", members: [], differences: [] },
  ],
  queue: [{ listing: L("q1"), joinableEntryIds: ["e1"], options: ["accept_into_group", "new_entry", "skip"] }, { listing: L("q2", { categoryId: "yoga", title: "Yoga" }), joinableEntryIds: [], options: ["new_entry", "skip"] }],
  suggestions: [],
  ownServices: [{ offeringId: "own-2", title: "Photo studio" }],
};

describe("OwnerHubScreen", () => {
  it("review queue: add to the matching group is the primary action, new entry and skip are there", () => {
    const html = renderToStaticMarkup(wrap(<OwnerHubScreen hub={hub} roles={["admin"]} locale="en" />));
    assert.match(html, /To review · 2/);
    assert.match(html, /Add to Massage/);
    assert.match(html, /Make a new entry/);
    assert.match(html, />Skip</);
    // the card with no compatible group offers no 'add to'
    const q2 = html.slice(html.indexOf('data-testid="queue-q2"'));
    assert.doesNotMatch(q2.slice(0, q2.indexOf("</li>")), /Add to/);
  });

  it("entries list the people, what differs, and the workspace's own service in the same list", () => {
    const html = renderToStaticMarkup(wrap(<OwnerHubScreen hub={hub} roles={["admin"]} locale="en" />));
    assert.match(html, /2 people/);
    assert.match(html, /Differs: Price/);
    assert.match(html, /Studio hire/);
    assert.match(html, />Yours</);
    assert.match(html, /Your own services/);
    assert.match(html, /Photo studio/);
  });

  it("Spanish", () => {
    const html = renderToStaticMarkup(wrap(<OwnerHubScreen hub={hub} roles={["admin"]} locale="es" />));
    assert.match(html, /Por revisar · 2/);
    assert.match(html, /Agregar a Massage/);
    assert.match(html, /Lo que vendes/);
    assert.match(html, /Tus propios servicios/);
  });

  it("a viewer or manager sees the screen but cannot decide the queue (buttons disabled)", () => {
    const html = renderToStaticMarkup(wrap(<OwnerHubScreen hub={hub} roles={["manager"]} locale="en" />));
    const q1 = html.slice(html.indexOf('data-testid="queue-q1"'));
    const card = q1.slice(0, q1.indexOf("</li>"));
    assert.equal((card.match(/disabled=""/g) ?? []).length, 3);
    assert.doesNotMatch(html, /Your own services/);
  });

  it("not ready and empty states are said plainly", () => {
    const empty: Ok = { ...hub, ready: false, entries: [], queue: [], ownServices: [] };
    const html = renderToStaticMarkup(wrap(<OwnerHubScreen hub={empty} roles={["admin"]} locale="en" />));
    assert.match(html, /not available yet/);
    assert.match(html, /Nothing to review\./);
    assert.match(html, /No entries yet\./);
  });
});
