"use client";

/**
 * TierDrawer — right-side panel that opens when a TierCard is clicked.
 * 4 tabs: Pricing (editable) · Features (read-only) · Display (editable)
 * · Stripe (read-only IDs + deep-links).
 *
 * The chrome (overlay, backdrop, header, close button) used to be hand-rolled
 * here as a `position: fixed` div. It is now the shared `DrawerShell`
 * (Radix Dialog), which brings Esc-to-close, a focus trap, a real portal and
 * the mobile bottom-sheet behaviour that the hand-rolled version never had.
 * Everything below the header — the 4-tab strip and the four tab views — is
 * unchanged; only the shell around it swapped.
 */

import { useState } from "react";
import { Layers } from "lucide-react";
import type {
  PricingTierRow,
  PricingPackageRow,
} from "@/lib/pricing/pricing-types";
import { DrawerShell } from "@/components/admin/drawer/drawer-shell";
import { useT } from "@/i18n/use-t";
import { HQ, F, FAMILY_COLORS } from "../_tokens";
import { PricingTab } from "./drawer/PricingTab";
import { FeaturesTab } from "./drawer/FeaturesTab";
import { DisplayTab } from "./drawer/DisplayTab";
import { StripeTab } from "./drawer/StripeTab";

type TabKey = "pricing" | "features" | "display" | "stripe";

export function TierDrawer({
  tier,
  pkg,
  stripeConfigured,
  testMode,
  onClose,
}: {
  tier: PricingTierRow;
  pkg: PricingPackageRow;
  stripeConfigured: boolean;
  testMode: boolean;
  onClose: () => void;
}) {
  const [activeTab, setActiveTab] = useState<TabKey>("pricing");
  const accent = FAMILY_COLORS[pkg.family] ?? HQ.ink;
  const t = useT();

  return (
    <DrawerShell
      open
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      title={tier.name}
      subtitle={pkg.label}
      icon={Layers}
      size="md"
    >
      <div style={{ fontFamily: F, color: HQ.ink }}>
        {/* Family accent + tab strip */}
        <div
          role="tablist"
          style={{
            display: "flex",
            gap: 0,
            borderBottom: `1px solid ${HQ.borderSoft}`,
            marginBottom: 18,
          }}
        >
          <span
            aria-hidden
            style={{
              width: 8,
              height: 8,
              borderRadius: 2,
              background: accent,
              alignSelf: "center",
              marginRight: 10,
              flexShrink: 0,
            }}
          />
          <DrawerTab
            label={t("dashboard.platform.pricing.drawer.tabPricing")}
            active={activeTab === "pricing"}
            onClick={() => setActiveTab("pricing")}
          />
          <DrawerTab
            label={t("dashboard.platform.pricing.drawer.tabFeatures")}
            active={activeTab === "features"}
            onClick={() => setActiveTab("features")}
            badge={`${tier.features.length}`}
          />
          <DrawerTab
            label={t("dashboard.platform.pricing.drawer.tabDisplay")}
            active={activeTab === "display"}
            onClick={() => setActiveTab("display")}
          />
          <DrawerTab
            label={t("dashboard.platform.pricing.drawer.tabStripe")}
            active={activeTab === "stripe"}
            onClick={() => setActiveTab("stripe")}
          />
        </div>

        {activeTab === "pricing" && (
          <PricingTab tier={tier} stripeConfigured={stripeConfigured} />
        )}
        {activeTab === "features" && <FeaturesTab tier={tier} />}
        {activeTab === "display" && <DisplayTab tier={tier} />}
        {activeTab === "stripe" && (
          <StripeTab
            tier={tier}
            stripeConfigured={stripeConfigured}
            testMode={testMode}
          />
        )}
      </div>
    </DrawerShell>
  );
}

function DrawerTab({
  label,
  active,
  onClick,
  badge,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
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
        padding: "12px 14px",
        fontFamily: F,
        fontSize: 12.5,
        fontWeight: active ? 600 : 400,
        color: active ? HQ.ink : HQ.inkMuted,
        cursor: "pointer",
        borderBottom: active ? `2px solid ${HQ.ink}` : "2px solid transparent",
        marginBottom: -1,
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
      }}
    >
      {label}
      {badge && (
        <span
          style={{
            fontSize: 9.5,
            color: HQ.inkDim,
            background: HQ.cardSoft,
            padding: "1px 5px",
            borderRadius: 4,
          }}
        >
          {badge}
        </span>
      )}
    </button>
  );
}
