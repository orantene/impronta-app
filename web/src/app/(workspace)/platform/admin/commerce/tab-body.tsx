/**
 * tab-body.tsx — loads and renders exactly one Commerce tab.
 *
 * Async server component behind the page's `<Suspense key={tab}>`. Each branch
 * owns its own `Promise.all`, so a tab never waits on data it does not show —
 * the reason Health's live Stripe pings do not slow down a price edit.
 *
 * Revenue and Commission are placeholders here on purpose: the Billing page
 * still owns those surfaces until the next release moves them across. Shipping
 * the tab strip whole (with two honest "not yet" cards) beats shipping a strip
 * that grows two new chips later and moves everything else sideways.
 */

import {
  loadProductCatalog,
  loadProductDiscounts,
} from "@/lib/pricing/get-product-catalog";
import { loadStripeAccountInfo } from "@/lib/pricing/stripe-account-info";
import { loadFxPreview } from "@/lib/pricing/fx-preview";
import { loadStripeHealth } from "@/lib/pricing/stripe-health";
import { loadAllTrialOffers } from "@/lib/plan-trials/offers";
import { getRequestLocale } from "@/i18n/request-locale";
import { createTranslator } from "@/i18n/messages";
import { HQ, F, FD } from "./_tokens";
import type { CommerceTab } from "./_registry";
import { CatalogView } from "./catalog/CatalogView";
import { DiscountsTab } from "./discounts/DiscountsTab";
import { HealthView } from "./health/HealthView";

export async function TabBody({ tab }: { tab: CommerceTab }) {
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
      />
    );
  }

  if (tab === "discounts") {
    const discounts = await loadProductDiscounts();
    return <DiscountsTab discounts={discounts} />;
  }

  return <ComingSoon />;
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

async function ComingSoon() {
  const t = createTranslator(await getRequestLocale());
  return (
    <div
      style={{
        background: HQ.card,
        border: `1px solid ${HQ.border}`,
        borderRadius: 12,
        padding: "20px 22px",
      }}
    >
      <h2
        style={{
          fontFamily: FD,
          fontSize: 15,
          fontWeight: 600,
          color: HQ.ink,
          margin: 0,
        }}
      >
        {t("dashboard.platform.commerce.comingSoon.title")}
      </h2>
      <p
        style={{
          fontFamily: F,
          fontSize: 12.5,
          lineHeight: 1.6,
          color: HQ.inkMuted,
          margin: "8px 0 0",
        }}
      >
        {t("dashboard.platform.commerce.comingSoon.body")}
      </p>
    </div>
  );
}
