import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import { approveOfferAction } from "@/app/(workspace)/[tenantSlug]/client/_actions/inquiry-offer-actions";
import { saveDraftAction } from "@/app/(workspace)/[tenantSlug]/client/_actions/inquiry-intent-actions";
import { cancelInquiryAsClient } from "@/app/(workspace)/[tenantSlug]/client/_actions/inquiry-cancel-actions";
import { markClientThreadReadAction } from "@/app/(workspace)/[tenantSlug]/client/_actions/inquiry-message-actions";
import { updateClientSelfProfile } from "@/app/(workspace)/[tenantSlug]/client/settings/actions";
import { startClientVerification } from "@/app/(workspace)/[tenantSlug]/client/settings/stripe-client-trust-actions";
import { setTalentProfileVisibility } from "@/app/(workspace)/[tenantSlug]/talent/settings/actions";
import { connectTalentPayoutAccountAction } from "@/app/(workspace)/[tenantSlug]/talent/settings/actions";
import { blockInquirySenderAsTalent } from "@/app/(workspace)/[tenantSlug]/talent/inbox/[id]/actions";
import { setFeePayer } from "@/lib/billing/fee-payer-actions";
import { saveMyFaqItems } from "@/lib/talent/faq-editor-actions";
import { applySiteDesignAction } from "@/lib/talent-site/server/theme-actions";
import {
  assertNotImpersonating,
  assertNotImpersonatingWith,
  IMPERSONATION_READ_ONLY_REFUSAL,
  ImpersonationReadOnlyError,
  requireNotImpersonating,
  setReadOnlyProbeForTests,
  type ReadOnlyProbe,
} from "./readonly-guard";

/**
 * TUL-256. Behavioural proof for the read-only guard. The identity is injected
 * (no cookie, no network, no database). A probe that records every call lets us
 * assert the refusal happens before anything else could run: once the actions
 * are refused, nothing past the guard (session, Supabase, Stripe) is reached,
 * so none of it can write. The static test proves every action calls the guard.
 */

type Calls = { cookie: number; identity: number };

function probe(opts: { cookie: boolean; impersonating?: boolean; throws?: boolean }): { p: ReadOnlyProbe; calls: Calls } {
  const calls: Calls = { cookie: 0, identity: 0 };
  const p: ReadOnlyProbe = {
    hasCookie: async () => {
      calls.cookie += 1;
      return opts.cookie;
    },
    isImpersonating: async () => {
      calls.identity += 1;
      if (opts.throws) throw new Error("identity lookup failed");
      return opts.impersonating === true;
    },
  };
  return { p, calls };
}

afterEach(() => setReadOnlyProbeForTests(null));

test("guard table: only a verified impersonation is refused", async () => {
  const rows: Array<{ name: string; cookie: boolean; impersonating?: boolean; throws?: boolean; ok: boolean; identityCalls: number }> = [
    { name: "no cookie (ordinary user, guest)", cookie: false, ok: true, identityCalls: 0 },
    { name: "cookie present but not valid for this actor", cookie: true, impersonating: false, ok: true, identityCalls: 1 },
    { name: "valid impersonation", cookie: true, impersonating: true, ok: false, identityCalls: 1 },
    { name: "cookie present and identity lookup fails: fail closed", cookie: true, throws: true, ok: false, identityCalls: 1 },
  ];
  for (const row of rows) {
    const { p, calls } = probe(row);
    const r = await assertNotImpersonatingWith(p);
    assert.equal(r.ok, row.ok, row.name);
    assert.equal(calls.cookie, 1, `${row.name}: one cookie read`);
    assert.equal(calls.identity, row.identityCalls, `${row.name}: identity resolved only when the cookie is present`);
    if (!r.ok) assert.equal(r.error, IMPERSONATION_READ_ONLY_REFUSAL);
  }
});

test("guard: no request scope (cookie read throws) is not an impersonation", async () => {
  const r = await assertNotImpersonatingWith({
    hasCookie: async () => {
      throw new Error("cookies() outside a request scope");
    },
    isImpersonating: async () => true,
  });
  assert.equal(r.ok, true);
});

