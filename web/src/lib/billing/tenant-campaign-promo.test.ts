import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

/**
 * The regression this pins is a PROMISE, not a calculation.
 *
 * `/get-started?promo=CODE` told the visitor "Promo applied" and wrote the code
 * to the lead row. The only reader was the checkout that signup opens for a
 * PAID tier — and the funnel is free-first, so the ordinary path created a free
 * workspace, opened no checkout, and orphaned the code. Two months free was
 * promised on screen and delivered to nobody.
 *
 * Both halves are asserted here because either one alone re-breaks it: the
 * upgrade must FALL BACK to the recorded campaign, and the free page must not
 * claim a discount it has not applied.
 */

const SRC = resolve(process.cwd(), "src");

test("an upgrade with no ?promo= falls back to the recorded campaign", () => {
  const action = readFileSync(
    join(SRC, "app/(workspace)/[tenantSlug]/admin/account/stripe-billing-actions.ts"),
    "utf8",
  );
  assert.match(
    action,
    /loadTenantCampaignPromo\(scope\.tenantId\)/,
    "the upgrade must look up the campaign recorded when the workspace was created",
  );
  assert.match(
    action,
    /promoCode \?\? \(await loadTenantCampaignPromo/,
    "an explicit ?promo= must still win over the recorded one",
  );
});

test("the recorded promo is resolved, never trusted", () => {
  const lib = readFileSync(join(SRC, "lib/billing/tenant-campaign-promo.ts"), "utf8");
  // It returns a code and stops. Validation belongs to resolveCheckoutDiscount,
  // so an ended or filled-up campaign stops applying on its own.
  assert.equal(
    /is_active|max_redemptions|redemption_count/.test(lib),
    false,
    "this loader must not re-implement validation; the checkout resolver owns it",
  );
  assert.match(
    lib,
    /order\("created_at", \{ ascending: true \}\)/,
    "oldest lead wins — the first campaign is the promise that was made",
  );
});

test("the free signup page does not claim an applied discount", () => {
  const page = readFileSync(join(SRC, "app/(marketing)/get-started/page.tsx"), "utf8");
  assert.equal(
    /promoApplied: "Promo applied:"/.test(page),
    false,
    'the free path opens no checkout, so "Promo applied" was untrue',
  );
  assert.match(page, /promoHeldHint/, "the page must explain when the code applies");

  const form = readFileSync(join(SRC, "components/marketing/get-started-form.tsx"), "utf8");
  assert.match(
    form,
    /appliedDiscountLabel && tier &&/,
    "the fine-print promo must render only on a PAID selection",
  );
});
