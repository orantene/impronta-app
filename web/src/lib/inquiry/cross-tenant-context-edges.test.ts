/**
 * CHARACTERIZATION TEST — cross-tenant-context.ts (uncovered fan-out edges)
 *
 * Phase 0 safety-net (remediation-plan-2026-05-19 §3 line 51 + §5). The
 * cross-tenant badge is the user-visible signal of multi-tenant inquiry
 * fan-out; its degradation behavior under empty/error inputs is load-bearing
 * for the Discover D5 surface.
 *
 * COMPLEMENT, NOT A DUPLICATE: cross-tenant-context.test.ts covers the
 * describeCrossTenantContext happy paths (single-tenant→null, 2 agencies,
 * 1+1, 3 workspaces, only-independents) and explicitly leaves the
 * DB-touching loadCrossTenantContext to "integration land". This file pins
 * the branches neither is exercised by:
 *
 *   • describeCrossTenantContext: isCrossTenant=true but parties=[] (the
 *     dangling-label quirk); the workspace-only singular segment; the
 *     single-independent (no pluralization) segment; combined plural+plural.
 *   • loadCrossTenantContext: the swallow-all catch (NEVER throws — any infra
 *     failure degrades to the single-tenant fallback), plus the per-rpc
 *     error sub-branches and the snake_case→camelCase row mapping, pinned
 *     with a tiny rpc stub (no real DB).
 *
 * Snapshots CURRENT behavior incl. quirks. Nothing is fixed here.
 * Run: npx tsx --test src/lib/inquiry/cross-tenant-context-edges.test.ts
 */

import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  describeCrossTenantContext,
  loadCrossTenantContext,
} from "./cross-tenant-context";

// ─────────────────────────────────────────────────────────────────────────────
// describeCrossTenantContext — uncovered segment combinations.
// ─────────────────────────────────────────────────────────────────────────────

describe("describeCrossTenantContext — uncovered segment shapes", () => {
  it("workspace-only, singular: isCrossTenant + 1 agency, 0 independents → 'Routed to 1 workspace'", () => {
    assert.equal(
      describeCrossTenantContext({
        isCrossTenant: true,
        parties: [
          { owningPartyType: "agency", owningPartyId: "milan", talentCount: 1 },
        ],
      }),
      "Routed to 1 workspace",
    );
  });

  it("'workspace' and 'agency' party types are pooled into the SAME workspace count", () => {
    assert.equal(
      describeCrossTenantContext({
        isCrossTenant: true,
        parties: [
          { owningPartyType: "agency", owningPartyId: "a", talentCount: 1 },
          { owningPartyType: "workspace", owningPartyId: "b", talentCount: 1 },
        ],
      }),
      "Routed to 2 workspaces",
    );
  });

  it("single independent: 'independent' has NO pluralization → 'Routed to 1 independent'", () => {
    assert.equal(
      describeCrossTenantContext({
        isCrossTenant: true,
        parties: [
          { owningPartyType: "talent", owningPartyId: "t", talentCount: 1 },
        ],
      }),
      "Routed to 1 independent",
    );
  });

  it("combined plural + plural pins segment ORDER (workspaces then independent)", () => {
    assert.equal(
      describeCrossTenantContext({
        isCrossTenant: true,
        parties: [
          { owningPartyType: "agency", owningPartyId: "a", talentCount: 1 },
          { owningPartyType: "workspace", owningPartyId: "b", talentCount: 1 },
          { owningPartyType: "talent", owningPartyId: "t1", talentCount: 1 },
          { owningPartyType: "talent", owningPartyId: "t2", talentCount: 1 },
        ],
      }),
      "Routed to 2 workspaces + 2 independent",
    );
  });

  it("QUIRK: isCrossTenant=true with EMPTY parties → the dangling string 'Routed to ' (segments.join('') with no segments)", () => {
    // The early `!isCrossTenant` guard does NOT catch this — isCrossTenant is
    // true, parties is []. Both counts are 0, segments is [], and the
    // template literal still prefixes "Routed to ". This is the CURRENT,
    // characterized output.
    assert.equal(
      describeCrossTenantContext({ isCrossTenant: true, parties: [] }),
      "Routed to ",
    );
  });

  it.skip("SUSPECTED BUG (do NOT fix here): describeCrossTenantContext returns the dangling label 'Routed to ' when isCrossTenant=true but parties=[] (e.g. owning-party resolution returned nothing for a flagged-cross-tenant inquiry). A trailing-space badge would render in the admin shell / client lineup. Likely intended: return null when segments is empty. Flagged for the fan-out refactor owner; the QUIRK test above pins the current behavior so any fix trips it deliberately.", () => {});
});

