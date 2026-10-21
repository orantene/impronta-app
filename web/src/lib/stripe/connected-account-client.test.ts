import assert from "node:assert/strict";
import test from "node:test";
import type Stripe from "stripe";

import { PAYOUT_RECONNECT_REQUIRED, payoutSetupErrorText } from "@/lib/payments/connect-account-setup";
import { isStaleAccountError, resolveOwningClient } from "./connected-account-client";
import type { StripeAccountKey } from "./client";

type FakeStripe = {
  tag: StripeAccountKey;
  retrieved: string[];
  accounts: { retrieve: (id: string) => Promise<{ id: string }> };
};

function fake(tag: StripeAccountKey, knows: boolean, otherError?: unknown): FakeStripe {
  const f: FakeStripe = {
    tag,
    retrieved: [],
    accounts: {
      retrieve: async (id: string) => {
        f.retrieved.push(id);
        if (otherError) throw otherError;
        if (!knows) throw Object.assign(new Error("No such account"), { code: "account_invalid" });
        return { id };
      },
    },
  };
  return f;
}

function deps(
  stored: StripeAccountKey,
  clients: Partial<Record<StripeAccountKey, FakeStripe>>,
  persisted: StripeAccountKey[],
) {
  return {
    storedPlatform: stored,
    accountId: "acct_1UT8Fc0z9lAK4VpH",
    getClient: (k: StripeAccountKey) => (clients[k] as unknown as Stripe | undefined) ?? null,
    persistPlatform: async (k: StripeAccountKey) => {
      persisted.push(k);
    },
  };
}

test("TUL-1788: MX-lane account uses the MX client (US never asked)", async () => {
  const us = fake("us", false);
  const mx = fake("mx", true);
  const persisted: StripeAccountKey[] = [];
  const r = await resolveOwningClient(deps("mx", { us, mx }, persisted));
  assert.equal(r.ok, true);
  if (r.ok) {
    assert.equal(r.platform, "mx");
    assert.equal((r.stripe as unknown as FakeStripe).tag, "mx");
    assert.equal(r.healed, false);
  }
  assert.equal(us.retrieved.length, 0);
  assert.deepEqual(persisted, []);
});

test("TUL-1788: US-lane account uses the US client", async () => {
  const us = fake("us", true);
  const mx = fake("mx", false);
  const r = await resolveOwningClient(deps("us", { us, mx }, []));
  assert.equal(r.ok && (r.stripe as unknown as FakeStripe).tag, "us");
  assert.equal(mx.retrieved.length, 0);
});

test("TUL-1788: stored 'us' but the account lives on MX -> MX client and the column is healed", async () => {
  const us = fake("us", false);
  const mx = fake("mx", true);
  const persisted: StripeAccountKey[] = [];
  const r = await resolveOwningClient(deps("us", { us, mx }, persisted));
  assert.equal(r.ok, true);
  if (r.ok) {
    assert.equal(r.platform, "mx");
    assert.equal(r.healed, true);
  }
  assert.deepEqual(persisted, ["mx"]);
});

test("TUL-1788: account_invalid on every platform -> reconnect state, nothing persisted", async () => {
  const persisted: StripeAccountKey[] = [];
  const r = await resolveOwningClient(deps("mx", { us: fake("us", false), mx: fake("mx", false) }, persisted));
  assert.equal(r.ok, false);
  if (!r.ok) {
    assert.equal(r.reason, "reconnect");
    assert.equal(r.error, PAYOUT_RECONNECT_REQUIRED);
  }
  assert.deepEqual(persisted, []);
});

test("TUL-1788: stored platform with no configured key is 'unconfigured', never a silent US fallback", async () => {
  const us = fake("us", true);
  const r = await resolveOwningClient(deps("mx", { us }, []));
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.reason, "unconfigured");
  assert.equal(us.retrieved.length, 0);
});

test("TUL-1788: a transient error is not an ownership answer (stored client kept, other not probed)", async () => {
  const us = fake("us", true);
  const mx = fake("mx", true, Object.assign(new Error("rate limited"), { code: "rate_limit" }));
  const r = await resolveOwningClient(deps("mx", { us, mx }, []));
  assert.equal(r.ok && r.platform, "mx");
  assert.equal(us.retrieved.length, 0);
});

test("TUL-1788: stale-error detection and ES/EN reconnect copy", () => {
  assert.equal(isStaleAccountError({ code: "account_invalid" }), true);
  assert.equal(isStaleAccountError({ code: "resource_missing" }), true);
  assert.equal(isStaleAccountError({ code: "rate_limit" }), false);
  assert.equal(isStaleAccountError(null), false);
  assert.match(payoutSetupErrorText(PAYOUT_RECONNECT_REQUIRED, true), /Vuelve a conectarla/);
  assert.match(payoutSetupErrorText(PAYOUT_RECONNECT_REQUIRED, false), /Reconnect it/);
});
