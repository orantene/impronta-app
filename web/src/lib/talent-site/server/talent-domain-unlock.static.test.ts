import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(process.cwd(), "src");

test("custom domain row opens tier-compare when locked and domain drawer when unlocked", () => {
  const src = readFileSync(
    join(ROOT, "components/talent/site/CustomDomainRow.tsx"),
    "utf8",
  );
  assert.match(src, /openDrawer\("talent-tier-compare"\)/);
  assert.match(src, /openDrawer\("talent-custom-domain"\)/);
  assert.match(src, /bridgeTalentPlanTrial/);
  assert.match(src, /personalSiteCustomDomain|canManage/);
});

test("DomainSetupDrawer: one primary per state, talent currency, no developer price copy", () => {
  const src = readFileSync(
    join(ROOT, "components/talent/site/DomainSetupDrawer.tsx"),
    "utf8",
  );
  assert.match(src, /Search/);
  assert.match(src, /Buy/);
  assert.match(src, /Connect mine/);
  assert.match(src, /searchTalentDomainAction/);
  assert.match(src, /startTalentDomainPurchaseCheckoutAction/);
  assert.match(src, /requestTalentDomainHelpAction/);
  assert.match(src, /TalentSiteDomainPanel/);
  assert.match(src, /buildDomainPriceDisplay/);
  assert.match(src, /loadTalentDomainPriceDisplayAction/);
  assert.match(src, /Charged in USD/);
  assert.match(src, /InfoTip/);
  // No developer-facing registrar branding in the drawer UI.
  assert.doesNotMatch(src, /Vercel Registrar|Vercel price/);
  assert.doesNotMatch(src, /E\.164|ISO code/);
  // Missing registrar token → Coming soon on Buy; Connect stays live.
  assert.match(src, /isTalentDomainSearchConfiguredAction/);
  assert.match(src, /Coming soon/);
});

test("TalentSiteDomainPanel: DNS copy-paste cards with live status", () => {
  const src = readFileSync(
    join(ROOT, "components/talent/site/TalentSiteDomainPanel.tsx"),
    "utf8",
  );
  assert.match(src, /DnsCopyCard/);
  assert.match(src, /navigator\.clipboard/);
  assert.match(src, /DNS steps/);
  assert.match(src, /I added the records · Verify/);
  assert.match(src, /Check connection/);
  assert.match(src, /Connect mine/);
  assert.match(src, /InfoTip/);
  assert.doesNotMatch(src, /Point the domain at Vercel/);
  assert.doesNotMatch(src, /Check routing/);
});

test("domain purchase actions expose registrar search + price display context", () => {
  const src = readFileSync(
    join(ROOT, "lib/talent-site/server/talent-domain-purchase-actions.ts"),
    "utf8",
  );
  assert.match(src, /export async function isTalentDomainSearchConfiguredAction/);
  assert.match(src, /export async function loadTalentDomainPriceDisplayAction/);
  assert.match(src, /readVercelRegistrarConfig/);
  assert.match(src, /loadUsdRates/);
  assert.match(src, /resolveDefaultCurrencyForUI/);
});

test("domain checkout charges exact registrar quote cents (no markup)", () => {
  const billing = readFileSync(join(ROOT, "lib/stripe/talent-domain-billing.ts"), "utf8");
  const actions = readFileSync(
    join(ROOT, "lib/talent-site/server/talent-domain-purchase-actions.ts"),
    "utf8",
  );
  assert.match(billing, /unit_amount: opts\.expectedPriceCents/);
  assert.match(billing, /Pass-through only/);
  // Promo codes / adaptive pricing would diverge from Registrar quote.
  assert.doesNotMatch(billing, /allow_promotion_codes:\s*true/);
  assert.doesNotMatch(billing, /adaptive_pricing/);
  assert.match(billing, /validateTalentDomainContact/);
  assert.match(billing, /refunds\.create|refundDomainPaymentIntent/);
  // No product markup / wallet layer in code (doc comment may say "no prepaid…").
  assert.doesNotMatch(billing, /markupPercent|priceMarkup|domainWallet|prepaidBalance/);
  // Re-quote before Checkout so the client cannot underpay or invent a price.
  assert.match(actions, /liveCents !== input\.expectedPriceCents/);
  assert.match(actions, /searchDomainQuote/);
  assert.match(actions, /validateTalentDomainContact/);
  assert.match(actions, /Public site & domains/);
  assert.match(actions, /acquisition:\s*"assisted"/);
});

test("TalentMaxSiteManager mounts CustomDomainRow on My website", () => {
  const src = readFileSync(
    join(ROOT, "components/talent/site/TalentMaxSiteManager.tsx"),
    "utf8",
  );
  assert.match(src, /CustomDomainRow/);
  assert.match(src, /capabilities\.personalSiteCustomDomain/);
  // Domain tile (Wave 3) uses the same entitlement gate as CustomDomainRow.
  assert.match(src, /handleOpenDomain/);
  assert.match(src, /talent-tier-compare/);
});

test("purchase actions re-check Web Office + block trial", () => {
  const src = readFileSync(
    join(ROOT, "lib/talent-site/server/talent-domain-purchase-actions.ts"),
    "utf8",
  );
  assert.match(src, /assertTalentCanConnectCustomDomain/);
  assert.match(src, /status === "trialing"/);
  assert.match(src, /createTalentDomainPurchaseCheckoutSession/);
  assert.match(src, /createSupportTicketAction/);
  // Buy must not happen in the action surface (webhook only).
  assert.doesNotMatch(src, /\bbuyDomain\b/);
});

test("connect action stamps acquisition connected", () => {
  const src = readFileSync(
    join(ROOT, "lib/talent-site/server/talent-site-domain-actions.ts"),
    "utf8",
  );
  assert.match(src, /acquisition:\s*"connected"/);
  assert.match(src, /status === "trialing"/);
});

test("webhook fulfill buys only after payment and is idempotent on session id", () => {
  const src = readFileSync(join(ROOT, "lib/stripe/talent-domain-billing.ts"), "utf8");
  assert.match(src, /checkout_type: TALENT_DOMAIN_CHECKOUT_TYPE/);
  assert.match(src, /mode: "payment"/);
  assert.match(src, /buyDomain\(/);
  assert.match(src, /ensureCustomDomainOnVercelProject/);
  assert.match(src, /stripe_checkout_session_id/);
  assert.match(src, /acquisition: "purchased"/);
});