// ─────────────────────────────────────────────────────────────────────────────
// loadCrossTenantContext — swallow-all catch + rpc error/mapping branches.
// A minimal rpc stub stands in for the DB (no real Supabase).
// ─────────────────────────────────────────────────────────────────────────────

type RpcResult = { data: unknown; error: unknown };
function rpcStub(
  byFn: Record<string, RpcResult>,
): SupabaseClient {
  return {
    rpc: (name: string) =>
      Promise.resolve(
        byFn[name] ?? { data: null, error: { message: "unstubbed" } },
      ),
  } as unknown as SupabaseClient;
}

describe("loadCrossTenantContext — degradation contract (never throws)", () => {
  const DB_TRIPWIRE = "DB MUST NOT throw out of loadCrossTenantContext";
  const tripwireSupabase = new Proxy(
    {},
    {
      get() {
        throw new Error(DB_TRIPWIRE);
      },
    },
  ) as unknown as SupabaseClient;

  it("CONTRACT PIN: any thrown infra failure is swallowed → returns the single-tenant fallback { isCrossTenant:false, parties:[] } (NEVER throws)", async () => {
    const res = await loadCrossTenantContext(tripwireSupabase, "inq-1");
    assert.deepEqual(res, { isCrossTenant: false, parties: [] });
  });

  it("both rpc calls succeed → maps snake_case rows to camelCase OwningPartyRow + isCrossTenant boolean-coerced", async () => {
    const sb = rpcStub({
      is_cross_tenant_inquiry: { data: true, error: null },
      owning_parties_for_inquiry: {
        data: [
          { owning_party_type: "agency", owning_party_id: "ag-1", talent_count: 2 },
          { owning_party_type: "talent", owning_party_id: "tp-9", talent_count: 1 },
        ],
        error: null,
      },
    });
    const res = await loadCrossTenantContext(sb, "inq-1");
    assert.deepEqual(res, {
      isCrossTenant: true,
      parties: [
        { owningPartyType: "agency", owningPartyId: "ag-1", talentCount: 2 },
        { owningPartyType: "talent", owningPartyId: "tp-9", talentCount: 1 },
      ],
    });
  });

  it("cross-tenant rpc returns an error → isCrossTenant coerced to false (parties still load)", async () => {
    const sb = rpcStub({
      is_cross_tenant_inquiry: { data: null, error: { message: "rpc boom" } },
      owning_parties_for_inquiry: {
        data: [
          { owning_party_type: "workspace", owning_party_id: "w-1", talent_count: 3 },
        ],
        error: null,
      },
    });
    const res = await loadCrossTenantContext(sb, "inq-1");
    assert.deepEqual(res, {
      isCrossTenant: false,
      parties: [
        { owningPartyType: "workspace", owningPartyId: "w-1", talentCount: 3 },
      ],
    });
  });

  it("parties rpc returns an error → parties:[] (isCrossTenant still resolves)", async () => {
    const sb = rpcStub({
      is_cross_tenant_inquiry: { data: true, error: null },
      owning_parties_for_inquiry: { data: null, error: { message: "rpc boom" } },
    });
    const res = await loadCrossTenantContext(sb, "inq-1");
    assert.deepEqual(res, { isCrossTenant: true, parties: [] });
  });

  it("QUIRK: parties rpc returns { data:null, error:null } → null-coalesced to [] (no throw on .map of null)", async () => {
    const sb = rpcStub({
      is_cross_tenant_inquiry: { data: false, error: null },
      owning_parties_for_inquiry: { data: null, error: null },
    });
    const res = await loadCrossTenantContext(sb, "inq-1");
    assert.deepEqual(res, { isCrossTenant: false, parties: [] });
  });
});
