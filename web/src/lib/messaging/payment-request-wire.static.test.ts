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
test("the payment request hands the conversation to the mint, which names it on the link and the order", () => {
  const src = readFileSync(join(process.cwd(), "src/lib/server-actions/messaging-engine.ts"), "utf8");
  const fn = src.slice(src.indexOf("export async function messagingRequestPayment"));
  const body = fn.slice(0, fn.indexOf("\nexport async function", 10));
  assert.match(body, /createPaymentLink\(g\.admin, \{[\s\S]*?inquiryId: parsed\.data\.inquiryId,[\s\S]*?\}\)/);
  assert.match(body, /resolveAgendaPayPublicOrigin/);
  // A reused link (same operation key) is attached too (D-150).
  assert.match(body, /reused: true/);
  assert.match(body, /attachPaymentLinkInquiry\(g\.admin, \{[\s\S]*?inquiryId: parsed\.data\.inquiryId,[\s\S]*?\}\)/);
  const links = readFileSync(join(process.cwd(), "src/lib/payments/links.ts"), "utf8");
  const attach = links.slice(links.indexOf("export async function attachPaymentLinkInquiry"), links.indexOf("export async function loadPaymentLinkByCode"));
  assert.match(attach, /\.from\("orders"\)\s*\.update\(\{ inquiry_id: input\.inquiryId \}\)[\s\S]*?\.is\("inquiry_id", null\)/);
});

test("the pay page leads back to the link's conversation when the order names none", () => {
  const src = readFileSync(join(process.cwd(), "src/app/(public)/pay/[code]/page.tsx"), "utf8");
  assert.match(src, /orderRow\?\.inquiry_id \?\? loaded\.inquiryId/);
  // The expired view hands the conversation over too (D-150).
  const expired = src.slice(src.indexOf('loaded.reason === "expired"'), src.indexOf("if (!loaded.ok) notFound();"));
  assert.match(expired, /threadHref=\{expiredHref\}/);
  assert.doesNotMatch(expired, /threadHref=\{null\}/);
  // ...and the view renders what it is handed: the expired branch itself
  // carries the link (the page computed it and the view dropped it).
  const view = readFileSync(join(process.cwd(), "src/app/(public)/pay/[code]/CheckoutView.tsx"), "utf8");
  const expiredView = view.slice(view.indexOf('phase === "expired"'), view.indexOf('phase === "cancelled"'));
  assert.match(expiredView, /props\.threadHref/);
  assert.match(expiredView, /public\.thread\.backToThread/);
});

test("Stripe confirm=stripe builds absolute success_url from request host when BASE_URL unset (D-MSG-329)", () => {
  const src = readFileSync(join(process.cwd(), "src/app/(public)/pay/[code]/page.tsx"), "utf8");
  assert.match(src, /async function checkoutOrigin/);
  assert.match(src, /x-forwarded-host/);
  assert.match(src, /const origin = await checkoutOrigin\(\)/);
  assert.doesNotMatch(
    src,
    /const origin = process\.env\.NEXT_PUBLIC_BASE_URL\?\.replace\(\\\/\\\\\$\/, ""\) \|\| ""/,
  );
});
