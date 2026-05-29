"use client";

/**
 * PricingDashboard — top-level client shell for /platform/admin/pricing.
 *
 * Coordinates two pieces of state across the page:
 *   1. Top-tab selection (Packages | Discounts)
 *   2. Active tier-drawer (open / closed, which tier)
 *
 * The page is split into sibling files to stay under the 800-line
 * max-lines lint cap:
 *   _tokens.ts          – design tokens
 *   _primitives.tsx     – Pill / SectionLabel / Field / Toggle / EmptyHint
 *   PageHeader.tsx      – title + Stripe-account chip + FX strip
 *   PackagesView.tsx    – 3 family sections with TierCards
 *   TierDrawer.tsx      – right-side drawer shell + tab strip
 *   drawer/*.tsx        – the 4 tab views
 *
 * No fetching happens here — the catalog + Stripe account + FX preview
 * arrive as serialized props from the server `page.tsx`. Save actions
 * are server actions that revalidate the page on success; we re-derive
 * the open-tier from the fresh catalog every render so the drawer
 * shows updated data without manual cache invalidation.
 */

import { useState } from "react";
import type {
  PricingCatalog,
  PricingTierRow,
  PricingPackageRow,
  PricingDiscountRow,
  StripeAccountInfo,
  FxPreview,
} from "@/lib/pricing/pricing-types";
import type { TrialOffer } from "@/lib/plan-trials/offers";
import { HQ, F } from "./_tokens";
import { PageHeader } from "./PageHeader";
import { PackagesView } from "./PackagesView";
import { TierDrawer } from "./TierDrawer";
import { DiscountsTab } from "./DiscountsTab";
import { TrialsTab } from "./TrialsTab";

type PricingTab = "packages" | "discounts" | "trials";

export function PricingDashboard({
  catalog,
  stripeAccount,
  fx,
  discounts,
  trialOffers,
}: {
  catalog: PricingCatalog;
  stripeAccount: StripeAccountInfo;
  fx: FxPreview;
  discounts: PricingDiscountRow[];
  trialOffers: TrialOffer[];
}) {
  const [activeTab, setActiveTab] = useState<PricingTab>("packages");
  const [openTierId, setOpenTierId] = useState<string | null>(null);

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

      <TabStrip activeTab={activeTab} onChange={setActiveTab} />

      {activeTab === "packages" && (
        <PackagesView
          catalog={catalog}
          onCardClick={(tier) => setOpenTierId(tier.id)}
        />
      )}
      {activeTab === "discounts" && <DiscountsTab discounts={discounts} />}
      {activeTab === "trials" && <TrialsTab offers={trialOffers} />}

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

// ─── Tab strip (Packages | Discounts) ────────────────────────────────────────

function TabStrip({
  activeTab,
  onChange,
}: {
  activeTab: PricingTab;
  onChange: (t: PricingTab) => void;
}) {
  return (
    <div
      role="tablist"
      style={{
        display: "flex",
        gap: 2,
        borderBottom: `1px solid ${HQ.border}`,
        marginBottom: 20,
      }}
    >
      <TabBtn
        active={activeTab === "packages"}
        onClick={() => onChange("packages")}
        label="Packages"
      />
      <TabBtn
        active={activeTab === "discounts"}
        onClick={() => onChange("discounts")}
        label="Discounts"
      />
      <TabBtn
        active={activeTab === "trials"}
        onClick={() => onChange("trials")}
        label="Trials"
      />
    </div>
  );
}

function TabBtn({
  active,
  onClick,
  label,
  badge,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  badge?: string;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      style={{
        background: "transparent",
        border: "none",
        padding: "10px 14px",
        fontFamily: F,
        fontSize: 13.5,
        fontWeight: active ? 600 : 400,
        color: active ? HQ.ink : HQ.inkMuted,
        cursor: "pointer",
        borderBottom: active ? `2px solid ${HQ.ink}` : "2px solid transparent",
        marginBottom: -1,
        display: "inline-flex",
        alignItems: "center",
        gap: 7,
      }}
    >
      {label}
      {badge && (
        <span
          style={{
            fontSize: 9.5,
            color: HQ.inkDim,
            background: HQ.cardSoft,
            padding: "2px 6px",
            borderRadius: 4,
            letterSpacing: 0.3,
            fontWeight: 500,
            textTransform: "uppercase",
          }}
        >
          {badge}
        </span>
      )}
    </button>
  );
}

// (Phase 1 placeholder removed — DiscountsTab from Phase 3 replaces it.)
