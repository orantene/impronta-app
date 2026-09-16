import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * D-145: a Messages payment request minted the link and wrote
 * payment_links.inquiry_id, but the pay page derived "Back to the
 * conversation" from orders.inquiry_id, which that flow left null. Both ends
 * are held here: the request names the conversation on the order, and the
 * pay page falls back to the link's own conversation.
 */
test("the payment request writes orders.inquiry_id for an order that has none", () => {
  const src = readFileSync(join(process.cwd(), "src/lib/server-actions/messaging-engine.ts"), "utf8");
  const fn = src.slice(src.indexOf("export async function messagingRequestPayment"));
  const body = fn.slice(0, fn.indexOf("\nexport async function", 10));
  assert.match(body, /\.select\("id, version, status, total_cents, inquiry_id"\)/);
  assert.match(body, /\.update\(\{ inquiry_id: parsed\.data\.inquiryId \}\)\s*\.eq\("id", parsed\.data\.orderId\)\s*\.is\("inquiry_id", null\)/);
});

test("the pay page leads back to the link's conversation when the order names none", () => {
  const src = readFileSync(join(process.cwd(), "src/app/(public)/pay/[code]/page.tsx"), "utf8");
  assert.match(src, /orderRow\?\.inquiry_id \?\? loaded\.inquiryId/);
});
