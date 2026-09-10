// test/helpers/reserve-set-fake.ts — the admin double for `reserveResourceSet`.
//
// WHY THIS EXISTS AS A HELPER. `reserve_resource_set_v2` is the ONLY writer in
// that path: the TypeScript fallback that used to place holds itself was
// deleted, because on a lost answer it re-ran the reservation and allocated the
// same resources twice. So a test can no longer inject `placeHold` /
// `reserveCapacityBatch` — the only seam left is the RPC, and every test that
// exercises a set now scripts it here rather than each file inventing its own
// half of the reply shape.
//
//   const { admin, calls } = fakeReserveSetAdmin();
//   await reserveResourceSet(admin, { tenantId: "t1", operationKey: "k", ... });
//   assert.equal(calls[0].args.p_operation_key, "k");

import type { SupabaseClient } from "@supabase/supabase-js";

export type ReserveSetRpcArgs = {
  p_tenant_id?: string;
  p_operation_key?: string;
  p_actor_id?: string | null;
  p_ttl_seconds?: number | null;
  p_capacity?: Array<Record<string, unknown>>;
  p_holds?: Array<Record<string, unknown>>;
};

export type ReserveSetRpcCall = { fn: string; args: ReserveSetRpcArgs };

export type ReserveSetRpcOutcome = { data: unknown; error: unknown };

export type FakeReserveSetAdmin = {
  admin: Pick<SupabaseClient, "rpc" | "from">;
  /** Every RPC the module made, in order. */
  calls: ReserveSetRpcCall[];
  /** Every table the module read or wrote through `.from()`, in order. */
  tables: string[];
};

/** The reply the real function gives when nothing is in the way. */
export function grantedReply(args: ReserveSetRpcArgs, over: Record<string, unknown> = {}) {
  const holds = args.p_holds ?? [];
  const capacity = args.p_capacity ?? [];
  return {
    ok: true,
    already: false,
    hold_ids: holds.map((h) => `hold-${String(h.talent_profile_id)}`),
    allocation_ids: capacity.map((c) => `alloc-${String(c.pool_id)}`),
    expires_at: null,
    ...over,
  };
}

export function fakeReserveSetAdmin(options: {
  /** Pools are invented for this tenant unless `pools` is given. */
  tenantId?: string;
  pools?: ReadonlyArray<{ id: string; tenant_id: string }>;
  /** Scripted answer. `attempt` starts at 1, so a deadlock script can relent. */
  reply?: (call: ReserveSetRpcCall, attempt: number) => ReserveSetRpcOutcome;
} = {}): FakeReserveSetAdmin {
  const tenantId = options.tenantId ?? "t1";
  const known = options.pools ? new Map(options.pools.map((p) => [p.id, p])) : null;
  const calls: ReserveSetRpcCall[] = [];
  const tables: string[] = [];

  const client = {
    rpc: async (fn: string, args: ReserveSetRpcArgs) => {
      const call: ReserveSetRpcCall = { fn, args };
      calls.push(call);
      if (options.reply) return options.reply(call, calls.length);
      return { data: grantedReply(args), error: null };
    },
    from: (table: string) => {
      tables.push(table);
      let ids: string[] = [];
      const api: Record<string, unknown> = {
        select: () => api,
        eq: () => api,
        in: (_column: string, values: string[]) => {
          ids = values;
          return api;
        },
        then: (
          resolve: (value: { data: unknown; error: null }) => unknown,
          reject?: (reason: unknown) => unknown,
        ) => {
          const data =
            table === "capacity_pools"
              ? ids.flatMap((id) => {
                  const hit = known?.get(id);
                  if (hit) return [hit];
                  if (known) return [];
                  return [{ id, tenant_id: tenantId }];
                })
              : [];
          return Promise.resolve({ data, error: null }).then(resolve, reject);
        },
      };
      return api;
    },
  };

  // The one cast in this file. `SupabaseClient` is a generated type with a
  // hundred members no double can implement; the module under test only ever
  // touches `rpc` and `from`, which is what this object provides.
  return { admin: client as unknown as Pick<SupabaseClient, "rpc" | "from">, calls, tables };
}
