import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  LANE_FILTER_OR,
  MX_PUBLISHABLE_KEY_READ_ORDER,
  classifyEventLane,
  computeCommerceHealth,
  effectiveMxPublishableVar,
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
      NEXT_PUBLIC_STRIPE_MX_PUBLISHABLE_KEY: m("unset"),
      STRIPE_MX_PUBLISHABLE_KEY: m("live"),
      STRIPE_V2_SECRET_KEY: m("live"),
    },
    webhookSecretsSet: {
      STRIPE_WEBHOOK_SECRET: true,
      STRIPE_WEBHOOK_SECRET_CONNECT: true,
      STRIPE_MX_WEBHOOK_SECRET: true,
      STRIPE_MX_WEBHOOK_SECRET_CONNECT: true,
    },
    heldPayouts: { state: "ok", count: 0 },
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
  input.keyModes.NEXT_PUBLIC_STRIPE_MX_PUBLISHABLE_KEY = "unset";
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
  const rows = computeCommerceHealth(base({ heldPayouts: { state: "ok", count: 3 }, stuckPaymentRequestedCount: 1 }));
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
    NEXT_PUBLIC_STRIPE_MX_PUBLISHABLE_KEY: "pk_test_pqr678",
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
  for (const frag of ["abc123", "def456", "ghi789", "pqr678", "secret111", "sk_live", "pk_test", "whsec"]) {
    assert.ok(!json.includes(frag), `leaked fragment ${frag}`);
  }
});

test("held payouts: read error is an error row, never a zero", () => {
  const row = byId(computeCommerceHealth(base({ heldPayouts: { state: "error" } })), "held-payouts");
  assert.equal(row.status, "error");
  assert.match(row.detail, /read failed/);
  assert.equal(row.data?.state, "error");
  assert.equal(row.data?.count, undefined);
});

test("held payouts: capped is a warn with a 500+ lower bound", () => {
  const row = byId(computeCommerceHealth(base({ heldPayouts: { state: "capped", count: 500 } })), "held-payouts");
  assert.equal(row.status, "warn");
  assert.equal(row.detail, "500+ held");
  assert.equal(row.data?.capped, true);
});

test("held payouts: ok under the cap is unchanged (0 ok, n warn)", () => {
  assert.equal(byId(computeCommerceHealth(base()), "held-payouts").status, "ok");
  const row = byId(computeCommerceHealth(base({ heldPayouts: { state: "ok", count: 2 } })), "held-payouts");
  assert.equal(row.status, "warn");
  assert.equal(row.detail, "2 held");
});

// ---- MX publishable key name ------------------------------------------------

test("MX publishable read order matches what stripe/client.ts really reads", () => {
  const src = readFileSync(new URL("../stripe/client.ts", import.meta.url), "utf8");
  const fn = src.slice(src.indexOf("export function getStripeMxPublishableKey"));
  const body = fn.slice(0, fn.indexOf("\n}\n"));
  const names = [...body.matchAll(/process\.env\.([A-Z0-9_]+)/g)].map((m) => m[1]);
  assert.deepEqual(names, [...MX_PUBLISHABLE_KEY_READ_ORDER]);
});

test("effective MX publishable var: NEXT_PUBLIC wins, server name is the fallback, else none", () => {
  const input = base();
  // Production shape: only STRIPE_MX_PUBLISHABLE_KEY set.
  assert.equal(effectiveMxPublishableVar(input.keyModes), "STRIPE_MX_PUBLISHABLE_KEY");
  input.keyModes.NEXT_PUBLIC_STRIPE_MX_PUBLISHABLE_KEY = "live";
  assert.equal(effectiveMxPublishableVar(input.keyModes), "NEXT_PUBLIC_STRIPE_MX_PUBLISHABLE_KEY");
  input.keyModes.NEXT_PUBLIC_STRIPE_MX_PUBLISHABLE_KEY = "unset";
  input.keyModes.STRIPE_MX_PUBLISHABLE_KEY = "unset";
  assert.equal(effectiveMxPublishableVar(input.keyModes), "none");
});

