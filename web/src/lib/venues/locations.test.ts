import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  locationSetDefault,
  locationUpsert,
  locationsList,
  zoneDelete,
  zoneUpsert,
} from "./locations";

function rpcAdmin(handler: (fn: string, args: Record<string, unknown>) => unknown) {
  return {
    from: () => {
      throw new Error("no table");
    },
    rpc: async (fn: string, args: Record<string, unknown>) => ({ data: handler(fn, args), error: null }),
  };
}

test("locationUpsert refuses a bad slug without calling RPC", async () => {
  let called = false;
  const result = await locationUpsert(
    rpcAdmin(() => {
      called = true;
      return { ok: true, id: "x", version: 1 };
    }),
    { tenantId: "t1", slug: "Centro!", name: "Centro", timezone: "UTC" },
  );
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.reason, "invalid");
  assert.equal(called, false);
});

test("locationUpsert writes through venue_location_upsert", async () => {
  const result = await locationUpsert(
    rpcAdmin((fn, args) => {
      assert.equal(fn, "venue_location_upsert");
      assert.equal(args.p_slug, "centro");
      assert.equal(args.p_expected_version, 2);
      return { ok: true, id: "loc-1", slug: "centro", version: 3, is_default: false };
    }),
    {
      tenantId: "t1",
      slug: "Centro",
      name: "Centro",
      timezone: "America/Mexico_City",
      expectedVersion: 2,
    },
  );
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.id, "loc-1");
  assert.equal(result.version, 3);
});

test("zoneDelete maps has_spaces", async () => {
  const result = await zoneDelete(
    rpcAdmin((fn) => {
      assert.equal(fn, "venue_location_zone_delete");
      return { ok: false, reason: "has_spaces" };
    }),
    { tenantId: "t1", id: "z1", expectedVersion: 1 },
  );
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.reason, "has_spaces");
});

test("locationSetDefault maps conflict", async () => {
  const result = await locationSetDefault(
    rpcAdmin(() => ({ ok: false, reason: "conflict", version: 4 })),
    { tenantId: "t1", id: "loc-1", expectedVersion: 3 },
  );
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.reason, "conflict");
});

test("zoneUpsert writes through venue_location_zone_upsert", async () => {
  const result = await zoneUpsert(
    rpcAdmin((fn, args) => {
      assert.equal(fn, "venue_location_zone_upsert");
      assert.equal(args.p_kind, "terrace");
      return { ok: true, id: "z1", version: 1 };
    }),
    { tenantId: "t1", locationId: "loc-1", name: "Roof", kind: "terrace" },
  );
  assert.equal(result.ok, true);
});

test("locationsList maps rows from both tables", async () => {
  const admin = {
    rpc: async () => ({ data: null, error: { message: "no" } }),
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          order: async () =>
            table === "venue_locations"
              ? {
                  data: [
                    {
                      id: "l1",
                      slug: "default",
                      name: "Default",
                      venue_id: "v1",
                      timezone: "UTC",
                      address: {},
                      is_default: true,
                      sort_order: 0,
                      status: "active",
                      version: 1,
                    },
                  ],
                  error: null,
                }
              : {
                  data: [
                    {
                      id: "z1",
                      location_id: "l1",
                      name: "Floor",
                      kind: "floor",
                      surcharge_bps: 0,
                      sort_order: 0,
                      version: 1,
                    },
                  ],
                  error: null,
                },
        }),
      }),
    }),
  };
  const result = await locationsList(admin, { tenantId: "t1" });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.locations[0]?.slug, "default");
  assert.equal(result.zones[0]?.kind, "floor");
});

test("locations SQL seeds a default location and proves the four refusals", () => {
  const sql = readFileSync(
    join(process.cwd(), "..", "supabase", "migrations", "20261231223000_venue_locations.sql"),
    "utf8",
  );
  assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.venue_locations/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.venue_location_zones/);
  assert.match(sql, /ADD COLUMN IF NOT EXISTS location_id/);
  assert.match(sql, /slug = 'default'/);
  assert.match(sql, /expected duplicate_slug/);
  assert.match(sql, /expected last_location/);
  assert.match(sql, /expected conflict/);
  assert.match(sql, /expected has_spaces/);
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.venue_location_upsert/);
  assert.match(sql, /has_function_privilege\('anon'/);
  assert.doesNotMatch(sql, /CREATE TABLE IF NOT EXISTS public\.locations \(/);
});
