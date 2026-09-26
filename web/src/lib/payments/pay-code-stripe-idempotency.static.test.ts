import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/** T1.6 — payment checkout opens Stripe through the link money-row helper. */

const PAY_PAGE = resolve(process.cwd(), "src/app/(public)/pay/[code]/pay-page.tsx");
const LINK_PAGE = resolve(process.cwd(), "src/app/(public)/link/[code]/page.tsx");

test("pay page Stripe confirm uses openPaymentLinkCheckout (idempotent money row)", () => {
  const src = readFileSync(PAY_PAGE, "utf8");
  assert.match(src, /openPaymentLinkCheckout\(/);
  assert.doesNotMatch(src, /checkout\.sessions\.create/);
});

test("/link/[code] reuses the same PayByCodePage engine", () => {
  const src = readFileSync(LINK_PAGE, "utf8");
  assert.match(src, /PayByCodePage/);
  assert.match(src, /pathPrefix:\s*"\/link"/);
});
