"use client";

/**
 * CatalogView — the Catalog tab of /platform/admin/commerce.
 *
 * This is the former `PricingDashboard` with its top-level tab strip removed:
 * the Commerce page owns tab selection now (server-rendered `?tab=` chips), so
 * the client shell is left with exactly one job — which tier drawer is open.
 *
 * Layout: PageHeader (Stripe account chip + FX strip) → PackagesView grid →
 * Trials as a collapsed <details> section.
 *
 * No fetching happens here — the catalog + Stripe account + FX preview arrive
 * as serialized props from the server tab body. Save actions are server actions
 * that revalidate on success; we re-derive the open tier from the fresh catalog
 * every render so the drawer shows updated data without manual cache work.
 */

import type {
  PricingCatalog,
  PricingTierRow,
  PricingPackageRow,
  StripeAccountInfo,
  FxPreview,
} from "@/lib/pricing/pricing-types";
import type { TrialOffer } from "@/lib/plan-trials/offers";
import { useUrlDrawer } from "@/components/admin/drawer/use-url-drawer";
import { PageHeader } from "./PageHeader";
import { PackagesView } from "./PackagesView";
import { TierDrawer } from "./TierDrawer";
import { TrialsSection } from "./TrialsSection";

export function CatalogView({
  catalog,
  stripeAccount,
  fx,
  trialOffers,
}: {
  catalog: PricingCatalog;
  stripeAccount: StripeAccountInfo;
  fx: FxPreview;
  trialOffers: TrialOffer[];
}) {
  // Drawer state lives in the URL (`?d=<tierId>`): deep links restore the open
  // tier, browser back closes it, and switching Commerce tabs drops `?d=`
  // for free because the tab chips are plain links that omit it.
  const [openTierId, setOpenTierId] = useUrlDrawer<string>();

  // Re-derive the open tier from the *fresh* catalog on every render.
  // After a server-action save, `revalidatePath` brings down updated
  // data and this picks it up automatically. Inlining (no useMemo) lets
  // React Compiler memoize correctly — `useMemo` was rejected by the
  // `react-hooks/preserve-manual-memoization` rule because the compiler
  // couldn't preserve the dependency relationship.
  let openTier: { tier: PricingTierRow; pkg: PricingPackageRow } | null = null;
  if (openTierId) {
    for (const pkg of catalog.packages) {
      for (const t of pkg.tiers) {
        if (t.id === openTierId) {
          openTier = { tier: t, pkg };
          break;
        }
      }
      if (openTier) break;
    }
  }

  const stripeConfigured = stripeAccount.ok;
  const testMode = stripeAccount.ok ? stripeAccount.testMode : true;

  return (
    <>
      <PageHeader stripeAccount={stripeAccount} fx={fx} />

      <PackagesView
        catalog={catalog}
        onCardClick={(tier) => setOpenTierId(tier.id)}
      />

      <TrialsSection offers={trialOffers} />

      {openTier && (
        <TierDrawer
          tier={openTier.tier}
          pkg={openTier.pkg}
          stripeConfigured={stripeConfigured}
          testMode={testMode}
          onClose={() => setOpenTierId(null)}
        />
      )}
    </>
  );
}
