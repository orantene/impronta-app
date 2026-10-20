/**
 * TUL-1451 (P2): behavioural proof that NO public payload carries a hidden tier's variant id.
 * That id is the unlock for a hidden / comp ticket tier, so it must only ever travel in the
 * link the owner hands out. Every test below calls the REAL loader or serializer with fake rows
 * (the storefront FakeQuery shape) and scans the serialized payload for the hidden id.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { loadCatalogRowsForScope, loadTalentProfileOfferingRows } from "@/lib/messages-v5/items-catalog";
import { loadOfferingChildren } from "@/lib/talent/offerings-children";
import { readCatalogGridCore, type CatalogGridDeps } from "@/lib/storefront/catalog-grid.core";
import { readEventListCore } from "@/lib/storefront/event-list.core";
import { readServiceCollectionCore } from "@/lib/storefront/service-collection.core";
import { fakeAdmin, uuid, type FakeStore } from "@/lib/storefront/__fixtures__/fake-admin";

const TENANT = uuid(1);
const TALENT = uuid(2);
const OFFERING = uuid(3);
const EVENT = uuid(4);
const SESSION = uuid(5);
const PUBLIC_TIER = uuid(100);
const HIDDEN_TIER = uuid(101);
const HOUR = 3_600_000;

const sellable = { tenant_id: TENANT, status: "published", moderation_state: "approved", visibility: "public", owner_kind: "workspace", currency: "USD", price_type: "flat_package", price_display: "exact" };

function store(): FakeStore {
  const start = new Date(Date.now() + 240 * HOUR).toISOString();
  const end = new Date(Date.now() + 244 * HOUR).toISOString();
  return {
    talent_offerings: [
      { ...sellable, id: OFFERING, talent_profile_id: TALENT, title: "Guest list night", kind: "service", category: "Nightlife", amount_cents: 2000, sort_order: 1, allow_pay_in_person: false },
    ],
    talent_offering_variants: [
      { id: PUBLIC_TIER, offering_id: OFFERING, label: "General", amount_cents: 2000, pool_key: "general", is_hidden: false, sort_order: 1, admits_per_unit: 1, min_per_order: 1 },
      { id: HIDDEN_TIER, offering_id: OFFERING, label: "Comp", amount_cents: 0, pool_key: "comp", is_hidden: true, sort_order: 2, admits_per_unit: 1, min_per_order: 1 },
    ],
    events: [{ id: EVENT, tenant_id: TENANT, slug: "night", title: "Night", description: null, venue_id: null, status: "published", offering_id: OFFERING, age_gate: null }],
    sessions: [{ id: SESSION, tenant_id: TENANT, event_id: EVENT, offering_id: OFFERING, title: "Night", status: "scheduled", starts_at: start, ends_at: end }],
    capacity_pools: [
      { id: uuid(200), tenant_id: TENANT, subject_kind: "session_tier", subject_id: SESSION, pool_key: "general", units_total: 50, is_active: true },
      { id: uuid(201), tenant_id: TENANT, subject_kind: "session_tier", subject_id: SESSION, pool_key: "comp", units_total: 50, is_active: true },
    ],
  };
}

const wire = (payload: unknown): string => JSON.stringify(payload);

test("assistant catalog: a hidden tier's id is in neither the session tiers nor a talent's options", async () => {
  const { admin } = fakeAdmin(store());
  const rows = await loadCatalogRowsForScope(admin as never, { tenantId: TENANT, talentProfileId: null, forcedTalent: false, window: null, now: new Date(), date: null, reservations: false });
  const ticket = rows.find((r) => r.category === "ticket");
  assert.ok(ticket, "the event night is listed");
  assert.ok(wire(rows).includes(PUBLIC_TIER), "the public tier is listed");
  assert.ok(!wire(rows).includes(HIDDEN_TIER), "the hidden tier id never leaves the assistant catalog");

  const own = await loadTalentProfileOfferingRows(admin as never, TENANT, TALENT);
  assert.ok(wire(own).includes(PUBLIC_TIER));
  assert.ok(!wire(own).includes(HIDDEN_TIER), "a talent's option list drops the hidden tier");
});

test("shared child loader: publicOnly drops a hidden variant, the owner editors still see it", async () => {
  const { admin } = fakeAdmin(store());
  const pub = await loadOfferingChildren(admin as never, [OFFERING], { publicOnly: true });
  assert.deepEqual(pub.variants.get(OFFERING)?.map((v) => v.id), [PUBLIC_TIER]);
  const editor = await loadOfferingChildren(admin as never, [OFFERING]);
  assert.deepEqual(editor.variants.get(OFFERING)?.map((v) => v.id), [PUBLIC_TIER, HIDDEN_TIER], "the editor keeps every tier");
});

test("cart / catalog grid payload: options never include a hidden tier", async () => {
  const { admin } = fakeAdmin(store());
  const deps: CatalogGridDeps = {
    admin, locale: "en",
    livePrice: async () => ({ ok: true, priceCents: null, phaseId: null }),
    loadImages: async () => new Map(),
  };
  const r = await readCatalogGridCore(deps, TENANT, {});
  assert.ok(r.ok);
  if (!r.ok) return;
  assert.ok(wire(r.data).includes(PUBLIC_TIER));
  assert.ok(!wire(r.data).includes(HIDDEN_TIER), "the cart payload never carries the hidden variant id");
});

test("service collection: a hidden $0 tier never sets the public 'from' price", async () => {
  const { admin } = fakeAdmin(store());
  const r = await readServiceCollectionCore(
    { admin, locale: "en", loadOfferings: async () => [{ id: OFFERING, kind: "service", title: "Night", description: null, amountCents: 2000, currency: "USD", priceDisplay: "exact", visibility: "public", bookingMode: "request", durationMinutes: null, talentProfileId: TALENT, category: null, seatsLabel: null } as never] },
    TENANT, {},
  );
  assert.ok(r.ok);
  if (!r.ok) return;
  assert.equal(r.data.services[0]?.fromCents, 2000, "the comp tier's 0 does not become the 'from' price");
  assert.ok(!wire(r.data).includes(HIDDEN_TIER));
});

test("public events list: the listing carries no variant ids at all", async () => {
  const { admin } = fakeAdmin(store());
  const r = await readEventListCore({ admin }, TENANT, {});
  assert.ok(r.ok);
  if (!r.ok) return;
  assert.equal(r.data.events.length, 1);
  assert.ok(!wire(r.data).includes(HIDDEN_TIER));
  assert.ok(!wire(r.data).includes(PUBLIC_TIER));
});

test("ticket picker payload: anonymous gets no hidden id; the id link unlocks it; the pool key does not", async () => {
  const { admin } = fakeAdmin(store(), { capacity_remaining_public: () => 10 });
  // Swap the service-role client for the in-memory one BEFORE the picker module loads.
  const adminPath = require.resolve("@/lib/supabase/admin");
  require.cache[adminPath] = { id: adminPath, filename: adminPath, loaded: true, exports: { createServiceRoleClient: () => admin, createUncachedServiceRoleClient: () => admin } } as unknown as NodeJS.Module;
  const { loadTicketPicker } = await import("@/app/(public)/_events/ticket-picker-actions");

  const anon = await loadTicketPicker({ tenantId: TENANT, eventId: EVENT });
  assert.ok(anon.ok, "picker loads from the fake rows");
  if (!anon.ok) return;
  assert.deepEqual(anon.tiers.map((t) => t.variantId), [PUBLIC_TIER]);
  assert.ok(anon.nights.length === 1 && anon.nights[0].sellableVariantIds.length === 1);
  assert.ok(!wire(anon).includes(HIDDEN_TIER), "tiers, nights and availability carry no hidden id");

  const byKey = await loadTicketPicker({ tenantId: TENANT, eventId: EVENT, includeTierKey: "comp" });
  assert.ok(byKey.ok);
  if (!byKey.ok) return;
  assert.ok(!wire(byKey).includes(HIDDEN_TIER), "the guessable pool key 'comp' never unlocks the tier");

  const byId = await loadTicketPicker({ tenantId: TENANT, eventId: EVENT, includeVariantId: HIDDEN_TIER });
  assert.ok(byId.ok);
  if (!byId.ok) return;
  assert.ok(byId.tiers.some((t) => t.variantId === HIDDEN_TIER), "the owner's id link does list it");
});
