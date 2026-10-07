import test from "node:test";
import assert from "node:assert/strict";
import {
  computeCommerceHealth,
  snapshotKeyEnv,
  type CommerceHealthInput,
  type KeyMode,
} from "./commerce-health";

const NOW = new Date("2026-10-07T12:00:00Z");
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3_600_000).toISOString();

function base(over: Partial<CommerceHealthInput> = {}): CommerceHealthInput {
  const m = (v: KeyMode) => v;
  return {
    keyModes: {
      STRIPE_SECRET_KEY: m("live"),
      NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: m("live"),
      STRIPE_MX_SECRET_KEY: m("live"),
      STRIPE_MX_PUBLISHABLE_KEY: m("live"),
      STRIPE_V2_SECRET_KEY: m("live"),
    },
    webhookSecretsSet: {
      STRIPE_WEBHOOK_SECRET: true,
      STRIPE_WEBHOOK_SECRET_CONNECT: true,
      STRIPE_MX_WEBHOOK_SECRET: true,
      STRIPE_MX_WEBHOOK_SECRET_CONNECT: true,
    },
    heldPayoutCount: 0,
    stuckPaymentRequestedCount: 0,
    lastWebhookAt: { platform: hoursAgo(1), platform_mx: hoursAgo(2) },
    now: NOW,
    ...over,
  };
}

const byId = (rows: ReturnType<typeof computeCommerceHealth>, id: string) =>
  rows.find((r) => r.id === id)!;

test("all green", () => {
  const rows = computeCommerceHealth(base());
  assert.equal(rows.length, 9);
  assert.ok(rows.every((r) => r.status === "ok"), JSON.stringify(rows));
});

test("US live + MX test is an error", () => {
  const input = base();
  input.keyModes.STRIPE_MX_SECRET_KEY = "test";
  const row = byId(computeCommerceHealth(input), "key-modes");
  assert.equal(row.status, "error");
  assert.match(row.detail, /STRIPE_MX_SECRET_KEY: test/);
  assert.match(row.detail, /STRIPE_SECRET_KEY: live/);
});

test("unset keys are ignored for consistency", () => {
  const input = base();
  input.keyModes.STRIPE_MX_SECRET_KEY = "unset";
  input.keyModes.STRIPE_MX_PUBLISHABLE_KEY = "unset";
  input.keyModes.STRIPE_V2_SECRET_KEY = "unset";
  const row = byId(computeCommerceHealth(input), "key-modes");
  assert.equal(row.status, "ok");
  assert.match(row.detail, /STRIPE_V2_SECRET_KEY: unset/);
});

test("MX connect webhook secret missing is a warn", () => {
  const input = base();
  input.webhookSecretsSet.STRIPE_MX_WEBHOOK_SECRET_CONNECT = false;
  const rows = computeCommerceHealth(input);
  assert.equal(byId(rows, "secret:STRIPE_MX_WEBHOOK_SECRET_CONNECT").status, "warn");
  assert.equal(byId(rows, "secret:STRIPE_MX_WEBHOOK_SECRET").status, "ok");
});

test("missing base US webhook secret is an error", () => {
  const input = base();
  input.webhookSecretsSet.STRIPE_WEBHOOK_SECRET = false;
  assert.equal(byId(computeCommerceHealth(input), "secret:STRIPE_WEBHOOK_SECRET").status, "error");
});

test("held and stuck counts warn only when above zero", () => {
  const rows = computeCommerceHealth(base({ heldPayoutCount: 3, stuckPaymentRequestedCount: 1 }));
  assert.equal(byId(rows, "held-payouts").status, "warn");
  assert.equal(byId(rows, "held-payouts").data?.count, 3);
  assert.equal(byId(rows, "stuck-payment-requested").status, "warn");
});

test("lane staleness: 23h ok, 25h warn, none warn", () => {
  const rows = computeCommerceHealth(
    base({ lastWebhookAt: { platform: hoursAgo(23), platform_mx: hoursAgo(25) } }),
  );
  assert.equal(byId(rows, "last-webhook:platform").status, "ok");
  assert.equal(byId(rows, "last-webhook:platform_mx").status, "warn");
  const none = computeCommerceHealth(base({ lastWebhookAt: { platform: null, platform_mx: null } }));
  assert.equal(byId(none, "last-webhook:platform").status, "warn");
  assert.equal(byId(none, "last-webhook:platform").data?.hours, null);
});

test("output never contains key values", () => {
  const env = {
    STRIPE_SECRET_KEY: "sk_live_abc123",
    NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: "pk_live_def456",
    STRIPE_MX_SECRET_KEY: "sk_test_ghi789",
    STRIPE_MX_PUBLISHABLE_KEY: "pk_test_jkl012",
    STRIPE_V2_SECRET_KEY: "sk_live_mno345",
    STRIPE_WEBHOOK_SECRET: "whsec_secret111",
    STRIPE_WEBHOOK_SECRET_CONNECT: "whsec_secret222",
    STRIPE_MX_WEBHOOK_SECRET: "whsec_secret333",
  };
  const snap = snapshotKeyEnv(env);
  assert.equal(snap.keyModes.STRIPE_MX_SECRET_KEY, "test");
  assert.equal(snap.webhookSecretsSet.STRIPE_MX_WEBHOOK_SECRET_CONNECT, false);
  const json = JSON.stringify(
    computeCommerceHealth({ ...base(), ...snap, lastWebhookAt: { platform: null, platform_mx: null } }),
  );
  for (const v of Object.values(env)) assert.ok(!json.includes(v), `leaked ${v}`);
  for (const frag of ["abc123", "def456", "ghi789", "secret111", "sk_live", "pk_test", "whsec"]) {
    assert.ok(!json.includes(frag), `leaked fragment ${frag}`);
  }
});
