/**
 * TUL-1415 / TUL-1587: the roster request rides on the guest message as structured lines.
 * The client only proposes opaque ids + quantities; the server keeps what is on the roster.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { buildRosterRequestDraft } from "./roster-chat-request";
import {
  ROSTER_REQUEST_META_KEY,
  readRosterRequestMeta,
  rosterRequestMetadata,
  sanitizeRosterRequestWire,
  toRosterRequestWire,
} from "./roster-request-meta";
import type { RosterServiceItem } from "./roster-services";

const item = (over: Partial<RosterServiceItem> = {}): RosterServiceItem => ({
  listingId: "L1", offeringId: "OFFER-SECRET", title: "Private chef", talentProfileId: "TALENT-SECRET", talentName: "Rafa",
  priceCents: 150000, priceIsFrom: false, currency: "MXN", bookingType: "request", clientContact: "workspace", ...over,
});
const chef = item();
const waiter = item({ listingId: "L2", title: "Waiter", talentName: null, talentProfileId: null });
const all = [chef, waiter];

test("a matched sentence becomes a wire request and a stored request with one line per service", () => {
  const draft = buildRosterRequestDraft("chef for 10 people Saturday and 2 waiters", all);
  const wire = toRosterRequestWire({ lines: draft.lines, partySize: draft.partySize, when: draft.when });
  assert.deepEqual(wire.lines, [{ entry_id: "roster_L1", quantity: 1 }, { entry_id: "roster_L2", quantity: 2 }]);
  const meta = sanitizeRosterRequestWire(wire, all);
  assert.ok(meta);
  assert.deepEqual(meta.lines.map((l) => [l.entry_id, l.title, l.quantity, l.talent_name]), [
    ["roster_L1", "Private chef", 1, "Rafa"],
    ["roster_L2", "Waiter", 2, null],
  ]);
  assert.equal(meta.party_size, 10);
  assert.equal(meta.when, "saturday");
  const stored = rosterRequestMetadata(meta);
  assert.ok(stored && ROSTER_REQUEST_META_KEY in stored);
});

test("forged ids, off-roster ids, bad quantities and bad party/day are dropped; titles come from the roster", () => {
  const meta = sanitizeRosterRequestWire(
    {
      lines: [
        { entry_id: "roster_L1", quantity: 9999, title: "Free money", price_cents: 1 },
        { entry_id: "roster_OTHER_TENANT", quantity: 2 },
        { entry_id: "OFFER-SECRET", quantity: 1 },
        { entry_id: "roster_L1", quantity: 3 },
      ],
      party_size: -4,
      when: "<script>",
    },
    all,
  );
  assert.ok(meta);
  assert.equal(meta.lines.length, 1);
  assert.equal(meta.lines[0]!.title, "Private chef");
  assert.equal(meta.lines[0]!.quantity, 50);
  assert.equal(meta.party_size, null);
  assert.equal(meta.when, null);
  const json = JSON.stringify(meta);
  assert.doesNotMatch(json, /OFFER-SECRET|TALENT-SECRET|price|Free money/);
});

test("nothing on the roster matches: no request is stored and the message stays plain chat", () => {
  assert.equal(sanitizeRosterRequestWire({ lines: [{ entry_id: "roster_ZZ", quantity: 1 }], party_size: null, when: null }, all), null);
  assert.equal(sanitizeRosterRequestWire(null, all), null);
  assert.equal(sanitizeRosterRequestWire("x", all), null);
  assert.equal(sanitizeRosterRequestWire({ lines: [{ entry_id: "roster_L1", quantity: 1 }] }, []), null);
  assert.equal(rosterRequestMetadata(null), undefined);
});

test("a hidden show-who entry exposes no talent name in the stored request", () => {
  const hidden = item({ listingId: "L9", title: "Bartender", talentName: null });
  const meta = sanitizeRosterRequestWire({ lines: [{ entry_id: "roster_L9", quantity: 2 }], party_size: null, when: null }, [hidden]);
  assert.equal(meta?.lines[0]?.talent_name, null);
});

test("the owner side reads the stored request back and ignores plain or malformed metadata", () => {
  const meta = sanitizeRosterRequestWire({ lines: [{ entry_id: "roster_L2", quantity: 2 }], party_size: 10, when: "saturday" }, all)!;
  const back = readRosterRequestMeta(rosterRequestMetadata(meta));
  assert.deepEqual(back, meta);
  assert.equal(readRosterRequestMeta({}), null);
  assert.equal(readRosterRequestMeta(null), null);
  assert.equal(readRosterRequestMeta({ roster_request: { lines: [] } }), null);
  assert.equal(readRosterRequestMeta({ roster_request: { lines: [{ title: "" }] } }), null);
  assert.equal(readRosterRequestMeta({ system_event_type: "workspace_auto_ack" }), null);
});
