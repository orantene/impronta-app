import assert from "node:assert/strict";
import { test } from "node:test";

import { loadOffersAwaitingApproval } from "./offer-pending-approvals";

type Pending = { id: string; offer_id: string; inquiry_participants: { role: string; user_id: string | null; talent_profile_id: string | null } };

function fakeAdmin(pending: Pending[], offers: Array<{ id: string; created_by_user_id: string | null }>, talents: Array<{ id: string; user_id: string | null }>) {
  return {
    from(table: string) {
      const data = table === "inquiry_approvals" ? pending : table === "inquiry_offers" ? offers : talents;
      const q: Record<string, unknown> = {};
      for (const m of ["select", "eq", "in", "neq"]) q[m] = () => q;
      q.then = (resolve: (v: { data: unknown; error: null }) => unknown) => resolve({ data, error: null });
      return q;
    },
  };
}

test("a talent who has not approved a staff-sent offer blocks the client's Accept", async () => {
  const admin = fakeAdmin(
    [
      { id: "a1", offer_id: "o1", inquiry_participants: { role: "client", user_id: null, talent_profile_id: null } },
      { id: "a2", offer_id: "o1", inquiry_participants: { role: "talent", user_id: "u-talent", talent_profile_id: "tp1" } },
    ],
    [{ id: "o1", created_by_user_id: "u-staff" }],
    [{ id: "tp1", user_id: "u-talent" }],
  );
  const set = await loadOffersAwaitingApproval(admin, { tenantId: "t", offerIds: ["o1"] });
  assert.deepEqual([...set], ["o1"]);
});

test("the sender's own approval is implicit: a talent-authored offer does not block", async () => {
  const admin = fakeAdmin(
    [
      { id: "a1", offer_id: "o1", inquiry_participants: { role: "client", user_id: null, talent_profile_id: null } },
      { id: "a2", offer_id: "o1", inquiry_participants: { role: "talent", user_id: "u-talent", talent_profile_id: "tp1" } },
    ],
    [{ id: "o1", created_by_user_id: "u-talent" }],
    [{ id: "tp1", user_id: "u-talent" }],
  );
  assert.equal((await loadOffersAwaitingApproval(admin, { tenantId: "t", offerIds: ["o1"] })).size, 0);
});

test("only the client's own pending row, or no pending rows, never blocks", async () => {
  const onlyClient = fakeAdmin([{ id: "a1", offer_id: "o1", inquiry_participants: { role: "client", user_id: "u-c", talent_profile_id: null } }], [{ id: "o1", created_by_user_id: "u-staff" }], []);
  assert.equal((await loadOffersAwaitingApproval(onlyClient, { tenantId: "t", offerIds: ["o1"] })).size, 0);
  assert.equal((await loadOffersAwaitingApproval(fakeAdmin([], [], []), { tenantId: "t", offerIds: ["o1"] })).size, 0);
  assert.equal((await loadOffersAwaitingApproval(fakeAdmin([], [], []), { tenantId: "t", offerIds: [] })).size, 0);
});
