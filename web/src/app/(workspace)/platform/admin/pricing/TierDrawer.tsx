"use client";

/**
 * TierDrawer — right-side panel that opens when a TierCard is clicked.
 * 4 tabs: Pricing (editable) · Features (read-only) · Display (editable)
 * · Stripe (read-only IDs + deep-links).
 *
 * Backdrop click closes. Drawer is `position: fixed` overlaying the
 * page; the parent renders it inside a portal-like full-viewport div.
 */

import { useState } from "react";
import type {
  PricingTierRow,
  PricingPackageRow,
} from "@/lib/pricing/pricing-types";
import { useT } from "@/i18n/use-t";
import { interpolate } from "@/i18n/interpolate";
import { HQ, F, FD, FAMILY_COLORS } from "./_tokens";
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
    <div
      role="dialog"
      aria-label={interpolate(
        t("dashboard.platform.pricing.drawer.settingsLabel"),
        { tier: tier.name },
      )}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.55)",
        zIndex: 100,
        display: "flex",
        justifyContent: "flex-end",
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={{
          width: "min(560px, 100vw)",
          background: HQ.bg,
          borderLeft: `1px solid ${HQ.border}`,
          display: "flex",
          flexDirection: "column",
          fontFamily: F,
        }}
      >
        {/* Drawer header */}
        <div
          style={{
            padding: "18px 22px",
            borderBottom: `1px solid ${HQ.borderSoft}`,
            display: "flex",
            alignItems: "center",
            gap: 12,
          }}
        >
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: 2,
              background: accent,
              display: "inline-block",
            }}
            aria-hidden
          />
          <div style={{ flex: 1 }}>
            <div
              style={{
                fontSize: 10.5,
                color: HQ.inkMuted,
                letterSpacing: 1,
                textTransform: "uppercase",
                fontWeight: 600,
              }}
            >
              {pkg.label}
            </div>
            <div
              style={{
                fontFamily: FD,
                fontSize: 18,
                fontWeight: 600,
                color: HQ.ink,
                letterSpacing: -0.2,
              }}
            >
              {tier.name}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("dashboard.platform.pricing.drawer.closeLabel")}
            style={{
              background: "transparent",
              border: `1px solid ${HQ.borderHover}`,
              color: HQ.inkMuted,
              width: 32,
              height: 32,
              borderRadius: 8,
              cursor: "pointer",
              fontSize: 14,
            }}
          >
            ×
          </button>
        </div>

        {/* Drawer tabs */}
        <div
          role="tablist"
          style={{
            display: "flex",
            gap: 0,
            borderBottom: `1px solid ${HQ.borderSoft}`,
            padding: "0 22px",
          }}
        >
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

        {/* Drawer body */}
        <div style={{ flex: 1, overflowY: "auto", padding: 22 }}>
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
      </div>
    </div>
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
