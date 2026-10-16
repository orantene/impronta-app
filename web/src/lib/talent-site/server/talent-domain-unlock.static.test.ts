import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(process.cwd(), "src");

test("custom domain row opens the upgrade modal when locked and domain drawer when unlocked", () => {
  const src = readFileSync(
    join(ROOT, "components/talent/site/CustomDomainRow.tsx"),
    "utf8",
  );
  assert.match(src, /openUpgrade\(\{ feature: "custom-domain"/);
  assert.match(src, /openDrawer\("talent-custom-domain"\)/);
  assert.match(src, /bridgeTalentPlanTrial/);
  assert.match(src, /personalSiteCustomDomain|canManage/);
});

test("DomainSetupDrawer exposes buy, connect, and help paths", () => {
  const src = readFileSync(
    join(ROOT, "components/talent/site/DomainSetupDrawer.tsx"),
    "utf8",
  );
  assert.match(src, /Buy domain/);
  assert.match(src, /Connect existing/);
  assert.match(src, /Get help/);
  assert.match(src, /searchTalentDomainAction/);
  assert.match(src, /startTalentDomainPurchaseCheckoutAction/);
  assert.match(src, /requestTalentDomainHelpAction/);
  assert.match(src, /TalentSiteDomainPanel/);
  assert.match(src, /Vercel Registrar quote|Vercel price/);
  // Missing registrar token → Coming soon on Buy; Connect/Help stay live.
  assert.match(src, /isTalentDomainSearchConfiguredAction/);
  assert.match(src, /Domain search and purchase are coming soon/);
  assert.match(src, /Coming soon/);
});

test("domain purchase actions expose registrar search availability probe", () => {
  const src = readFileSync(
    join(ROOT, "lib/talent-site/server/talent-domain-purchase-actions.ts"),
    "utf8",
  );
  assert.match(src, /export async function isTalentDomainSearchConfiguredAction/);
  assert.match(src, /readVercelRegistrarConfig/);
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

test("D6 plan grace hooks subscription sync and disables registrar auto-renew", () => {
  const billing = readFileSync(join(ROOT, "lib/stripe/talent-billing.ts"), "utf8");
  const grace = readFileSync(
    join(ROOT, "lib/talent-site/server/talent-domain-plan-grace.ts"),
    "utf8",
  );
  const registrar = readFileSync(join(ROOT, "lib/saas/vercel-domains-registrar.ts"), "utf8");
  const cron = readFileSync(join(ROOT, "app/api/cron/talent-domain-grace/route.ts"), "utf8");
  assert.match(billing, /reconcileTalentDomainPlanGrace/);
  assert.match(grace, /TALENT_DOMAIN_PLAN_GRACE_DAYS\s*=\s*30/);
  assert.match(grace, /setDomainAutoRenew/);
  assert.match(grace, /removeCustomDomainFromVercelProject/);
  assert.match(grace, /chooseTalentDomainTransferOut/);
  // D5 owns renewal charging — D6 must not invent Stripe renewal charges.
  assert.doesNotMatch(grace, /createTalentDomainPurchaseCheckoutSession|invoices\.create|renewalCents/);
  assert.match(registrar, /export async function setDomainAutoRenew/);
  assert.match(registrar, /export async function getDomainAuthCode/);
  assert.match(cron, /sweepTalentDomainPlanGrace/);
  assert.match(cron, /CRON_SECRET/);
});

test("D6 migration lives in the migrations root under 20261231411100 (after D1's 411000), not parked", () => {
  const root = join(process.cwd(), "..", "supabase", "migrations");
  const rootSql = readdirSync(root).filter((f) => f.endsWith(".sql"));
  assert.equal(
    rootSql.includes("20261231411100_talent_site_domains_plan_grace.sql"),
    true,
    "D6 mig must be in the migrations root at 411100 so it applies in order after D1",
  );
  assert.equal(
    existsSync(join(root, "_pending_pm", "20261231357100_talent_site_domains_plan_grace.sql")),
    false,
    "the old out-of-order 357100 copy must not exist",
  );
  assert.equal(
    rootSql.includes("20261231357100_talent_site_domains_plan_grace.sql"),
    false,
    "357100 sorts below prod's newest version and must never be applied",
  );
});
