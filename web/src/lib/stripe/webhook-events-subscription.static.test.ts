import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

/**
 * Static pin (TUL-1747): the webhook setup script must subscribe the endpoint
 * to the async payment events. Without them a delayed-method (SEPA, Bacs, Pay
 * by Bank) balance top-up is never credited, because it completes `unpaid`.
 */

function readScript(): string {
  const candidates = [
    path.resolve(process.cwd(), "../scripts/ops/configure-stripe-webhook.sh"),
    path.resolve(process.cwd(), "scripts/ops/configure-stripe-webhook.sh"),
  ];
  const found = candidates.find((p) => existsSync(p));
  assert.ok(found, `configure-stripe-webhook.sh not found in ${candidates.join(", ")}`);
  return readFileSync(found, "utf8");
}

function eventsList(src: string): string[] {
  const m = /^EVENTS=\(\n([\s\S]*?)^\)/m.exec(src);
  assert.ok(m, "EVENTS=( ... ) array not found");
  return m[1]
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#"));
}

test("webhook script EVENTS subscribes to completed + both async payment events", () => {
  const events = eventsList(readScript());
  for (const e of [
    "checkout.session.completed",
    "checkout.session.async_payment_succeeded",
    "checkout.session.async_payment_failed",
  ]) {
    assert.ok(events.includes(e), `EVENTS is missing ${e}`);
  }
});

test("webhook script EVENTS has no duplicate entries", () => {
  const events = eventsList(readScript());
  assert.equal(new Set(events).size, events.length);
});