test("guard: the refusal is bilingual and the throwing form throws a typed error", async () => {
  assert.ok(IMPERSONATION_READ_ONLY_REFUSAL.startsWith("Exit 'viewing as' to make changes"));
  assert.ok(IMPERSONATION_READ_ONLY_REFUSAL.endsWith("Sal de 'ver como' para hacer cambios"));
  setReadOnlyProbeForTests(probe({ cookie: true, impersonating: true }).p);
  await assert.rejects(requireNotImpersonating(), ImpersonationReadOnlyError);
  setReadOnlyProbeForTests(probe({ cookie: false }).p);
  await requireNotImpersonating();
  assert.equal((await assertNotImpersonating()).ok, true);
});

test("impersonating: real client-portal actions refuse and reach nothing past the guard", async () => {
  const { p, calls } = probe({ cookie: true, impersonating: true });
  setReadOnlyProbeForTests(p);

  const cancel = await cancelInquiryAsClient("tenant", "inq", null);
  assert.deepEqual(cancel, { ok: false, error: IMPERSONATION_READ_ONLY_REFUSAL });

  const profile = await updateClientSelfProfile({ tenantSlug: "tenant", displayName: "x", company: "y" });
  assert.deepEqual(profile, { ok: false, error: IMPERSONATION_READ_ONLY_REFUSAL });

  const verify = await startClientVerification("tenant");
  assert.deepEqual(verify, { ok: false, error: IMPERSONATION_READ_ONLY_REFUSAL });

  const read = await markClientThreadReadAction("tenant", "inq", null);
  assert.deepEqual(read, { ok: false });

  const offer = await approveOfferAction({ kind: "idle" }, new FormData());
  assert.deepEqual(offer, { kind: "error", message: IMPERSONATION_READ_ONLY_REFUSAL });

  const draft = await saveDraftAction({ kind: "idle" }, new FormData());
  assert.deepEqual(draft, { kind: "error", message: IMPERSONATION_READ_ONLY_REFUSAL });

  assert.equal(calls.cookie, 6);
  assert.equal(calls.identity, 6);
});

test("impersonating: real talent-portal actions refuse and reach nothing past the guard", async () => {
  const { p, calls } = probe({ cookie: true, impersonating: true });
  setReadOnlyProbeForTests(p);

  assert.deepEqual(await setTalentProfileVisibility("tenant", "tp", true), { ok: false, error: IMPERSONATION_READ_ONLY_REFUSAL });
  assert.deepEqual(await saveMyFaqItems([]), { ok: false, error: IMPERSONATION_READ_ONLY_REFUSAL });
  assert.deepEqual(await setFeePayer("seller"), { ok: false, error: IMPERSONATION_READ_ONLY_REFUSAL });
  assert.deepEqual(await blockInquirySenderAsTalent("inq", "client_user", "subject"), { ok: false });
  assert.deepEqual(await applySiteDesignAction({ designSlug: "x" }), {
    ok: false,
    code: "not_owner",
    error: IMPERSONATION_READ_ONLY_REFUSAL,
  });
  await assert.rejects(connectTalentPayoutAccountAction(new FormData()), ImpersonationReadOnlyError);

  assert.equal(calls.cookie, 6);
  assert.equal(calls.identity, 6);
});

test("not impersonating: actions run past the guard (no refusal, behaviour unchanged)", async () => {
  const { p, calls } = probe({ cookie: false });
  setReadOnlyProbeForTests(p);
  // With no request scope these fail fast on their own validation or session
  // lookup. The only claim here is that the guard did not refuse and cost no
  // identity lookup.
  const outcomes: unknown[] = [];
  for (const run of [
    () => cancelInquiryAsClient("", "", null),
    () => setTalentProfileVisibility("", "", true),
    () => saveMyFaqItems([]),
  ]) {
    try {
      outcomes.push(await run());
    } catch (e) {
      assert.ok(!(e instanceof ImpersonationReadOnlyError), "guard must not throw for a normal user");
      outcomes.push(e);
    }
  }
  for (const o of outcomes) {
    assert.ok(!(typeof o === "object" && o !== null && "error" in o && (o as { error: unknown }).error === IMPERSONATION_READ_ONLY_REFUSAL));
  }
  assert.equal(calls.cookie, 3);
  assert.equal(calls.identity, 0);
});
