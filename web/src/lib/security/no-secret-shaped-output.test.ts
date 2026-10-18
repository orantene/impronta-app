/**
 * TUL-1049 (A4): admin / webhook health output must contain no secret-shaped
 * strings, whatever a Stripe endpoint URL, error message or detail carries.
 * Synthetic secrets only (never a real value). The detector looks for the
 * bypass header or param, Stripe key and signing-secret prefixes, bearer
 * tokens, and bare long tokens (32+ url-safe characters) in the rendered JSON.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import { redactStripeHealth } from "@/lib/pricing/stripe-health-redact";
import { scrubSecretsInText } from "./redact-display";
import type { StripeHealth } from "@/lib/pricing/stripe-health";

const FAKE_BYPASS = "Zq9fXk2LmN8vTb4RcW7yHd3SgJ6pAe1U";
// Built at runtime so no secret-shaped literal sits in the source (push protection scans for them).
const FAKE_WHSEC = ["whsec", "FAKEFAKEFAKEFAKEFAKEFAKE1234"].join("_");
const FAKE_SK = ["sk", "test", "FAKEFAKEFAKEFAKEFAKE9999"].join("_");

function secretShapes(text: string): string[] {
  const hits: string[] = [];
  if (/x-vercel-(protection-bypass|set-bypass-cookie)\s*[=:]\s*\S/i.test(text)) hits.push("bypass pair");
  if (/[?&]x-vercel-protection-bypass=/i.test(text)) hits.push("bypass param");
  if (/\b(?:sk|rk|pk)_(?:live|test)_[A-Za-z0-9]{8,}/.test(text)) hits.push("stripe key");
  if (/\bwhsec_[A-Za-z0-9]{8,}/.test(text)) hits.push("signing secret");
  if (/\bBearer\s+[A-Za-z0-9._-]{16,}/.test(text)) hits.push("bearer");
  if (new RegExp(FAKE_BYPASS).test(text)) hits.push("the synthetic bypass value");
  return hits;
}

const hostile: StripeHealth = {
  fetchedAt: "2026-10-17T00:00:00.000Z",
  checks: [
    {
      id: "webhooks",
      label: "Webhooks",
      status: "warn",
      detail: `Could not list endpoints (x-vercel-protection-bypass=${FAKE_BYPASS}); key ${FAKE_SK}; ${FAKE_WHSEC}`,
      items: [
        { name: `https://pay.staging.tulala.digital/api/webhooks/stripe?x-vercel-protection-bypass=${FAKE_BYPASS}`, status: "ok", detail: `x-vercel-protection-bypass: ${FAKE_BYPASS}` },
        { name: `https://u:${FAKE_BYPASS}@hook.example/p?x-vercel-set-bypass-cookie=true&token=${FAKE_BYPASS}#${FAKE_BYPASS}`, status: "ok", detail: `Authorization: Bearer ${FAKE_BYPASS}` },
      ],
    },
  ],
} as unknown as StripeHealth;

test("a hostile health payload renders no secret-shaped string", () => {
  const out = JSON.stringify(redactStripeHealth(hostile));
  assert.deepEqual(secretShapes(out), []);
  // The URL host and path survive, so the list stays useful.
  assert.match(out, /pay\.staging\.tulala\.digital\/api\/webhooks\/stripe/);
});

test("the text scrubber removes a quoted bypass pair, header or param style", () => {
  for (const text of [
    `x-vercel-protection-bypass=${FAKE_BYPASS}`,
    `x-vercel-protection-bypass: ${FAKE_BYPASS}`,
    `Header "x-vercel-set-bypass-cookie: ${FAKE_BYPASS}" rejected`,
    `GET https://h.io/p?x-vercel-protection-bypass=${FAKE_BYPASS} 500`,
  ]) {
    assert.deepEqual(secretShapes(scrubSecretsInText(text)), [], text);
  }
});

const SRC = join(process.cwd(), "src");
function walk(dir: string, out: string[] = []): string[] {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(n) && !/\.test\.(ts|tsx)$/.test(n)) out.push(p);
  }
  return out;
}

test("no source file builds the bypass secret into a URL or reads it from anywhere but env", () => {
  const offenders: string[] = [];
  for (const f of walk(SRC)) {
    const src = readFileSync(f, "utf8");
    if (/protection-bypass=/.test(src) && !/redact|scrub/i.test(relative(SRC, f))) offenders.push(`${relative(SRC, f)}: bypass in a query string`);
    if (/VERCEL_AUTOMATION_BYPASS_SECRET/.test(src)) {
      // The one allowed consumer sends it as a HEADER, from env.
      if (!/"x-vercel-protection-bypass":/.test(src) || !/process\.env\.VERCEL_AUTOMATION_BYPASS_SECRET/.test(src)) offenders.push(`${relative(SRC, f)}: not env-to-header`);
    }
  }
  assert.deepEqual(offenders, []);
});
