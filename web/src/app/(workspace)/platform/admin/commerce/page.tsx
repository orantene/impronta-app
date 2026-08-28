/**
 * /platform/admin/commerce — one page for the whole money surface.
 *
 * Replaces the separate Pricing dashboard and the standalone Stripe-health
 * page; Billing folds in next. super_admin gate inherited from the surrounding
 * /platform/admin/layout.tsx.
 *
 * Shape: the header (title + `?tab=` chips) renders immediately, and ONLY the
 * active tab's data is loaded, inside a Suspense boundary keyed by tab. That
 * split is deliberate — Health makes live Stripe calls with 8s timeouts, and a
 * shared loader would have made the daily price-edit trip pay for them.
 */

import { Suspense } from "react";
import { parseCommerceTab } from "./_registry";
import { CommerceHeader } from "./_header";
import { TabBody } from "./tab-body";
import { HQ, F } from "./_tokens";

export const dynamic = "force-dynamic";

export default async function CommercePage({
  searchParams,
}: {
  // Next 16: `searchParams` is a Promise and must be awaited.
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const tab = parseCommerceTab(params.tab);

  return (
    <>
      <CommerceHeader activeTab={tab} />
      <Suspense key={tab} fallback={<TabLoading />}>
        <TabBody tab={tab} />
      </Suspense>
    </>
  );
}

function TabLoading() {
  return (
    <div
      aria-busy
      style={{
        background: HQ.card,
        border: `1px solid ${HQ.border}`,
        borderRadius: 12,
        padding: 24,
        color: HQ.inkDim,
        fontFamily: F,
        fontSize: 13,
      }}
    >
      &nbsp;
    </div>
  );
}
