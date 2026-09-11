import { test } from "node:test";
import assert from "node:assert/strict";
import { selectGalleryAssets } from "./gallery-selection";

type Row = Record<string, unknown>;

function fake(store: { booking_deliverables: Row[] }) {
  const from = () => {
    let mode: "select" | "update" = "select";
    let patch: Row = {};
    const eqs: Array<[string, unknown]> = [];
    const match = () => store.booking_deliverables.filter((row) => eqs.every(([k, v]) => row[k] === v));
    const api: Record<string, unknown> = {
      select: () => api,
      update: (p: Row) => {
        mode = "update";
        patch = p;
        return api;
      },
      eq: (k: string, v: unknown) => {
        eqs.push([k, v]);
        return api;
      },
      maybeSingle: async () => ({ data: match()[0] ?? null, error: null }),
      then: async (resolve: (v: { data: null; error: null }) => unknown) => {
        if (mode === "update") {
          for (const row of match()) Object.assign(row, patch);
        }
        return resolve({ data: null, error: null });
      },
    };
    return api;
  };
  return { from };
}

test("gallery selection stays on the deliverable; foreign tenant writes nothing", async () => {
  const store = {
    booking_deliverables: [
      { id: "d1", tenant_id: "t1", booking_id: "b1", selected_asset_ids: [] as string[] },
    ],
  };
  const ok = await selectGalleryAssets(fake(store), {
    tenantId: "t1",
    deliverableId: "d1",
    assetIds: ["a1", "a2", "a1"],
  });
  assert.equal(ok.ok, true);
  if (!ok.ok) return;
  assert.deepEqual(ok.assetIds, ["a1", "a2"]);
  assert.deepEqual(store.booking_deliverables[0].selected_asset_ids, ["a1", "a2"]);

  const foreign = await selectGalleryAssets(fake(store), {
    tenantId: "t2",
    deliverableId: "d1",
    assetIds: ["a9"],
  });
  assert.equal(foreign.ok, false);
  if (foreign.ok) return;
  assert.equal(foreign.reason, "wrong_tenant");
  assert.deepEqual(store.booking_deliverables[0].selected_asset_ids, ["a1", "a2"]);
});
