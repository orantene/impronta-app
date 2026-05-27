"use client";

/**
 * Drawer / Pricing tab — list active (currency × interval) prices for a
 * tier. Phase 1: only USD rows are editable.
 *
 * Each row is its own little stateful unit:
 *   1. Edit the input → dirty=true → Save button enables
 *   2. Click Save → server action → DB row archived, new row inserted,
 *      new Stripe Price created + old archived (or stub if Stripe isn't
 *      configured)
 *   3. UI shows persistent state (Saved / Saved-as-stub / Error) per the
 *      "every async state must be visible" admin-edit rule (memory:
 *      feedback_admin_edit_ux).
 */

import { useState, useTransition } from "react";
import type { PricingTierRow } from "@/lib/pricing/pricing-types";
import {
  formatUnitAmount,
  currencyLabel,
} from "@/lib/pricing/pricing-types";
import { updateTierPrice } from "@/lib/server-actions/admin-product-pricing";
import { HQ, F } from "../_tokens";
import { SectionLabel, EmptyHint } from "../_primitives";

export function PricingTab({
  tier,
  stripeConfigured,
}: {
  tier: PricingTierRow;
  stripeConfigured: boolean;
}) {
  const activePrices = tier.prices.filter((p) => p.isActive && !p.archivedAt);
  const archivedPrices = tier.prices.filter((p) => p.archivedAt);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <SectionLabel
        title="Active prices"
        hint="Edit USD amounts here. Other currencies arrive in Phase 2."
      />
      {activePrices.length === 0 && (
        <EmptyHint text="No active prices. Free tiers don’t need one; add a price via Stripe sync once the product is created." />
      )}
      {activePrices.map((price) => (
        <PriceRow
          key={price.id}
          price={price}
          editable={price.currency.toUpperCase() === "USD"}
          stripeConfigured={stripeConfigured}
        />
      ))}

      {archivedPrices.length > 0 && (
        <details
          style={{
            marginTop: 8,
            color: HQ.inkMuted,
            fontSize: 12,
            background: HQ.cardSoft,
            padding: 10,
            borderRadius: 8,
            border: `1px solid ${HQ.borderSoft}`,
          }}
        >
          <summary style={{ cursor: "pointer", color: HQ.inkMuted }}>
            Archived prices ({archivedPrices.length})
          </summary>
          <div
            style={{
              marginTop: 8,
              display: "flex",
              flexDirection: "column",
              gap: 6,
            }}
          >
            {archivedPrices.map((p) => (
              <div key={p.id} style={{ fontFamily: F, fontSize: 11.5 }}>
                {formatUnitAmount(p.unitAmount, p.currency)} · {p.interval} ·
                archived {p.archivedAt?.slice(0, 10)}
                {p.stripePriceId && (
                  <code style={{ marginLeft: 8, color: HQ.inkDim }}>
                    {p.stripePriceId}
                  </code>
                )}
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}

function PriceRow({
  price,
  editable,
  stripeConfigured,
}: {
  price: PricingTierRow["prices"][number];
  editable: boolean;
  stripeConfigured: boolean;
}) {
  const original = (price.unitAmount / 100).toFixed(
    price.unitAmount % 100 === 0 ? 0 : 2,
  );
  const [draftDollars, setDraftDollars] = useState(original);
  const [state, setState] = useState<
    "idle" | "saving" | "saved" | "stub" | "error"
  >("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [stubMsg, setStubMsg] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const dirty = draftDollars !== original;

  function save() {
    setState("saving");
    setErrorMsg(null);
    setStubMsg(null);
    startTransition(async () => {
      const newCents = Math.round(Number(draftDollars) * 100);
      if (!Number.isFinite(newCents) || newCents < 0) {
        setState("error");
        setErrorMsg("Enter a number ≥ 0.");
        return;
      }
      const res = await updateTierPrice({
        priceId: price.id,
        unitAmount: newCents,
      });
      if (!res.ok) {
        setState("error");
        setErrorMsg(res.error);
        return;
      }
      if (res.stripe.stub) {
        setState("stub");
        setStubMsg(res.stripe.reason ?? "Saved in DB only.");
      } else {
        setState("saved");
      }
      setTimeout(() => setState("idle"), 3500);
    });
  }

  return (
    <div
      style={{
        background: HQ.card,
        border: `1px solid ${HQ.borderSoft}`,
        borderRadius: 10,
        padding: 12,
        display: "flex",
        flexDirection: "column",
        gap: 8,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          flexWrap: "wrap",
        }}
      >
        <span
          style={{
            fontSize: 10.5,
            fontWeight: 600,
            color: HQ.inkMuted,
            letterSpacing: 0.6,
            textTransform: "uppercase",
            minWidth: 88,
          }}
        >
          {currencyLabel(price.currency)}
        </span>
        <span
          style={{
            fontSize: 11,
            color: HQ.inkMuted,
            background: HQ.cardSoft,
            padding: "2px 7px",
            borderRadius: 4,
          }}
        >
          {price.interval}
        </span>
        <span style={{ flex: 1 }} />
        {price.stripePriceId ? (
          <code style={{ fontSize: 10, color: HQ.inkDim }}>
            {price.stripePriceId.slice(0, 18)}…
          </code>
        ) : (
          <span style={{ fontSize: 10.5, color: HQ.amber }}>No Stripe ID</span>
        )}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ color: HQ.inkMuted, fontSize: 14 }}>
          {price.currency.toUpperCase() === "USD" ? "$" : ""}
        </span>
        <input
          type="text"
          inputMode="decimal"
          value={draftDollars}
          onChange={(e) => setDraftDollars(e.target.value)}
          disabled={!editable || state === "saving"}
          aria-label={`${price.currency} ${price.interval} amount`}
          style={{
            flex: 1,
            background: HQ.bg,
            border: `1px solid ${HQ.borderSoft}`,
            borderRadius: 6,
            color: HQ.ink,
            padding: "8px 10px",
            fontFamily: F,
            fontSize: 14,
            fontVariantNumeric: "tabular-nums",
            opacity: editable ? 1 : 0.55,
          }}
        />
        {editable && (
          <button
            type="button"
            onClick={save}
            disabled={!dirty || state === "saving"}
            style={{
              background: dirty ? HQ.ink : "transparent",
              color: dirty ? HQ.bg : HQ.inkMuted,
              border: dirty ? "none" : `1px solid ${HQ.borderHover}`,
              borderRadius: 6,
              padding: "8px 14px",
              fontFamily: F,
              fontSize: 12.5,
              cursor: !dirty || state === "saving" ? "default" : "pointer",
              fontWeight: 600,
            }}
          >
            {state === "saving" ? "Saving…" : "Save"}
          </button>
        )}
      </div>

      {state === "saved" && (
        <div style={{ fontSize: 11, color: HQ.green }}>
          Saved — new Stripe Price created, old one archived.
        </div>
      )}
      {state === "stub" && (
        <div style={{ fontSize: 11, color: HQ.amber, lineHeight: 1.4 }}>
          ✓ Saved in DB. {stubMsg}
        </div>
      )}
      {state === "error" && (
        <div style={{ fontSize: 11, color: HQ.red, lineHeight: 1.4 }}>
          {errorMsg ?? "Save failed."}
        </div>
      )}
      {!editable && (
        <div style={{ fontSize: 10.5, color: HQ.inkDim, lineHeight: 1.4 }}>
          Multi-currency editing arrives in Phase 2.
        </div>
      )}
      {editable && !stripeConfigured && state === "idle" && (
        <div style={{ fontSize: 10.5, color: HQ.inkDim, lineHeight: 1.4 }}>
          Stripe not connected — edits save in DB only.
        </div>
      )}
    </div>
  );
}
