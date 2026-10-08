/**
 * Wiring pins for TUL-274: the pure rules are only useful if every layer calls
 * them. A capability wired at 3 of 4 layers is this repo's most-repeated defect.
 * Run: NODE_OPTIONS='--require ./scripts/register-server-only-test.cjs' node_modules/.bin/tsx --test src/lib/inquiry/offer-currency-wiring.static.test.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { WEB_ROOT } from "../quality/supabase-unchecked-read";

const read = (rel: string) => readFileSync(join(WEB_ROOT, rel), "utf8");

describe("offer currency wiring", () => {
  it("createOffer inserts the seller-resolved currency, not a hard-coded USD", () => {
    const src = read("src/lib/inquiry/inquiry-engine-offers.ts");
    assert.match(src, /resolveNewOfferCurrency\(supabase/);
    assert.match(src, /currency_code: offerCurrency,/);
    assert.doesNotMatch(src, /currency_code: ctx\.currencyCode \?\? "USD"/);
  });
  it("sendOffer runs the seller currency guard before engine_send_offer", () => {
    const src = read("src/lib/inquiry/inquiry-engine-offers.ts");
    const guard = src.indexOf("checkInquiryCurrencyMatchesSeller(supabase");
    assert.ok(guard > 0, "guard call present");
    assert.ok(guard < src.indexOf('supabase.rpc("engine_send_offer"'), "guard runs before the send RPC");
  });
  it("the two offer creators without an explicit currency follow the seller", () => {
    assert.match(read("src/lib/server-actions/messaging-offers.ts"), /followSeller: parsed\.data\.currencyCode === undefined/);
    assert.match(read("src/app/(workspace)/[tenantSlug]/admin/_pipeline-actions.ts"), /followSeller: currencyCode == null/);
  });
  it("both charge creators from an offer run the guard before touching Stripe", () => {
    const src = read("src/lib/server-actions/client-pipeline.ts");
    const calls = src.split("checkInquiryCurrencyMatchesSeller(").length - 1;
    assert.equal(calls, 2);
    assert.ok(src.indexOf("checkInquiryCurrencyMatchesSeller(") < src.indexOf("createCheckoutSessionForTransaction({"));
  });
  it("charge entry points fail CLOSED: charge mode, service client only, no session-client fallback", () => {
    const src = read("src/lib/server-actions/client-pipeline.ts");
    assert.equal(src.split('mode: "charge"').length - 1, 2);
    assert.equal(src.split("checkInquiryCurrencyMatchesSeller(createServiceRoleClient(),").length - 1, 2);
    assert.doesNotMatch(src, /createServiceRoleClient\(\) \?\? ctx\.supabase/);
    assert.match(read("src/lib/inquiry/inquiry-engine-offers.ts"), /mode: "send"/);
  });
  it("request-payment adapter guards inquiry charges before Stripe, fail closed", () => {
    const src = read("src/lib/payments/stripe-collection.ts");
    const guard = src.indexOf('mode: "charge"');
    assert.ok(guard > 0, "guard present");
    assert.ok(guard < src.indexOf("createStripeTerminalPaymentRequest(input)"), "guard before terminal");
    assert.ok(guard < src.indexOf("createCheckoutSessionForTransaction("), "guard before checkout");
    assert.match(src, /if \(input\.inquiryId\)/);
  });
  it("the editor and the client card show the currency code", () => {
    assert.match(read("src/components/admin/offer/offer-money-split.tsx"), /formatOfferMoney\(total, currencyCode/);
    assert.match(read("src/components/admin/offer/offer-money-split.tsx"), /formatOfferMoney\(n, currencyCode\)/);
    assert.match(read("src/app/(workspace)/[tenantSlug]/client/messages/OfferTab.tsx"), /return formatOfferMoney\(amount, currency/);
  });
  it("TUL-382: offer panel totals route through formatDashboardMoney (not bare Intl currency)", () => {
    const bridge = read("src/app/(workspace)/[tenantSlug]/_data-bridge/inquiries-messages.ts");
    assert.match(bridge, /formatDashboardMoneyCents\(/);
    assert.match(bridge, /from "@\/lib\/money\/dashboard-money-format"/);
    // Strip comments so a doc mention of the old Intl form cannot false-pass.
    const code = bridge.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
    assert.doesNotMatch(code, /NumberFormat\(/);
    assert.doesNotMatch(code, /style\s*:\s*["']currency["']/);
    const coord = read("src/app/(workspace)/[tenantSlug]/talent/inbox/[id]/coordinator-offer-loader.ts");
    assert.match(coord, /formatMoneyCents\(/);
    assert.match(coord, /from "@\/lib\/talent\/earnings-view"/);
  });
  it("the service preload goes through planServicePick", () => {
    assert.match(read("src/components/admin/shell/internal/messages/shared/machinery-11.tsx"), /planServicePick\(/);
  });
  it("the scheduling amendment send maps the currency refusal to its own sentence (TUL-282)", () => {
    const eng = read("src/lib/server-actions/scheduling-engine.ts");
    assert.match(eng, /result\.error === "offer_currency_seller_mismatch"/);
    assert.match(eng, /reason: "offer_currency_seller_mismatch" as const/);
    const refusals = read("src/lib/scheduling/engine-refusals.ts");
    assert.match(refusals, /"offer_currency_seller_mismatch",\n\] as const/);
    assert.match(refusals, /dashboard\.scheduling\.engine\.refusal\.offer_currency_seller_mismatch/);
  });
});
