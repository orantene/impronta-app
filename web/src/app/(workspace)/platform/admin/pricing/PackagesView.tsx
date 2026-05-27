"use client";

/**
 * PackagesView — 3 family sections (Workspace / Talent / Client) with
 * a grid of TierCard buttons each. Clicking a card opens the drawer
 * (handled in the parent).
 */

import type {
  PricingCatalog,
  PricingPackageRow,
  PricingTierRow,
} from "@/lib/pricing/pricing-types";
import {
  pickHeadlinePrice,
  formatUnitAmount,
  intervalSuffix,
} from "@/lib/pricing/pricing-types";
import { HQ, F, FD, FAMILY_COLORS } from "./_tokens";
import { Pill } from "./_primitives";

export function PackagesView({
  catalog,
  onCardClick,
}: {
  catalog: PricingCatalog;
  onCardClick: (tier: PricingTierRow, pkg: PricingPackageRow) => void;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 26 }}>
      {catalog.packages.map((pkg) => (
        <FamilySection
          key={pkg.id}
          pkg={pkg}
          onCardClick={(tier) => onCardClick(tier, pkg)}
        />
      ))}
    </div>
  );
}

function FamilySection({
  pkg,
  onCardClick,
}: {
  pkg: PricingPackageRow;
  onCardClick: (tier: PricingTierRow) => void;
}) {
  const accent = FAMILY_COLORS[pkg.family] ?? HQ.ink;
  return (
    <section>
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          gap: 10,
          marginBottom: 10,
        }}
      >
        <span
          aria-hidden
          style={{
            width: 10,
            height: 10,
            borderRadius: 3,
            background: accent,
            display: "inline-block",
          }}
        />
        <h2
          style={{
            fontFamily: FD,
            fontSize: 16,
            fontWeight: 600,
            color: HQ.ink,
            margin: 0,
            letterSpacing: -0.1,
          }}
        >
          {pkg.label}
        </h2>
        {pkg.description && (
          <span style={{ fontFamily: F, fontSize: 12, color: HQ.inkMuted }}>
            {pkg.description}
          </span>
        )}
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(248px, 1fr))",
          gap: 12,
        }}
      >
        {pkg.tiers.map((tier) => (
          <TierCard
            key={tier.id}
            tier={tier}
            family={pkg.family}
            onClick={() => onCardClick(tier)}
          />
        ))}
      </div>
    </section>
  );
}

function TierCard({
  tier,
  family,
  onClick,
}: {
  tier: PricingTierRow;
  family: string;
  onClick: () => void;
}) {
  const headline = pickHeadlinePrice(tier.prices);
  const accent = FAMILY_COLORS[family] ?? HQ.ink;
  const stripeOk = tier.stripeProductId !== null;
  const otherPriceCount = headline
    ? tier.prices.filter(
        (p) => p.isActive && !p.archivedAt && p.id !== headline.id,
      ).length
    : 0;

  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        background: tier.isFeatured ? HQ.cardElevated : HQ.card,
        border: `1px solid ${tier.isFeatured ? accent : HQ.borderSoft}`,
        borderRadius: 12,
        padding: 16,
        textAlign: "left",
        cursor: "pointer",
        display: "flex",
        flexDirection: "column",
        gap: 10,
        minHeight: 168,
        color: HQ.ink,
        fontFamily: F,
        transition: "border-color 120ms",
        boxShadow: tier.isFeatured ? `0 0 0 1px ${accent}33 inset` : "none",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = accent;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = tier.isFeatured
          ? accent
          : HQ.borderSoft;
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span
          style={{
            fontFamily: FD,
            fontSize: 15,
            fontWeight: 600,
            color: HQ.ink,
            letterSpacing: -0.1,
          }}
        >
          {tier.name}
        </span>
        {tier.isFeatured && <Pill color={accent}>Featured</Pill>}
        {!tier.isActive && <Pill color={HQ.inkDim}>Hidden</Pill>}
      </div>

      {tier.tagline && (
        <p
          style={{
            margin: 0,
            fontSize: 12,
            color: HQ.inkMuted,
            lineHeight: 1.4,
            flex: 1,
          }}
        >
          {tier.tagline}
        </p>
      )}

      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          gap: 4,
          marginTop: "auto",
        }}
      >
        {headline ? (
          <>
            <span
              style={{
                fontFamily: FD,
                fontSize: 22,
                color: HQ.ink,
                letterSpacing: -0.4,
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {formatUnitAmount(headline.unitAmount, headline.currency)}
            </span>
            <span style={{ fontSize: 12, color: HQ.inkMuted }}>
              {intervalSuffix(headline.interval)}
            </span>
          </>
        ) : (
          <span style={{ fontSize: 13, color: HQ.inkDim, fontStyle: "italic" }}>
            No active price
          </span>
        )}
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          fontSize: 10.5,
          color: HQ.inkDim,
          letterSpacing: 0.3,
        }}
      >
        <span>{tier.features.length} features</span>
        {otherPriceCount > 0 && <span>· {otherPriceCount} more prices</span>}
        <span style={{ flex: 1 }} />
        <span
          style={{
            color: stripeOk ? HQ.inkMuted : HQ.amber,
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
          }}
        >
          <span
            style={{
              width: 6,
              height: 6,
              borderRadius: "50%",
              background: stripeOk ? HQ.green : HQ.amber,
              display: "inline-block",
            }}
            aria-hidden
          />
          {stripeOk ? "Stripe linked" : "No Stripe product"}
        </span>
      </div>
    </button>
  );
}
