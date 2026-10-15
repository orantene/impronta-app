/**
 * TUL-484: the offer server actions admit a talent selling in her own business
 * (sole live seat, invite rows still 'invited') through the engine's own rule,
 * and never widen to staff of another tenant or to a missing proof.
 */
import test from "node:test";
import assert from "node:assert/strict";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { requireInquiryOfferAction, type OfferGuardDeps, type OfferVerb } from "@/lib/saas/inquiry-offer-guard";

const FAIL = { ok: false as const, error: "You are not the coordinator of this inquiry." };
const sb = {} as SupabaseClient;
const user = { id: "u1" } as User;

function deps(over: Partial<OfferGuardDeps> = {}): OfferGuardDeps {
  return {
    manager: async () => FAIL,
    session: async () => ({ supabase: sb, user }),
    permission: async () => ({ ok: true, isStaff: false, talentProfileId: "tp1" }),
    workspaceOf: async () => ({ tenantId: "t1", tenantSlug: "rosa" }),
    ...over,
  };
}

test("a manager the usual guard admits is returned untouched", async () => {
  const ok = { ok: true as const, supabase: sb, user, tenantId: "t9", tenantSlug: "x", isStaff: true };
  const res = await requireInquiryOfferAction("i1", "create_offer", deps({ manager: async () => ok }));
  assert.equal(res, ok);
});

for (const verb of ["create_offer", "update_offer", "send_offer"] as OfferVerb[]) {
  test(`${verb}: the owner talent on her own lineup passes with the inquiry's workspace`, async () => {
    let asked: OfferVerb | null = null;
    const res = await requireInquiryOfferAction("i1", verb, deps({
      permission: async (_s, _i, _u, v) => { asked = v; return { ok: true, isStaff: false, talentProfileId: "tp1" }; },
    }));
    assert.equal(res.ok, true);
    if (res.ok) {
      assert.equal(res.tenantId, "t1");
      assert.equal(res.isStaff, false);
    }
    assert.equal(asked, verb);
  });
}

test("the engine refusing her keeps the original refusal", async () => {
  const res = await requireInquiryOfferAction("i1", "create_offer", deps({ permission: async () => ({ ok: false }) }));
  assert.deepEqual(res, FAIL);
});

test("staff of another tenant never passes through the fallback", async () => {
  const res = await requireInquiryOfferAction("i1", "create_offer", deps({
    permission: async () => ({ ok: true, isStaff: true, talentProfileId: null }),
  }));
  assert.deepEqual(res, FAIL);
});

test("a non-staff actor without a talent profile is refused", async () => {
  const res = await requireInquiryOfferAction("i1", "send_offer", deps({
    permission: async () => ({ ok: true, isStaff: false, talentProfileId: null }),
  }));
  assert.deepEqual(res, FAIL);
});

test("no session, no workspace, or an empty inquiry id fail closed", async () => {
  assert.deepEqual(await requireInquiryOfferAction("i1", "create_offer", deps({ session: async () => null })), FAIL);
  assert.deepEqual(await requireInquiryOfferAction("i1", "create_offer", deps({ workspaceOf: async () => null })), FAIL);
  assert.deepEqual(await requireInquiryOfferAction("  ", "create_offer", deps()), FAIL);
});
