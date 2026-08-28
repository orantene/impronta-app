"use client";

import * as React from "react";

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
  initialDrawerId = null,
}: {
  catalog: PricingCatalog;
  stripeAccount: StripeAccountInfo;
  fx: FxPreview;
  trialOffers: TrialOffer[];
  /** `?d=` as the SERVER saw it. See the drawer-state comment below. */
  initialDrawerId?: string | null;
}) {
  // Drawer state lives in the URL (`?d=<tierId>`): deep links restore the open
  // tier, browser back closes it, and switching Commerce tabs drops `?d=`
  // for free because the tab chips are plain links that omit it.
  const [urlTierId, setOpenTierId] = useUrlDrawer<string>();

  // `useUrlDrawer` reads `?d=` through useSearchParams, which is only populated
  // once the client has hydrated. That is invisible when you CLICK a card, but
  // on a cold load of a shared link the drawer stayed shut while the id sat
  // right there in the address bar -- deep links were a one-way street.
  //
  // So the server's reading of `?d=` seeds the first render, and the hook takes
  // over from the moment the user interacts. `closed` is what makes closing
  // stick: without it the seed would immediately reopen the drawer the user
  // just dismissed, since the prop cannot change without a fresh navigation.
  const [closed, setClosed] = React.useState(false);
  const openTierId = urlTierId ?? (closed ? null : initialDrawerId);

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
        onCardClick={(tier) => {
          setClosed(false);
          setOpenTierId(tier.id);
        }}
      />

      <TrialsSection offers={trialOffers} />

      {openTier && (
        <TierDrawer
          tier={openTier.tier}
          pkg={openTier.pkg}
          stripeConfigured={stripeConfigured}
          testMode={testMode}
          onClose={() => {
            setClosed(true);
            setOpenTierId(null);
          }}
        />
      )}
    </>
  );
}
