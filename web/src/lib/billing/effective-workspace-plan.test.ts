import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { resolveEffectiveWorkspacePlanKey } from "./effective-workspace-plan";

const T0 = "2026-10-01T12:00:00.000Z";
const at = (days: number) => new Date(Date.parse(T0) + days * 86_400_000);

type Sub = { status: string; past_due_since: string | null };
function fakeDb(sub: Sub | null, mode: "ok" | "error" | "throw" = "ok") {
  return {
    from(table: string) {
      assert.equal(table, "workspace_subscriptions");
      if (mode === "throw") throw new Error("boom");
      const q = {
        select: () => q,
        eq: () => q,
        maybeSingle: async () =>
          mode === "error" ? { data: null, error: { message: "boom" } } : { data: sub, error: null },
      };
      return q;
    },
  } as never;
}

describe("resolveEffectiveWorkspacePlanKey (TUL-835 choke point)", () => {
  const pd = (since: string | null): Sub => ({ status: "past_due", past_due_since: since });

  test("past_due day 3 keeps the paid plan", async () => {
    assert.equal(await resolveEffectiveWorkspacePlanKey(fakeDb(pd(T0)), "t1", "studio", at(3)), "studio");
  });
  test("past_due day 8 resolves as free", async () => {
    assert.equal(await resolveEffectiveWorkspacePlanKey(fakeDb(pd(T0)), "t1", "studio", at(8)), "free");
  });
  test("exactly day 7 is expired", async () => {
    assert.equal(await resolveEffectiveWorkspacePlanKey(fakeDb(pd(T0)), "t1", "studio", at(7)), "free");
  });
  test("no past_due row keeps the plan", async () => {
    assert.equal(await resolveEffectiveWorkspacePlanKey(fakeDb(null), "t1", "studio", at(30)), "studio");
  });
  test("unknown start fails open", async () => {
    assert.equal(await resolveEffectiveWorkspacePlanKey(fakeDb(pd(null)), "t1", "studio", at(30)), "studio");
  });
  test("query error and thrown error fail open", async () => {
    assert.equal(await resolveEffectiveWorkspacePlanKey(fakeDb(null, "error"), "t1", "studio", at(30)), "studio");
    assert.equal(await resolveEffectiveWorkspacePlanKey(fakeDb(null, "throw"), "t1", "studio", at(30)), "studio");
  });
});
