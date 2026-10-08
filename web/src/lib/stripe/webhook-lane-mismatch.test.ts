import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type Stripe from "stripe";
import { otherLaneSecrets, reportLaneMismatch } from "./webhook-lane-mismatch";

const ev = { id: "evt_1", type: "payment_intent.succeeded" } as Stripe.Event;
const env = { STRIPE_MX_WEBHOOK_SECRET: "mx-a", STRIPE_MX_WEBHOOK_SECRET_CONNECT: "mx-b", STRIPE_WEBHOOK_SECRET: "us-a" };

function harness(okSecret: string | null) {
  const logs: Array<[string, string]> = [];
  const seen: string[] = [];
  return {
    logs,
    seen,
    args: {
      body: "{}",
      signature: "sig",
      env,
      log: (c: string, m: string) => void logs.push([c, m]),
      verify: async (_b: string, _s: string, secret: string) => {
        seen.push(secret);
        if (secret === okSecret) return ev;
        throw new Error("bad sig");
      },
    },
  };
}

test("US route, MX secret verifies: logs mismatch with ids and lanes, no secrets", async () => {
  const h = harness("mx-b");
  assert.equal(await reportLaneMismatch({ ...h.args, expectedLane: "us" }), true);
  assert.equal(h.logs.length, 1);
  const msg = h.logs[0][1];
  assert.match(msg, /other lane \(webhook endpoint points at the wrong URL\)/);
  assert.match(msg, /evt_1/);
  assert.match(msg, /payment_intent\.succeeded/);
  assert.match(msg, /expected_lane=us actual_lane=mx/);
  assert.doesNotMatch(JSON.stringify(h.logs), /mx-a|mx-b|us-a/);
});

test("MX route, US secret verifies: reports expected mx, actual us", async () => {
  const h = harness("us-a");
  assert.equal(await reportLaneMismatch({ ...h.args, expectedLane: "mx" }), true);
  assert.match(h.logs[0][1], /expected_lane=mx actual_lane=us/);
});

test("neither lane verifies: false and no log", async () => {
  const h = harness(null);
  assert.equal(await reportLaneMismatch({ ...h.args, expectedLane: "us" }), false);
  assert.equal(h.logs.length, 0);
});

test("no other-lane secret configured: no crash, verify never called", async () => {
  const h = harness("anything");
  assert.equal(await reportLaneMismatch({ ...h.args, env: {}, expectedLane: "us" }), false);
  assert.equal(h.seen.length, 0);
  assert.deepEqual(otherLaneSecrets("mx", { STRIPE_WEBHOOK_SECRET: "  " }), []);
});

test("handler wires the diagnostic before its unchanged 400, never claiming", () => {
  const src = readFileSync(join(process.cwd(), "src/lib/stripe/webhook-handler.ts"), "utf8");
  const verifyFail = src.slice(src.indexOf('logServerError("stripe-webhook.verify"'));
  const idx = {
    report: verifyFail.indexOf("reportLaneMismatch("),
    four: verifyFail.indexOf("Invalid signature."),
    claim: verifyFail.indexOf("claimEventForProcessing("),
  };
  assert.ok(idx.report > 0 && idx.report < idx.four && idx.four < idx.claim);
  assert.match(verifyFail, /Invalid signature\.[\s\S]{0,40}status: 400/);
});
