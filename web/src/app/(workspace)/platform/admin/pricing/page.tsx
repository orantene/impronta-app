/**
 * /platform/admin/pricing — Product Pricing dashboard (L50 Phase 1).
 *
 * Centralized control surface for every commercial knob:
 *   - Tier prices across currencies + intervals
 *   - Product names / features / display
 *   - Stripe sync (Prices are immutable → create-new + archive-old)
 *   - FX preview vs USD (Frankfurter / ECB)
 *   - Discount codes (Phase 3 stub)
 *
 * Server component — loads the catalog + Stripe-account info + FX
 * preview in parallel, then hands off to the client `PricingDashboard`
 * for tab state + drawer interactions. super_admin gate inherited from
 * the surrounding /platform/admin/layout.tsx.
 */

import {
  loadProductCatalog,
  loadProductDiscounts,
} from "@/lib/pricing/get-product-catalog";
import { loadStripeAccountInfo } from "@/lib/pricing/stripe-account-info";
import { loadFxPreview } from "@/lib/pricing/fx-preview";
import { PricingDashboard } from "./PricingDashboard";

const HQ = {
  card: "#16161A",
  border: "rgba(255,255,255,0.10)",
  ink: "#F5F2EB",
  inkMuted: "rgba(245,242,235,0.62)",
} as const;

const F  = '"Inter", system-ui, sans-serif';
const FD = 'var(--font-geist-sans), "Inter", -apple-system, system-ui, sans-serif';

export default async function PlatformPricingPage() {
  const [catalog, stripeAccount, fx, discounts] = await Promise.all([
    loadProductCatalog(),
    loadStripeAccountInfo(),
    loadFxPreview(),
    loadProductDiscounts(),
  ]);

  if (!catalog) {
    return (
      <>
        <h1 style={{ fontFamily: FD, color: HQ.ink, fontSize: 24, margin: 0 }}>
          Product Pricing
        </h1>
        <div
          style={{
            marginTop: 24,
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
          Couldn&rsquo;t load the pricing catalog — the service-role client
          isn&rsquo;t available, or the <code>product_*</code> tables haven&rsquo;t
          been migrated yet. Check{" "}
          <code>supabase/migrations/20260527213552_product_pricing_dashboard.sql</code>{" "}
          and the server logs.
        </div>
      </>
    );
  }

  return (
    <PricingDashboard
      catalog={catalog}
      stripeAccount={stripeAccount}
      fx={fx}
      discounts={discounts}
    />
  );
}