test("key-modes row carries per-var modes and the MX source in data", () => {
  const row = byId(computeCommerceHealth(base()), "key-modes");
  assert.equal(row.data?.mxPublishableSource, "STRIPE_MX_PUBLISHABLE_KEY");
  assert.equal(row.data?.["m:STRIPE_MX_PUBLISHABLE_KEY"], "live");
  assert.equal(row.data?.["m:NEXT_PUBLIC_STRIPE_MX_PUBLISHABLE_KEY"], "unset");
});

test("a test NEXT_PUBLIC MX publishable key against a live MX secret is an error", () => {
  const input = base();
  input.keyModes.NEXT_PUBLIC_STRIPE_MX_PUBLISHABLE_KEY = "test";
  assert.equal(byId(computeCommerceHealth(input), "key-modes").status, "error");
});

test("snapshotKeyEnv reads the NEXT_PUBLIC MX name too", () => {
  const snap = snapshotKeyEnv({ NEXT_PUBLIC_STRIPE_MX_PUBLISHABLE_KEY: "pk_live_x" });
  assert.equal(snap.keyModes.NEXT_PUBLIC_STRIPE_MX_PUBLISHABLE_KEY, "live");
  assert.equal(snap.keyModes.STRIPE_MX_PUBLISHABLE_KEY, "unset");
});

// ---- lane classification -----------------------------------------------------

test("classifyEventLane: explicit lane wins over the id shape", () => {
  assert.equal(classifyEventLane({ lane: "platform", event_id: "evt_1" }), "platform");
  assert.equal(classifyEventLane({ lane: "platform_mx", event_id: "platform_mx:evt_1" }), "platform_mx");
  // A non-null lane is never second-guessed by the id.
  assert.equal(classifyEventLane({ lane: "platform", event_id: "platform_mx:evt_1" }), "platform");
  assert.equal(classifyEventLane({ lane: "discover_client_subscription", event_id: "evt_1" }), "discover_client_subscription");
  assert.equal(classifyEventLane({ lane: "something_new", event_id: "evt_1" }), "other");
});

test("classifyEventLane: NULL lane (legacy / deploy window) falls back to the prefix rule", () => {
  assert.equal(classifyEventLane({ lane: null, event_id: "evt_1" }), "platform");
  assert.equal(classifyEventLane({ lane: undefined, event_id: "evt_1" }), "platform");
  assert.equal(classifyEventLane({ lane: null, event_id: "platform_mx:evt_1" }), "platform_mx");
  assert.equal(classifyEventLane({ lane: null, event_id: "discover_client_subscription:evt_1" }), "discover_client_subscription");
  assert.equal(classifyEventLane({ lane: null, event_id: "unknown:evt_1" }), "other");
});

