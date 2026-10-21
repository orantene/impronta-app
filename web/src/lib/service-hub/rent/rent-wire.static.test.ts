import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, test } from "node:test";
import { fileURLToPath } from "node:url";

const dir = dirname(fileURLToPath(import.meta.url));
const sources = readdirSync(dir)
  .filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"))
  .map((f) => ({ f, text: readFileSync(join(dir, f), "utf8") }));
const code = (text: string) => text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

describe("rent billing wiring (TUL-1376)", () => {
  test("the manual rent path never talks to Stripe directly and never computes or sets a fee", () => {
    // TUL-1601: only the autopay files (subscription on the platform account, flag + TEST gated) touch Stripe and the fee.
    for (const { f, text } of sources.filter((s) => !s.f.startsWith("rent-autopay"))) {
      const c = code(text);
      assert.doesNotMatch(c, /from "stripe"|getStripe|application_fee|service_fee|commission|feeBps|fee_bps/i, `${f} must not touch Stripe or fees`);
    }
  });

  test("the only way to a payment link is issueRentInvoice, behind the test-mode gate", () => {
    const issue = code(sources.find((s) => s.f === "rent-issue.ts")!.text);
    assert.match(issue, /\(deps\.gate \?\? rentBillingGate\)\(\)/);
    assert.ok(issue.indexOf("rentBillingGate") < issue.indexOf("deps.loadPlan"), "the gate runs before any read");
    const store = code(sources.find((s) => s.f === "rent-store.server.ts")!.text);
    const callers = sources.filter((s) => /\bmintLink\b|createPaymentLink/.test(code(s.text))).map((s) => s.f).sort();
    // TUL-1717: the missed-percentage catch-up is the only other door, behind the SAME gate and reusing the store's link minting.
    assert.deepEqual(callers, ["rent-issue.ts", "rent-percent-catchup.server.ts", "rent-percent-catchup.ts", "rent-store.server.ts"]);
    assert.match(store, /createPaymentLink\(admin/);
    const catchup = code(sources.find((s) => s.f === "rent-percent-catchup.ts")!.text);
    assert.match(catchup, /\(deps\.gate \?\? rentBillingGate\)\(\)/);
    assert.ok(catchup.indexOf("rentBillingGate") < catchup.indexOf("deps.loadPlan"), "the catch-up gate runs before any read");
    const catchupServer = code(sources.find((s) => s.f === "rent-percent-catchup.server.ts")!.text);
    assert.doesNotMatch(catchupServer, /createPaymentLink\(/, "the catch-up reuses the store's mintLink; it never mints a link itself");
  });

  test("only the member can make a plan active; the owner cannot activate a proposal", () => {
    const actions = code(sources.find((s) => s.f === "rent-actions.ts")!.text);
    assert.match(actions, /input\.status === "active" && from === "paused" && row\.accepted_at != null/);
    const activeWriters = actions.match(/status: "active"/g) ?? [];
    assert.equal(activeWriters.length, 1, "exactly one place writes status active: the member's accept");
    assert.match(actions, /requireTalentSelf\(\)/);
  });

  test("the safety view selects no client contact column", () => {
    const loader = code(sources.find((s) => s.f === "rent-safety-view.server.ts")!.text);
    assert.doesNotMatch(loader, /email|phone|contact|whatsapp/i);
  });

  test("the safety view reads only this workspace's bookings, tenant-scoped", () => {
    const loader = code(sources.find((s) => s.f === "rent-safety-view.server.ts")!.text);
    assert.match(loader, /tenantScopedQuery\(admin, "talent_bookings", tenantId\)/);
    assert.doesNotMatch(loader, /\.from\("talent_bookings"\)/);
  });

  test("owner-only is enforced in the settings read itself and in every owner action", () => {
    const page = readFileSync(join(dir, "../../../app/(workspace)/[tenantSlug]/admin/settings/rent/page.tsx"), "utf8");
    assert.match(page, /await ownerGuard\(\)/);
    assert.ok(page.indexOf("ownerGuard()") < page.indexOf("createServiceRoleClient()"), "guard runs before any data read");
    const actions = code(sources.find((s) => s.f === "rent-actions.ts")!.text);
    assert.equal((actions.match(/await ownerGuard\(\)/g) ?? []).length, 2, "propose and set-status are owner-only");
  });

  test("the member's consent records the terms; ending is the member's too", () => {
    const actions = code(sources.find((s) => s.f === "rent-actions.ts")!.text);
    assert.match(actions, /accepted_terms_version: row\.terms_version/);
    assert.match(actions, /accepted_amount_cents: row\.monthly_rent_cents/);
    assert.match(actions, /accepted_currency: row\.currency/);
    assert.match(actions, /export async function memberEndRentPlan/);
  });

  test("an invoice never gets a second order: saveOrder updates only an empty order_id and reports the row count", () => {
    const store = code(sources.find((s) => s.f === "rent-store.server.ts")!.text);
    assert.match(store, /\.is\("order_id", null\)\s*\.select\("id"\)/);
    assert.match(store, /data\.length === 1/);
  });

  test("TUL-1601: autopay is gated, consent-collecting, and the webhook handles it before the plan routing", () => {
    const actions = code(sources.find((s) => s.f === "rent-autopay-actions.ts")!.text);
    assert.match(actions, /rentAutopayFlagOn\(\)/);
    assert.ok(actions.indexOf("rentAutopayFlagOn()") < actions.indexOf("createServiceRoleClient()"), "flag before any read");
    assert.match(actions, /rentAutopayGate\(process\.env, platform\)/);
    assert.match(actions, /recurringConsentParams\(/);
    assert.match(actions, /idempotencyKey: `rent_sub_/);
    const handler = readFileSync(join(dir, "../../stripe/webhook-handler.ts"), "utf8");
    assert.ok(handler.indexOf("const rent = classifyRentSubscriptionEvent(event)") < handler.indexOf("const action = classifyStripeEvent(event)"));
    const routing = readFileSync(join(dir, "../../stripe/webhook-routing.ts"), "utf8");
    assert.doesNotMatch(routing, /rent-autopay/, "the plan routing stays a pure leaf module");
  });
  test("TUL-1601: ending or pausing the plan moves the subscription with it", () => {
    const actions = code(sources.find((s) => s.f === "rent-actions.ts")!.text);
    assert.equal((actions.match(/syncRentAutopayWithPlan\(/g) ?? []).length, 2);
  });
});
