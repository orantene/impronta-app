/**
 * TUL-703: no module outside the resolver reads Stripe env vars directly, so
 * STRIPE_FORCE_TEST_MODE cannot be bypassed by a stray `process.env.STRIPE_*`.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const SRC = path.resolve(__dirname, "../..");
const DIRECT_READ = /process\.env(?:\.|\[\s*["'`])(?:NEXT_PUBLIC_)?STRIPE/;

/** Allowed: the resolver itself. Client components get the key as a server-resolved value. */
const ALLOW = new Set(["lib/stripe/env-keys.ts"]);

function walk(dir: string, out: string[]): void {
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx|mts)$/.test(name) && !/\.test\.(ts|tsx|mts)$/.test(name)) out.push(p);
  }
}

test("no direct process.env.STRIPE_* read outside the resolver", () => {
  const files: string[] = [];
  walk(SRC, files);
  const offenders = files
    .map((f) => path.relative(SRC, f).split(path.sep).join("/"))
    .filter((rel) => !ALLOW.has(rel))
    .filter((rel) =>
      readFileSync(path.join(SRC, rel), "utf8")
        .split("\n")
        .some((line) => !/^\s*(\*|\/\/)/.test(line) && DIRECT_READ.test(line)),
    );
  assert.deepEqual(offenders, [], `route these through lib/stripe/env-keys.ts: ${offenders.join(", ")}`);
});
