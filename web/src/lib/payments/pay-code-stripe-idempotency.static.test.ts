import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/** T1.6 — /pay/[code] Stripe checkout must pass an idempotency key. */

const FILE = resolve(process.cwd(), "src/app/(public)/pay/[code]/page.tsx");

test("pay page Stripe session create uses idempotencyKey", () => {
  const src = readFileSync(FILE, "utf8");
  assert.match(src, /checkout\.sessions\.create/);
  assert.match(
    src,
    /idempotencyKey:\s*`pl_\$\{code\}_1`/,
    "must pass pl_<code>_1 so a retry after decline reuses the same request",
  );
});
