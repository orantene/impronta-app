"use client";

/**
 * Drawer / Stripe tab — read-only Stripe object IDs with deep-links to
 * the Stripe dashboard. Stripe Prices are immutable; edits happen in
 * the Pricing tab and create new IDs (old ones archived, not deleted).
 */

import type { PricingTierRow } from "@/lib/pricing/pricing-types";
import { HQ } from "../_tokens";
import {
  SectionLabel,
  Field,
  EmptyHint,
  codeStyle,
  linkStyle,
} from "../_primitives";

export function StripeTab({
  tier,
  stripeConfigured,
  testMode,
}: {
  tier: PricingTierRow;
  stripeConfigured: boolean;
  testMode: boolean;
}) {
  const dashboardBase = testMode
    ? "https://dashboard.stripe.com/test"
    : "https://dashboard.stripe.com";
  const linkedPrices = tier.prices.filter(
    (p) => p.isActive && !p.archivedAt && p.stripePriceId,
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <SectionLabel
        title="Stripe"
        hint="Read-only. Stripe Prices are immutable — edits in the Pricing tab create new IDs and archive the old ones."
      />
      <Field label="Stripe Product ID">
        {tier.stripeProductId ? (
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <code style={codeStyle()}>{tier.stripeProductId}</code>
            <a
              href={`${dashboardBase}/products/${tier.stripeProductId}`}
              target="_blank"
              rel="noopener noreferrer"
              style={linkStyle()}
            >
              Open in Stripe ↗
            </a>
          </div>
        ) : (
          <span style={{ fontSize: 12, color: HQ.amber }}>
            Not linked — create the product in Stripe to enable sync.
          </span>
        )}
      </Field>

      <SectionLabel title="Active Price IDs" hint="One per (currency × interval)." />
      {linkedPrices.length === 0 ? (
        <EmptyHint
          text={
            stripeConfigured
              ? "No Stripe Prices linked yet."
              : "Connect Stripe to populate."
          }
        />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {linkedPrices.map((p) => (
            <div
              key={p.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                background: HQ.card,
                border: `1px solid ${HQ.borderSoft}`,
                borderRadius: 8,
                padding: "8px 10px",
                fontSize: 11.5,
              }}
            >
              <span style={{ color: HQ.inkMuted, minWidth: 72 }}>
                {p.currency.toUpperCase()} · {p.interval}
              </span>
              <code style={{ ...codeStyle(), flex: 1 }}>{p.stripePriceId}</code>
              <a
                href={`${dashboardBase}/prices/${p.stripePriceId}`}
                target="_blank"
                rel="noopener noreferrer"
                style={linkStyle()}
              >
                Open ↗
              </a>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
