import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { redactStripeHealth } from "./stripe-health-redact";
import type { StripeHealth } from "./stripe-health";

const HERE = dirname(fileURLToPath(import.meta.url));

const leaky = {
  fetchedAt: "2026-10-14T00:00:00Z",
  checks: [
    { id: "account", label: "Stripe account", status: "fail", detail: "The key was rejected by Stripe (Invalid API Key provided: sk_live_********************abcd)." },
    {
      id: "webhooks",
      label: "Webhooks",
      status: "ok",
      detail: "2 enabled endpoints on this account.",
      items: [
        { name: "https://pay.staging.tulala.digital/api/webhooks/stripe?x-vercel-protection-bypass=SECRETVALUE123", status: "ok", detail: "enabled · 9 events" },
        { name: "https://tulala.digital/api/webhooks/stripe?a=1&b=whsec_abcdefghijklmnopq", status: "warn", detail: "disabled · rk_test_abcdefghijklmnop" },
      ],
    },
  ],
} as unknown as StripeHealth;

test("commerce health payload never carries bypass params or key values", () => {
  const out = JSON.stringify(redactStripeHealth(leaky));
  assert.ok(!out.includes("x-vercel-protection-bypass="), out);
  assert.ok(!out.includes("SECRETVALUE123"), out);
  assert.ok(!/\b(sk|rk|pk)_(live|test)_|whsec_/.test(out), out);
  assert.match(out, /https:\/\/pay\.staging\.tulala\.digital\/api\/webhooks\/stripe"/);
  assert.match(out, /…abcd/);
});

test("loadStripeHealth returns only through redactStripeHealth (static)", () => {
  const src = readFileSync(join(HERE, "stripe-health.ts"), "utf8");
  const body = src.slice(src.indexOf("export const loadStripeHealth"));
  const returns = body.match(/return\s+\{?/g) ?? [];
  assert.ok(returns.length >= 1);
  for (const m of body.matchAll(/\breturn\b([^;]*)/g)) {
    assert.match(m[1], /^\s*redactStripeHealth\(/, `unredacted return in loadStripeHealth: return${m[1].slice(0, 60)}`);
  }
});