test("loader filters express the same rule: explicit lane, null-only prefix fallback", () => {
  assert.match(LANE_FILTER_OR.platform, /lane\.eq\.platform,and\(lane\.is\.null,event_id\.not\.like\.\*:\*\)/);
  assert.match(LANE_FILTER_OR.platform_mx, /lane\.eq\.platform_mx,and\(lane\.is\.null,event_id\.like\.platform_mx:\*\)/);
  // The prefix rule must only ever apply to legacy nulls.
  for (const f of Object.values(LANE_FILTER_OR)) assert.match(f, /and\(lane\.is\.null,/);
});

// ── TUL-186: the MX lane row ─────────────────────────────────────────────────────────────────────────
const mxRow = (over: Partial<CommerceHealthInput>) => byId(computeCommerceHealth(base(over)), "mx-lane");

test("mx-lane: never used (production today) is ok and says no events yet", () => {
  const r = mxRow({ mxLane: { lastEventAt: null, lastEventLivemode: null, eventsLast24h: 0, mxSellers: 0 } });
  assert.equal(r.status, "ok");
  assert.equal(r.data?.state, "no_events");
  assert.match(r.detail, /no MX events yet; MX-connected sellers: 0/);
});

test("mx-lane: last event shows its age and live vs test", () => {
  const live = mxRow({ mxLane: { lastEventAt: hoursAgo(3), lastEventLivemode: true, eventsLast24h: 4, mxSellers: 2 } });
  assert.equal(live.status, "ok");
  assert.deepEqual([live.data?.state, live.data?.mode, live.data?.hours, live.data?.events24h], ["last", "live", 3, 4]);
  assert.equal(mxRow({ mxLane: { lastEventAt: hoursAgo(3), lastEventLivemode: false, eventsLast24h: 1, mxSellers: 1 } }).data?.mode, "test");
  assert.equal(mxRow({ mxLane: { lastEventAt: hoursAgo(3), lastEventLivemode: null, eventsLast24h: 1, mxSellers: 1 } }).data?.mode, "unknown");
});

test("mx-lane: an MX-connected seller exists but 0 events in 24h is a warn", () => {
  const r = mxRow({ mxLane: { lastEventAt: hoursAgo(40), lastEventLivemode: true, eventsLast24h: 0, mxSellers: 3 } });
  assert.equal(r.status, "warn");
  assert.equal(r.data?.state, "silent");
  assert.match(r.detail, /3 MX-connected seller\(s\) but 0 platform_mx events in 24h/);
});

test("mx-lane: no MX sellers and a quiet lane is NOT a warning (nothing should have arrived)", () => {
  assert.equal(mxRow({ mxLane: { lastEventAt: hoursAgo(90), lastEventLivemode: false, eventsLast24h: 0, mxSellers: 0 } }).status, "ok");
});

test("mx-lane: the Connect secret missing is named, and warns once MX sellers exist", () => {
  const unset = { ...base().webhookSecretsSet, STRIPE_MX_WEBHOOK_SECRET_CONNECT: false };
  const noSellers = mxRow({ webhookSecretsSet: unset, mxLane: { lastEventAt: null, lastEventLivemode: null, eventsLast24h: 0, mxSellers: 0 } });
  assert.equal(noSellers.status, "ok");
  assert.equal(noSellers.data?.connectMissing, true);
  assert.match(noSellers.detail, /Connect secret missing/);
  const withSellers = mxRow({ webhookSecretsSet: unset, mxLane: { lastEventAt: hoursAgo(1), lastEventLivemode: true, eventsLast24h: 2, mxSellers: 1 } });
  assert.equal(withSellers.status, "warn");
  assert.match(withSellers.detail, /Connect secret missing/);
});

test("mx-lane: the row is absent when the caller has no MX data (a failed read is not shown as zeros)", () => {
  assert.equal(computeCommerceHealth(base()).some((r) => r.id === "mx-lane"), false);
});

test("mx-lane: presence only, never a secret value", () => {
  const blob = JSON.stringify(mxRow({ mxLane: { lastEventAt: hoursAgo(1), lastEventLivemode: true, eventsLast24h: 1, mxSellers: 1 } }));
  assert.doesNotMatch(blob, /whsec_|sk_live|sk_test/);
});

test("mx-lane: loader and section are wired, with en and es text", () => {
  const rd = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");
  const loader = rd("../../app/(workspace)/platform/admin/commerce/health/load-commerce-health.ts");
  assert.match(loader, /\.eq\("stripe_account_platform", "mx"\)/);
  assert.match(loader, /failedReads\.push\("mx-lane"\)/);
  const section = rd("../../app/(workspace)/platform/admin/commerce/health/CommerceWiringSection.tsx");
  assert.match(section, /row\.id === "mx-lane"/);
  for (const lang of ["en", "es"]) {
    const m = rd(`../../../messages/${lang}.json`);
    assert.match(m, /"mxLane": \{\s+"label":/);
    assert.match(m, /"connectMissing":/);
  }
});
