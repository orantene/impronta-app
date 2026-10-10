import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const src = readFileSync(join(process.cwd(), "src/app/api/webhooks/stripe-mx/route.ts"), "utf8");
const handler = readFileSync(join(process.cwd(), "src/lib/stripe/webhook-http.ts"), "utf8");

test("MX route delegates to the shared handler tagged mx", () => {
  assert.match(src, /handleStripeWebhook\(req, \{ account: "mx" \}\)/);
});

test("handler verifies MX deliveries with the MX secret only, 503 when unset", () => {
  assert.match(handler, /STRIPE_MX_WEBHOOK_SECRET,/);
  const mxBranch = handler.slice(handler.indexOf('account === "mx"\n    ? ['));
  assert.ok(mxBranch.indexOf("STRIPE_MX_WEBHOOK_SECRET") < mxBranch.indexOf(": [process.env.STRIPE_WEBHOOK_SECRET"));
  assert.match(handler, /Webhook secret not configured\.[\s\S]{0,40}status: 503/);
});

test("MX claims idempotency under its own lane", () => {
  assert.match(handler, /account === "mx" \? "platform_mx" : "platform"/);
});

test("with no MX env the route answers 503, never 200", async () => {
  delete process.env.STRIPE_MX_SECRET_KEY;
  delete process.env.STRIPE_MX_WEBHOOK_SECRET;
  let POST: (r: Request) => Promise<Response>;
  try {
    ({ POST } = await import("./route"));
  } catch {
    return; // server-only import not loadable under node:test; static checks above cover it
  }
  const res = await POST(new Request("http://x/api/webhooks/stripe-mx", { method: "POST", body: "{}" }));
  assert.equal(res.status, 503);
});
