/**
 * TUL-1320 (stop-ship): the public catalog API never lists by tenant alone.
 * Hub host needs an explicit public profile; hidden, deleted and unlisted
 * profiles list nothing; ticketed-event and reservation rows never appear; the
 * guest-sellable rule stays.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";

import {
  CATALOG_PROFILE_CODE_RE,
  isPublicCatalogProfile,
  keepRowsOfPublicOwners,
  toBusinessCatalogServices,
  type CatalogProfileRow,
} from "./business-catalog";
import { loadBusinessCatalogOfferings } from "./business-catalog.server";

const WEB = path.resolve(__dirname, "../../..");

const PUBLIC: CatalogProfileRow = {
  id: "tp1",
  deleted_at: null,
  is_publicly_hidden: false,
  is_publicly_listed: true,
  visibility: "public",
  profile_kind: "talent",
};

test("profile gate: public means not deleted, not hidden, listed, visibility public, not a resource", () => {
  assert.equal(isPublicCatalogProfile(PUBLIC), true);
  assert.equal(isPublicCatalogProfile({ ...PUBLIC, deleted_at: "2026-10-01" }), false);
  assert.equal(isPublicCatalogProfile({ ...PUBLIC, is_publicly_hidden: true }), false);
  assert.equal(isPublicCatalogProfile({ ...PUBLIC, is_publicly_hidden: null }), false);
  assert.equal(isPublicCatalogProfile({ ...PUBLIC, is_publicly_listed: false }), false);
  assert.equal(isPublicCatalogProfile({ ...PUBLIC, is_publicly_listed: null }), false);
  assert.equal(isPublicCatalogProfile({ ...PUBLIC, visibility: "private" }), false);
  assert.equal(isPublicCatalogProfile({ ...PUBLIC, profile_kind: "resource" }), false);
});

test("talent-owned rows stay only while their talent is public; workspace rows stay", () => {
  const rows = [
    { id: "a", talent_profile_id: null },
    { id: "b", talent_profile_id: "tp1" },
    { id: "c", talent_profile_id: "tp-hidden" },
  ];
  assert.deepEqual(keepRowsOfPublicOwners(rows, new Set(["tp1"])).map((r) => r.id), ["a", "b"]);
});

test("profile codes are plain codes only", () => {
  for (const ok of ["TAL-93005", "luna_1", "a"]) assert.ok(CATALOG_PROFILE_CODE_RE.test(ok), ok);
  for (const bad of ["", "-x", "a b", "a/b", "x".repeat(65), "a?b=1"]) assert.ok(!CATALOG_PROFILE_CODE_RE.test(bad), bad);
});

// ─── the loader, against a recording fake ─────────────────────────────────────

type Result = { data: unknown; error?: unknown };
function fakeDb(tables: Record<string, Result>) {
  const calls: Array<{ table: string; ops: unknown[][] }> = [];
  return {
    calls,
    from(table: string) {
      const rec = { table, ops: [] as unknown[][] };
      calls.push(rec);
      const chain: unknown = new Proxy(
        {},
        {
          get(_t, prop) {
            if (prop === "then") return (resolve: (v: Result) => void) => resolve(tables[table] ?? { data: [], error: null });
            return (...args: unknown[]) => {
              rec.ops.push([String(prop), ...args]);
              return chain;
            };
          },
        },
      );
      return chain;
    },
  };
}

function offeringRow(id: string, over: Record<string, unknown> = {}) {
  return {
    id,
    talent_profile_id: "tp1",
    owner_kind: "talent",
    tenant_id: "hub1",
    kind: "service",
    title: `Service ${id}`,
    description: null,
    price_type: "flat_package",
    price_display: "exact",
    amount_cents: 10000,
    currency: "MXN",
    booking_mode: null,
    reserve_mode: "full",
    deposit_pct: null,
    allow_pay_in_person: false,
    duration_minutes: 30,
    category: null,
    status: "published",
    visibility: "public",
    moderation_state: "approved",
    sort_order: 0,
    attributes: {},
    ...over,
  };
}

test("HUB host with no profile lists nothing and reads nothing", async () => {
  const db = fakeDb({});
  const r = await loadBusinessCatalogOfferings(db as never, { tenantId: "hub1", hostKind: "hub", profileCode: null, locale: "es" });
  assert.equal(r.kind, "talent_required");
  assert.equal(db.calls.length, 0);
  const bad = await loadBusinessCatalogOfferings(db as never, { tenantId: "hub1", hostKind: "hub", profileCode: "a b", locale: "es" });
  assert.equal(bad.kind, "talent_required");
  assert.equal(db.calls.length, 0);
});

test("HUB host: a hidden, deleted, unlisted or unknown profile answers the same 'not public' and reads no offerings", async () => {
  for (const profile of [
    { ...PUBLIC, is_publicly_hidden: true },
    { ...PUBLIC, deleted_at: "2026-10-01T00:00:00Z" },
    { ...PUBLIC, is_publicly_listed: false },
    null,
  ]) {
    const db = fakeDb({ talent_profiles: { data: profile, error: null } });
    const r = await loadBusinessCatalogOfferings(db as never, { tenantId: "hub1", hostKind: "hub", profileCode: "TAL-1", locale: "es" });
    assert.equal(r.kind, "profile_not_public", JSON.stringify(profile));
    assert.equal(db.calls.some((c) => c.table === "talent_offerings"), false);
  }
});

test("HUB host: a profile read error is unavailable, not an empty or open list", async () => {
  const db = fakeDb({ talent_profiles: { data: null, error: { message: "boom" } } });
  const r = await loadBusinessCatalogOfferings(db as never, { tenantId: "hub1", hostKind: "hub", profileCode: "TAL-1", locale: "es" });
  assert.equal(r.kind, "unavailable");
});

test("HUB host with a public profile: only that talent, no event or reservation rows", async () => {
  const db = fakeDb({
    talent_profiles: { data: PUBLIC, error: null },
    events: { data: [{ offering_id: "event-pkg" }], error: null },
    venue_service_rules: { data: [{ reservation_offering_id: "reservation-item" }], error: null },
    talent_offerings: {
      data: [offeringRow("good"), offeringRow("event-pkg"), offeringRow("reservation-item")],
      error: null,
    },
  });
  const r = await loadBusinessCatalogOfferings(db as never, { tenantId: "hub1", hostKind: "hub", profileCode: "TAL-1", locale: "es" });
  assert.equal(r.kind, "ok");
  if (r.kind !== "ok") return;
  assert.deepEqual(r.offerings.map((o) => o.id), ["good"]);
  assert.equal(r.talentCode, "TAL-1");
  // the query was narrowed to that one talent AND to guest-sellable rows
  const q = db.calls.find((c) => c.table === "talent_offerings")!;
  const ops = q.ops.map((o) => o.join(":"));
  assert.ok(ops.includes("eq:talent_profile_id:tp1"));
  assert.ok(ops.includes("eq:tenant_id:hub1"));
  assert.ok(ops.includes("eq:status:published"));
  assert.ok(ops.includes("eq:moderation_state:approved"));
  assert.ok(ops.includes("eq:visibility:public"));
});

test("if the event/reservation exclusion list cannot be read, the answer is unavailable (fail closed)", async () => {
  const db = fakeDb({
    talent_profiles: { data: PUBLIC, error: null },
    events: { data: null, error: { message: "boom" } },
  });
  const r = await loadBusinessCatalogOfferings(db as never, { tenantId: "hub1", hostKind: "hub", profileCode: "TAL-1", locale: "es" });
  assert.equal(r.kind, "unavailable");
  assert.equal(db.calls.some((c) => c.table === "talent_offerings"), false);
});

test("AGENCY host: event and reservation rows are dropped, and a hidden roster talent's rows are dropped", async () => {
  const db = fakeDb({
    events: { data: [{ offering_id: "event-pkg" }], error: null },
    venue_service_rules: { data: [{ reservation_offering_id: "reservation-item" }], error: null },
    talent_offerings: {
      data: [
        offeringRow("house", { talent_profile_id: null, owner_kind: "workspace" }),
        offeringRow("event-pkg", { talent_profile_id: null, owner_kind: "workspace" }),
        offeringRow("reservation-item", { talent_profile_id: null, owner_kind: "workspace" }),
        offeringRow("public-talent", { talent_profile_id: "tp1" }),
        offeringRow("hidden-talent", { talent_profile_id: "tp-hidden" }),
      ],
      error: null,
    },
    talent_profiles: { data: [PUBLIC, { ...PUBLIC, id: "tp-hidden", is_publicly_hidden: true }], error: null },
  });
  const r = await loadBusinessCatalogOfferings(db as never, { tenantId: "ag1", hostKind: "agency", profileCode: null, locale: "es" });
  assert.equal(r.kind, "ok");
  if (r.kind !== "ok") return;
  assert.deepEqual(r.offerings.map((o) => o.id).sort(), ["house", "public-talent"]);
});

test("the guest-sellable rule still applies on top (a draft that slipped through is not listed)", () => {
  const rows = [{ ...offeringRow("ok") }, { ...offeringRow("draft", { status: "draft" }) }];
  // mapper-level gate, independent of the query filter
  const offerings = rows.map((r) => ({
    id: r.id, kind: "service", title: r.title, description: null, priceType: "flat_package", priceDisplay: "exact",
    amountCents: 1, currency: "MXN", durationMinutes: null, category: null, status: r.status, visibility: "public",
    moderationState: "approved", attributes: {}, imageUrls: [],
  }));
  assert.deepEqual(toBusinessCatalogServices(offerings as never, "es").map((s) => s.id), ["ok"]);
});

test("the route turns the loader answers into 400 / 404 / 503 and passes ?talent= only to the loader", () => {
  const route = fs.readFileSync(path.join(WEB, "src/app/api/public/booking/business-catalog/route.ts"), "utf8");
  assert.match(route, /loaded\.kind === "talent_required"/);
  assert.match(route, /status: 400/);
  assert.match(route, /loaded\.kind === "profile_not_public"/);
  assert.match(route, /loaded\.kind === "unavailable"/);
  assert.match(route, /profileCode: url\.searchParams\.get\("talent"\)/);
  assert.match(route, /hostKind === "hub" \? Promise\.resolve\(null\)/);
  const loader = fs.readFileSync(path.join(WEB, "src/lib/offerings/business-catalog.server.ts"), "utf8");
  assert.match(loader, /loadNonMenuOfferingIds\(admin, input\.tenantId\)/);
  assert.match(loader, /withoutNonMenuOfferings\(/);
  assert.match(loader, /scopeToGuestSellableOfferings\(/);
});
