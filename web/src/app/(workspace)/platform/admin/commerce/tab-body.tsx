/**
 * tab-body.tsx — loads and renders exactly one Commerce tab.
 *
 * Async server component behind the page's `<Suspense key={tab}>`. Each branch
 * owns its own `Promise.all`, so a tab never waits on data it does not show —
 * the reason Health's live Stripe pings do not slow down a price edit.
 *
 * As of PR-U2 every tab is real: Revenue and Commission moved across from the
 * Billing page, which is deleted. The Billing nav item is gone and its three
 * old URLs redirect here.
 */

import {
  loadProductCatalog,
  loadProductDiscounts,
} from "@/lib/pricing/get-product-catalog";
import { loadStripeAccountInfo } from "@/lib/pricing/stripe-account-info";
import { loadFxPreview } from "@/lib/pricing/fx-preview";
import { loadStripeHealth } from "@/lib/pricing/stripe-health";
import { loadAllTrialOffers } from "@/lib/plan-trials/offers";
import { loadPlatformBookingRevenue } from "@/lib/billing/platform-revenue";
import { loadPlatformMrr } from "@/lib/billing/platform-mrr";
import { listHeldPayouts } from "@/lib/payments/booking-payouts-ledger";
import {
  loadPlatformPlanDistribution,
  loadPlatformStats,
  loadSubscriptionAttentionCounts,
} from "../../platform-data";
import { getRequestLocale } from "@/i18n/request-locale";
import { createTranslator } from "@/i18n/messages";
import { HQ, F } from "./_tokens";
import type { CommerceTab } from "./_registry";
import { loadAccountDiscounts } from "@/lib/server-actions/admin-subscription-discounts";
import { CatalogView } from "./catalog/CatalogView";
import { DiscountsView } from "./discounts/DiscountsView";
import type { DiscountTierOption } from "./discounts/discount-format";
import { HealthView } from "./health/HealthView";
import { RevenueView } from "./revenue/RevenueView";
import { CommissionView } from "./commission/CommissionView";
import { loadPlatformCommissionConfig } from "./commission/actions";
import { loadEntitlementMatrix } from "./entitlements/load";
import { EntitlementsView } from "./entitlements/EntitlementsView";

export async function TabBody({
  tab,
  initialDrawerId = null,
}: {
  tab: CommerceTab;
  /** `?d=` from the server, so a cold deep link opens its drawer on first render. */
  initialDrawerId?: string | null;
}) {
  if (tab === "health") {
    const health = await loadStripeHealth();
    return <HealthView health={health} />;
  }

  if (tab === "catalog") {
    const [catalog, stripeAccount, fx, trialOffers] = await Promise.all([
      loadProductCatalog(),
      loadStripeAccountInfo(),
      loadFxPreview(),
      loadAllTrialOffers(),
    ]);
    if (!catalog) return <LoadError />;
    return (
      <CatalogView
        catalog={catalog}
        stripeAccount={stripeAccount}
        fx={fx}
        trialOffers={trialOffers}
        initialDrawerId={initialDrawerId}
      />
    );
  }

  if (tab === "discounts") {
    // The tier list is what makes per-product scoping possible: the create
    // drawer needs every active tier AND whether each has a Stripe product,
    // because a tier without one cannot be scoped at Stripe.
    const [discounts, accounts, catalog] = await Promise.all([
      loadProductDiscounts(),
      loadAccountDiscounts(),
      loadProductCatalog(),
    ]);
    const tiers: DiscountTierOption[] = (catalog?.packages ?? [])
      .filter((pkg) => pkg.isActive)
      .flatMap((pkg) =>
        pkg.tiers
          .filter((tier) => tier.isActive)
          .map((tier) => ({
            id: tier.id,
            name: tier.name,
            packageLabel: pkg.label,
            hasStripeProduct: Boolean(tier.stripeProductId),
          })),
      );
    return (
      <DiscountsView
        discounts={discounts}
        accountDiscounts={accounts.discounts}
        tiers={tiers}
        initialDrawerId={initialDrawerId}
      />
    );
  }

  if (tab === "revenue") {
    // Five reads, all cheap and all independent — the expensive one on this
    // page is the booking-revenue rollup, and it is the reason the tab loads
    // on its own rather than inside a page-wide Promise.all.
    const [planDist, stats, mrr, attention, revenue, heldPayouts] =
      await Promise.all([
        loadPlatformPlanDistribution(),
        loadPlatformStats(),
        loadPlatformMrr(),
        loadSubscriptionAttentionCounts(),
        loadPlatformBookingRevenue(),
        listHeldPayouts(),
      ]);
    return (
      <RevenueView
        planDist={planDist}
        stats={stats}
        mrr={mrr}
        attention={attention}
        revenue={revenue}
        heldPayouts={heldPayouts}
      />
    );
  }

  const commission = await loadPlatformCommissionConfig();
  if (tab === "entitlements") {
    // Read-only. The matrix is small (six rows today) and the read is cheap, so
    // it loads inline rather than through the Suspense-per-tab dance the Stripe
    // health checks need.
    const matrix = await loadEntitlementMatrix();
    return <EntitlementsView matrix={matrix} />;
  }

  return <CommissionView result={commission} />;
}

async function LoadError() {
  const t = createTranslator(await getRequestLocale());
  return (
    <div
      style={{
        background: HQ.card,
        border: `1px solid ${HQ.border}`,
        borderRadius: 12,
        padding: 24,
        color: HQ.inkMuted,
        fontFamily: F,
        fontSize: 13,
        lineHeight: 1.5,
      }}
    >
      {t("dashboard.platform.pricing.loadError")}
    </div>
  );
}
