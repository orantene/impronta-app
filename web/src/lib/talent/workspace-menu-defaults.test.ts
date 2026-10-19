import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";

import { loadWorkspaceMenuDefaults } from "./workspace-menu-defaults";

/**
 * B5 (TUL-1271 #12): the Catalog took 10 to 18 s on every visit. Part of it
 * was the loader's waterfall: language, then agency + identity, each awaited
 * after the rows and their children. These pin the parallel shape.
 */

type Row = Record<string, unknown> | null;
type Reply = { data: Row; error: { message: string } | null } | "throw";

function fakeDb(replies: Record<string, Reply>) {
  const calls: { table: string; select: string; filters: [string, unknown][] }[] = [];
  let inFlight = 0;
  let maxInFlight = 0;
  const db = {
    from(table: string) {
      const call = { table, select: "", filters: [] as [string, unknown][] };
      calls.push(call);
      const builder = {
        select(cols: string) {
          call.select = cols;
          return builder;
        },
        eq(col: string, value: unknown) {
          call.filters.push([col, value]);
          return builder;
        },
        async maybeSingle() {
          inFlight += 1;
          maxInFlight = Math.max(maxInFlight, inFlight);
          await new Promise((r) => setTimeout(r, 5));
          inFlight -= 1;
          const reply = replies[table] ?? { data: null, error: null };
          if (reply === "throw") throw new Error("network");
          return reply;
        },
      };
      return builder;
    },
  };
  return { db: db as unknown as SupabaseClient, calls, maxInFlight: () => maxInFlight };
}

test("the identity row is read ONCE for language and country, beside the agency read (concurrent)", async () => {
  const f = fakeDb({
    agency_business_identity: { data: { default_locale: "es-MX", address_country: "MX" }, error: null },
    agencies: { data: { settings: { business_type: "salon" } }, error: null },
  });
  const out = await loadWorkspaceMenuDefaults(f.db, "t1");
  assert.deepEqual(out, { primaryLocale: "es", agencySettings: { business_type: "salon" }, addressCountry: "MX" });
  assert.equal(f.calls.filter((c) => c.table === "agency_business_identity").length, 1);
  assert.equal(f.calls.length, 2);
  assert.equal(f.maxInFlight(), 2, "both reads were in flight together");
  for (const c of f.calls) assert.deepEqual(c.filters[0], [c.table === "agencies" ? "id" : "tenant_id", "t1"], "tenant pinned");
});

test("a failed read falls back to the neutral defaults and never rejects", async () => {
  const f = fakeDb({
    agency_business_identity: { data: null, error: { message: "boom" } },
    agencies: { data: null, error: { message: "boom" } },
  });
  assert.deepEqual(await loadWorkspaceMenuDefaults(f.db, "t1"), { primaryLocale: "en", agencySettings: null, addressCountry: null });
  const g = fakeDb({ agencies: "throw" });
  assert.deepEqual(await loadWorkspaceMenuDefaults(g.db, "t1"), { primaryLocale: "en", agencySettings: null, addressCountry: null });
});

test("the Catalog loader starts the defaults before the row reads and awaits them with the children", () => {
  const src = readFileSync(resolve(process.cwd(), "src/lib/talent/menu-offerings-actions.ts"), "utf8");
  const load = src.slice(src.indexOf("export async function loadWorkspaceMenuForEditor"), src.indexOf("export async function upsertWorkspaceMenuItem"));
  const started = load.indexOf("const defaultsPending = loadWorkspaceMenuDefaults(admin, tenantId);");
  assert.ok(started > 0, "defaults started without await");
  assert.ok(started < load.indexOf("fetchOwnerTalentIds(admin, tenantId)"), "before the owner and row reads");
  assert.ok(started > load.indexOf("authorizeForWorkspace(tenantId)"), "after the staff check, never before it");
  assert.match(load, /await Promise\.all\(\[loadOfferingChildren\(admin, rows\.map\(\(r\) => r\.id\)\), defaultsPending\]\)/);
  // The three reads that used to follow one another are gone from the load path.
  assert.doesNotMatch(load, /await workspacePrimaryLocale\(/);
  assert.doesNotMatch(load, /from\("agencies"\)/);
  assert.doesNotMatch(load, /from\("agency_business_identity"\)/);
  // Sequential awaits on the load path: auth, owner ids, rows + event ids, children + defaults.
  assert.equal((load.match(/\bawait\b/g) ?? []).length, 4);
});
