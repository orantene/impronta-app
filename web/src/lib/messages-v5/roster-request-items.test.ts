/**
 * TUL-1415: the owner's Servicios panel lists what the guest requested ("Aún no hay artículos" on QA build 8).
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import type { ContextItemLine } from "@/components/messages-v5/screens/contracts";

import { rosterRequestItems, withRosterRequestItems } from "./roster-request-items";

const req = (lines: { entry_id: string; title: string; quantity: number; talent_name: string | null }[]) => ({
  deletedAt: null,
  rosterRequest: { lines, party_size: 10, when: "sabado" },
});
const msgs = [
  { deletedAt: null, rosterRequest: null },
  req([
    { entry_id: "roster_L1", title: "QA Chef privado", quantity: 1, talent_name: "Rafa" },
    { entry_id: "roster_L2", title: "QA Mesero", quantity: 2, talent_name: null },
  ]),
];

test("request lines become panel lines: quantity, service, the chosen talent, no price", () => {
  const lines = rosterRequestItems(msgs);
  assert.deepEqual(lines.map((l) => [l.name, l.sub, l.units, l.price]), [
    ["QA Chef privado", "Rafa", "1", ""],
    ["QA Mesero", null, "2", ""],
  ]);
  assert.equal(lines[0]!.proposedBy, "client");
});

test("a later request for the same service replaces the line; a deleted message adds nothing", () => {
  const later = req([{ entry_id: "roster_L2", title: "QA Mesero", quantity: 4, talent_name: null }]);
  const lines = rosterRequestItems([...msgs, later, { ...req([{ entry_id: "roster_L9", title: "Gone", quantity: 1, talent_name: null }]), deletedAt: "2026-10-22T00:00:00Z" }]);
  assert.deepEqual(lines.map((l) => [l.name, l.units]), [["QA Chef privado", "1"], ["QA Mesero", "4"]]);
});

test("real offer lines always win; the request only fills an empty panel", () => {
  const offer: ContextItemLine[] = [{ id: "o1", name: "Offer line", units: "1", price: "$10" }];
  assert.deepEqual(withRosterRequestItems(offer, msgs), offer);
  assert.equal(withRosterRequestItems([], msgs)?.length, 2);
  assert.equal(withRosterRequestItems(null, msgs)?.length, 2);
  assert.equal(withRosterRequestItems(null, [{ deletedAt: null, rosterRequest: null }]), null);
  assert.deepEqual(withRosterRequestItems([], []), []);
});
