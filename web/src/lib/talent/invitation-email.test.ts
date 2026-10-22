import assert from "node:assert/strict";
import { test } from "node:test";

import { loadTalentInvitationEmail, seedTalentInvitationEmail } from "./invitation-email";

type Call = { fn: string; args: Record<string, unknown> };

function fakeRpc(result: { data: unknown; error: unknown }) {
  const calls: Call[] = [];
  return {
    calls,
    rpc: async (fn: string, args: Record<string, unknown>) => {
      calls.push({ fn, args });
      return result;
    },
  };
}

test("loadTalentInvitationEmail calls talent_invitation_email with p_talent_id and returns the address", async () => {
  const f = fakeRpc({ data: "ada@example.com", error: null });
  const email = await loadTalentInvitationEmail(f as never, "tal-1");
  assert.equal(email, "ada@example.com");
  assert.deepEqual(f.calls, [{ fn: "talent_invitation_email", args: { p_talent_id: "tal-1" } }]);
});

test("loadTalentInvitationEmail returns null for an RPC error, a null result (not owner/staff) or a non-string", async () => {
  assert.equal(await loadTalentInvitationEmail(fakeRpc({ data: null, error: { message: "boom" } }) as never, "t"), null);
  assert.equal(await loadTalentInvitationEmail(fakeRpc({ data: null, error: null }) as never, "t"), null);
  assert.equal(await loadTalentInvitationEmail(fakeRpc({ data: { x: 1 }, error: null }) as never, "t"), null);
});

test("seedTalentInvitationEmail passes the talent and the email, and reports whether it wrote", async () => {
  const wrote = fakeRpc({ data: true, error: null });
  assert.deepEqual(await seedTalentInvitationEmail(wrote as never, "tal-1", "a@b.co"), { ok: true, error: null });
  assert.deepEqual(wrote.calls, [{ fn: "talent_seed_invitation_email", args: { p_talent_id: "tal-1", p_email: "a@b.co" } }]);

  const skipped = fakeRpc({ data: false, error: null });
  assert.deepEqual(await seedTalentInvitationEmail(skipped as never, "tal-1", "a@b.co"), { ok: false, error: null });

  const failed = fakeRpc({ data: null, error: { message: "denied" } });
  const r = await seedTalentInvitationEmail(failed as never, "tal-1", "a@b.co");
  assert.equal(r.ok, false);
  assert.deepEqual(r.error, { message: "denied" });
});
