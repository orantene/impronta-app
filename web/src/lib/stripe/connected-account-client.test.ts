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

test("TUL-1788: session publishable key is the same platform's, and null on a test/live mismatch", async () => {
  const { publishableKeyForSession } = await import("./connected-account-client");
  const names = ["NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY", "STRIPE_SECRET_KEY", "STRIPE_MX_PUBLISHABLE_KEY", "NEXT_PUBLIC_STRIPE_MX_PUBLISHABLE_KEY", "STRIPE_MX_SECRET_KEY", "STRIPE_FORCE_TEST_MODE"];
  const saved = Object.fromEntries(names.map((n) => [n, process.env[n]]));
  try {
    delete process.env.STRIPE_FORCE_TEST_MODE;
    delete process.env.NEXT_PUBLIC_STRIPE_MX_PUBLISHABLE_KEY;
    process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY = "pk_test_us";
    process.env.STRIPE_SECRET_KEY = "sk_test_us";
    process.env.STRIPE_MX_PUBLISHABLE_KEY = "pk_test_mx";
    process.env.STRIPE_MX_SECRET_KEY = "sk_test_mx";
    assert.equal(publishableKeyForSession("mx"), "pk_test_mx");
    assert.equal(publishableKeyForSession("us"), "pk_test_us");
    process.env.STRIPE_MX_PUBLISHABLE_KEY = "pk_live_mx";
    assert.equal(publishableKeyForSession("mx"), null);
    delete process.env.STRIPE_MX_PUBLISHABLE_KEY;
    assert.equal(publishableKeyForSession("mx"), null);
  } finally {
    for (const n of names) {
      if (saved[n] === undefined) delete process.env[n];
      else process.env[n] = saved[n];
    }
  }
});

test("TUL-1788: refresh always stamps stripe_account_synced_at and revalidates the page", async () => {
  const { readFileSync } = await import("node:fs");
  const read = (f: string) => readFileSync(new URL(f, import.meta.url), "utf8");
  const agency = read("../payments/stripe-connect.ts");
  const talent = read("../payments/stripe-connect-talent.ts");
  assert.match(agency.slice(agency.indexOf("export async function persistAccountSnapshot")), /stripe_account_synced_at: syncedAt/);
  assert.match(talent.slice(talent.indexOf("export async function persistTalentAccountSnapshot")), /stripe_account_synced_at: syncedAt/);
  const actions = read("../server-actions/admin-stripe-connect.ts");
  const refresh = actions.slice(actions.indexOf("export async function refreshConnectStatusAction"));
  assert.match(refresh.slice(0, refresh.indexOf("getConnectSnapshotAction")), /revalidatePath\(`\/\$\{tenantSlug\}\/admin\/payouts`\)/);
});
