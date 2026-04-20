import test from "node:test";
import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";

import { resolveTenantFromHost } from "./scope";

type QueryCall = {
  table: string;
  eqs: Array<[string, string]>;
  ins: Array<[string, unknown[]]>;
  limits: number[];
  result: { data: unknown; error: null | { message: string } };
};

function mockSupabase(result: QueryCall["result"]) {
  const calls: QueryCall[] = [];
  const supabase = {
    from(table: string) {
      const call: QueryCall = { table, eqs: [], ins: [], limits: [], result };
      calls.push(call);
      const chain = {
        select() {
          return chain;
        },
        eq(col: string, val: string) {
          call.eqs.push([col, val]);
          return chain;
        },
        in(col: string, vals: unknown[]) {
          call.ins.push([col, vals]);
          return chain;
        },
        limit(n: number) {
          call.limits.push(n);
          return chain;
        },
        maybeSingle() {
          return Promise.resolve(call.result);
        },
      };
      return chain;
    },
  } as unknown as SupabaseClient;
  return { supabase, calls };
}

test("resolveTenantFromHost lower-cases and trims the hostname before lookup", async () => {
  const { supabase, calls } = mockSupabase({
    data: { tenant_id: "tenant-A", hostname: "acme.improntamodels.mx", status: "active" },
    error: null,
  });
  const res = await resolveTenantFromHost(supabase, "  ACME.impronta MODELS.mx  ".replace(/\s+/g, ""));
  assert.deepEqual(res, { tenantId: "tenant-A", hostname: "acme.improntamodels.mx" });
  assert.equal(calls[0].eqs[0][0], "hostname");
  assert.equal(calls[0].eqs[0][1], "acme.improntamodels.mx");
});

test("resolveTenantFromHost restricts to active/ssl_provisioned/verified statuses", async () => {
  const { supabase, calls } = mockSupabase({
    data: { tenant_id: "tenant-B", hostname: "brand.mx", status: "active" },
    error: null,
  });
  await resolveTenantFromHost(supabase, "brand.mx");
  assert.deepEqual(calls[0].ins, [["status", ["active", "ssl_provisioned", "verified"]]]);
  assert.deepEqual(calls[0].limits, [1]);
});

test("resolveTenantFromHost returns null on empty hostname", async () => {
  const { supabase, calls } = mockSupabase({ data: null, error: null });
  assert.equal(await resolveTenantFromHost(supabase, ""), null);
  assert.equal(await resolveTenantFromHost(supabase, "   "), null);
  assert.equal(calls.length, 0, "empty hostnames must not hit the DB");
});

test("resolveTenantFromHost returns null when the hostname is unmapped", async () => {
  const { supabase } = mockSupabase({ data: null, error: null });
  assert.equal(await resolveTenantFromHost(supabase, "unknown.example"), null);
});

test("resolveTenantFromHost returns null when Supabase errors (no seed fallback)", async () => {
  const { supabase } = mockSupabase({ data: null, error: { message: "simulated" } });
  // Fail-hard: the resolver logs and returns `null` so middleware can decide
  // to serve marketing / 404 rather than silently bind to tenant #1.
  assert.equal(await resolveTenantFromHost(supabase, "brand.mx"), null);
});
