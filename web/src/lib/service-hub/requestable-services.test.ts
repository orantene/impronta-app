/**
 * TUL-1587: a workspace with no roster (a restaurant) still gets ONE request object from the chat,
 * built from its own guest-sellable services. QA build 8: s2-cantina got only a plain chat thread.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import type { BusinessCatalogService } from "@/lib/offerings/business-catalog";

import { ownServicesToRequestItems } from "./requestable-services";
import { buildRosterRequestDraft } from "./roster-chat-request";
import { sanitizeRosterRequestWire, toRosterRequestWire } from "./roster-request-meta";

const svc = (id: string, title: string): BusinessCatalogService => ({
  id, title, description: null, category: null, duration_minutes: null, price: "$249", amount_cents: 24900, currency: "MXN", guest_sellable: true,
});
const items = ownServicesToRequestItems([svc("A1", "Experiencia de tacos"), svc("A2", "Menú de cena"), svc("", "x"), svc("A3", "  ")]);

test("own services become request-only items with an opaque id, no talent and no contact leak", () => {
  assert.equal(items.length, 2);
  assert.equal(items[0]!.listingId, "svc_A1");
  assert.equal(items[0]!.talentProfileId, null);
  assert.equal(items[0]!.talentName, null);
  assert.equal(items[0]!.bookingType, "request");
  assert.equal(items[0]!.clientContact, "workspace");
});

test("a restaurant sentence builds a request with lines, party and the day word", () => {
  const draft = buildRosterRequestDraft("experiencia de tacos para 10 personas el sábado", items);
  assert.deepEqual(draft.lines.map((l) => [l.entryId, l.title, l.quantity]), [["roster_svc_A1", "Experiencia de tacos", 1]]);
  assert.equal(draft.partySize, 10);
  assert.equal(draft.when, "sabado");
});

test("the server keeps the line only while the id is on the workspace's own list", () => {
  const draft = buildRosterRequestDraft("experiencia de tacos", items);
  const wire = toRosterRequestWire({ lines: draft.lines, partySize: null, when: null });
  assert.equal(sanitizeRosterRequestWire(wire, items)?.lines[0]?.title, "Experiencia de tacos");
  assert.equal(sanitizeRosterRequestWire(wire, []), null);
  assert.equal(sanitizeRosterRequestWire({ lines: [{ entry_id: "roster_svc_OTHER", quantity: 1 }] }, items), null);
});
