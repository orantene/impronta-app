"use client";

/**
 * Drawer / Features tab — read-only list of feature bullets for the
 * tier. Inline editor + reordering ships in Phase 4 per the master plan.
 */

import type { PricingTierRow } from "@/lib/pricing/pricing-types";
import { HQ } from "../_tokens";
import { SectionLabel, Pill, EmptyHint } from "../_primitives";

export function FeaturesTab({ tier }: { tier: PricingTierRow }) {
  if (tier.features.length === 0) {
    return <EmptyHint text="No features listed yet. Editor ships in Phase 4." />;
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <SectionLabel
        title="Features"
        hint="Read-only. Inline editor + reordering ships in Phase 4."
      />
      <ul
        style={{
          listStyle: "none",
          padding: 0,
          margin: 0,
          display: "flex",
          flexDirection: "column",
          gap: 6,
        }}
      >
        {tier.features.map((f) => (
          <li
            key={f.id}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              background: HQ.card,
              border: `1px solid ${HQ.borderSoft}`,
              borderRadius: 8,
              padding: "9px 12px",
              fontSize: 12.5,
              color: HQ.ink,
            }}
          >
            <span
              style={{
                width: 16,
                height: 16,
                borderRadius: 4,
                background: f.included ? HQ.green : HQ.inkDim,
                color: HQ.bg,
                fontSize: 10,
                fontWeight: 700,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              {f.included ? "✓" : "—"}
            </span>
            <span style={{ flex: 1 }}>{f.label}</span>
            {f.highlight && <Pill color={HQ.green}>★</Pill>}
            {f.category && (
              <span style={{ fontSize: 10, color: HQ.inkDim }}>{f.category}</span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
