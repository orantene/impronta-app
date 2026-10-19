/**
 * TUL-1049 (P0) static guard. The HQ webhook list showed the Vercel
 * protection-bypass secret because a webhook endpoint URL carried it as a query
 * param. The one place that lists endpoints (`stripe-health.ts`) now returns only
 * through `redactStripeHealth` (pinned in stripe-health-redact.test.ts). This test
 * pins the rest of the app: no OTHER source file may list Stripe webhook endpoints
 * or mention the bypass header, so a second surface cannot reintroduce the leak
 * without a reviewer seeing this list change.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const SRC = join(process.cwd(), "src");

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\.(ts|tsx)$/.test(name)) out.push(p);
  }
  return out;
}

const FILES = walk(SRC);
const rel = (p: string) => relative(SRC, p).split("\\").join("/");

test("only stripe-health.ts lists Stripe webhook endpoints", () => {
  const hits = FILES.filter((f) => /webhook_endpoints/.test(readFileSync(f, "utf8"))).map(rel);
  assert.deepEqual(hits, ["lib/pricing/stripe-health.ts"]);
});

test("the Vercel protection-bypass header appears only where it is sent or redacted", () => {
  const hits = FILES.filter((f) => /protection-bypass/i.test(readFileSync(f, "utf8"))).map(rel).sort();
  assert.deepEqual(hits, ["lib/onboarding/verify-live.ts", "lib/pricing/stripe-health-redact.ts", "lib/security/redact-display.ts"]);
});

test("no UI file renders VERCEL_AUTOMATION_BYPASS_SECRET", () => {
  const hits = FILES.filter((f) => f.endsWith(".tsx") && /VERCEL_AUTOMATION_BYPASS_SECRET/.test(readFileSync(f, "utf8"))).map(rel);
  assert.deepEqual(hits, []);
});
