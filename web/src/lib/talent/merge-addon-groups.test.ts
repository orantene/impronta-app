import assert from "node:assert/strict";
import test from "node:test";

import { mergeAddonGroupsIntoAddOns } from "./merge-addon-groups-pure";
import type { OfferingAddOn } from "./offerings-types";

test("attachment on a published service is present on the public payload", () => {
  const byOffering = new Map<string, OfferingAddOn[]>([
    ["svc-a", [{ id: "child-1", label: "French", amountCents: 8000 }]],
    ["svc-b", []],
  ]);
  const merged = mergeAddonGroupsIntoAddOns(byOffering, [
    {
      id: "grp-enc",
      name: "Encapsulado",
      amountCents: 20000,
      durationMinutes: 25,
      offeringIds: ["svc-a", "svc-b"],
    },
  ]);

  const a = merged.get("svc-a") ?? [];
  assert.equal(a.length, 2);
  assert.deepEqual(a[0], { id: "child-1", label: "French", amountCents: 8000 });
  assert.deepEqual(a[1], {
    id: "grp-enc",
    label: "Encapsulado",
    amountCents: 20000,
    durationMinutes: 25,
  });

  const b = merged.get("svc-b") ?? [];
  assert.equal(b.length, 1);
  assert.equal(b[0]?.id, "grp-enc");
});

test("does not duplicate an id that is already a per-service add-on", () => {
  const byOffering = new Map<string, OfferingAddOn[]>([
    ["svc-a", [{ id: "same", label: "Already", amountCents: 1000 }]],
  ]);
  const merged = mergeAddonGroupsIntoAddOns(byOffering, [
    {
      id: "same",
      name: "Group copy",
      amountCents: 2000,
      durationMinutes: 10,
      offeringIds: ["svc-a"],
    },
  ]);
  assert.equal((merged.get("svc-a") ?? []).length, 1);
  assert.equal((merged.get("svc-a") ?? [])[0]?.label, "Already");
});
