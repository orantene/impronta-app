"use client";

/**
 * Drawer / Pricing tab — list active (currency × interval) prices for a
 * tier, plus add/remove/edit controls.
 *
 * Phase 1 shipped:  USD rows editable via inline Save button.
 * Phase 2 adds:     "+ Add currency" inline form (creates a new Stripe
 *                    Price + product_prices row in the chosen currency)
 *                    and an Archive button on each row (soft-delete + Stripe
 *                    Price archive; refuses to archive the last active row).
 *
 * Per the "every async state must be visible" rule, each row shows
 * Saved / Saved-as-stub / Error states persistently after every action.
 */

import { useState, useTransition } from "react";
import type { PricingTierRow } from "@/lib/pricing/pricing-types";
import {
  formatUnitAmount,
  currencyLabel,
} from "@/lib/pricing/pricing-types";
import {
  updateTierPrice,
  addTierPrice,
  archiveTierPrice,
} from "@/lib/server-actions/admin-product-pricing";
import {
  DEFAULT_CURRENCY_OPTIONS,
  type DefaultCurrencyCode,
} from "@/lib/billing/currencies";
import { HQ, F } from "../_tokens";
import { SectionLabel, EmptyHint, Field, inputStyle } from "../_primitives";

export function PricingTab({
  tier,
  stripeConfigured,
}: {
  tier: PricingTierRow;
  stripeConfigured: boolean;
}) {
  const activePrices = tier.prices.filter((p) => p.isActive && !p.archivedAt);
  const archivedPrices = tier.prices.filter((p) => p.archivedAt);
  const canArchive = activePrices.length > 1;
  // For the Add Currency form: which (currency × interval) combos are
  // ALREADY active so we don't offer them.
  const takenCombos = new Set(
    activePrices.map(
      (p) => `${p.currency.toUpperCase()}|${p.interval}`,
    ),
  );
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <SectionLabel
        title="Active prices"
        hint="Edit any currency inline. Saving creates a new Stripe Price + archives the old one (Prices are immutable)."
      />
      {activePrices.length === 0 && (
        <EmptyHint text="No active prices. Free tiers don’t need one; add a price via Stripe sync once the product is created." />
      )}
      {activePrices.map((price) => (
        <PriceRow
          key={price.id}
          price={price}
          editable
          canArchive={canArchive}
          stripeConfigured={stripeConfigured}
        />
      ))}

      <AddCurrencyRow
        tierId={tier.id}
        takenCombos={takenCombos}
        stripeConfigured={stripeConfigured}
        stripeProductLinked={tier.stripeProductId !== null}
      />

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
  canArchive,
  stripeConfigured,
}: {
  price: PricingTierRow["prices"][number];
  editable: boolean;
  /** False when this is the only active row (archiving would leave none). */
  canArchive: boolean;
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
      {editable && !stripeConfigured && state === "idle" && (
        <div style={{ fontSize: 10.5, color: HQ.inkDim, lineHeight: 1.4 }}>
          Stripe not connected — edits save in DB only.
        </div>
      )}

      {/* Archive control (Phase 2). Shown muted on the only-active row. */}
      <ArchiveButton priceId={price.id} disabled={!canArchive} />
    </div>
  );
}

// ─── ArchiveButton (Phase 2) ─────────────────────────────────────────────────

function ArchiveButton({
  priceId,
  disabled,
}: {
  priceId: string;
  disabled: boolean;
}) {
  const [state, setState] = useState<"idle" | "confirm" | "archiving" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function doArchive() {
    setState("archiving");
    setErrorMsg(null);
    startTransition(async () => {
      const res = await archiveTierPrice({ priceId });
      if (!res.ok) {
        setState("error");
        setErrorMsg(res.error);
        return;
      }
      // The page revalidates; this component unmounts when the price is
      // gone from the parent's list. No need to setState back to idle.
    });
  }

  if (disabled) {
    return (
      <div
        style={{
          fontSize: 10,
          color: HQ.inkDim,
          marginTop: 2,
        }}
      >
        Only active price — add another before archiving.
      </div>
    );
  }

  if (state === "confirm") {
    return (
      <div
        style={{
          display: "flex",
          gap: 6,
          alignItems: "center",
          marginTop: 2,
          fontSize: 10.5,
          color: HQ.inkMuted,
        }}
      >
        <span>Archive this price?</span>
        <button
          type="button"
          onClick={doArchive}
          style={{
            background: HQ.red,
            color: HQ.bg,
            border: "none",
            borderRadius: 4,
            padding: "3px 8px",
            fontSize: 10,
            cursor: "pointer",
            fontWeight: 600,
          }}
        >
          Yes, archive
        </button>
        <button
          type="button"
          onClick={() => setState("idle")}
          style={{
            background: "transparent",
            color: HQ.inkMuted,
            border: `1px solid ${HQ.borderSoft}`,
            borderRadius: 4,
            padding: "3px 8px",
            fontSize: 10,
            cursor: "pointer",
          }}
        >
          Cancel
        </button>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 2 }}>
      <button
        type="button"
        onClick={() => setState("confirm")}
        disabled={state === "archiving"}
        style={{
          background: "transparent",
          color: HQ.inkDim,
          border: "none",
          padding: 0,
          fontSize: 10.5,
          cursor: state === "archiving" ? "wait" : "pointer",
          textDecoration: "underline",
        }}
      >
        {state === "archiving" ? "Archiving…" : "Archive this price"}
      </button>
      {state === "error" && (
        <span style={{ fontSize: 10.5, color: HQ.red }}>
          {errorMsg ?? "Failed."}
        </span>
      )}
    </div>
  );
}

// ─── AddCurrencyRow (Phase 2) ────────────────────────────────────────────────

function AddCurrencyRow({
  tierId,
  takenCombos,
  stripeConfigured,
  stripeProductLinked,
}: {
  tierId: string;
  takenCombos: Set<string>;
  stripeConfigured: boolean;
  stripeProductLinked: boolean;
}) {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        style={{
          background: HQ.cardSoft,
          border: `1px dashed ${HQ.borderSoft}`,
          borderRadius: 8,
          padding: "10px 12px",
          fontSize: 12.5,
          color: HQ.inkMuted,
          fontFamily: F,
          cursor: "pointer",
          textAlign: "left",
        }}
      >
        + Add price for another currency
      </button>
    );
  }

  return (
    <AddCurrencyForm
      tierId={tierId}
      takenCombos={takenCombos}
      stripeConfigured={stripeConfigured}
      stripeProductLinked={stripeProductLinked}
      onCancel={() => setOpen(false)}
    />
  );
}

function AddCurrencyForm({
  tierId,
  takenCombos,
  stripeConfigured,
  stripeProductLinked,
  onCancel,
}: {
  tierId: string;
  takenCombos: Set<string>;
  stripeConfigured: boolean;
  stripeProductLinked: boolean;
  onCancel: () => void;
}) {
  // Filter currencies that don't already have BOTH month + year taken;
  // for any unused (currency × interval), the form will offer them.
  const availableCurrencies = DEFAULT_CURRENCY_OPTIONS.filter((c) => {
    return !(takenCombos.has(`${c}|month`) && takenCombos.has(`${c}|year`));
  });
  const [currency, setCurrency] = useState<DefaultCurrencyCode>(
    availableCurrencies[0] ?? "EUR",
  );
  const [interval, setInterval] = useState<"month" | "year" | "once">("month");
  const [amountInput, setAmountInput] = useState("");
  const [state, setState] = useState<
    "idle" | "saving" | "saved" | "stub" | "error"
  >("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [stubMsg, setStubMsg] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const intervalIsTaken = takenCombos.has(`${currency}|${interval}`);
  const validAmount = /^[0-9]+(\.[0-9]{1,2})?$/.test(amountInput) && Number(amountInput) > 0;

  function save() {
    setState("saving");
    setErrorMsg(null);
    setStubMsg(null);
    startTransition(async () => {
      const cents = Math.round(Number(amountInput) * 100);
      const res = await addTierPrice({
        tierId,
        currency,
        interval,
        unitAmount: cents,
      });
      if (!res.ok) {
        setState("error");
        setErrorMsg(res.error);
        return;
      }
      if (res.stripe.stub) {
        setState("stub");
        setStubMsg(res.stripe.reason ?? "Saved in DB only.");
        // Leave form open so the user sees the stub message; auto-close
        // after a few seconds so the new row (which the page revalidate
        // brought in) is what they see.
        setTimeout(onCancel, 2500);
      } else {
        setState("saved");
        setTimeout(onCancel, 1200);
      }
    });
  }

  return (
    <div
      style={{
        background: HQ.cardElevated,
        border: `1px solid ${HQ.borderHover}`,
        borderRadius: 10,
        padding: 12,
        display: "flex",
        flexDirection: "column",
        gap: 10,
      }}
    >
      <div
        style={{
          fontSize: 10.5,
          fontWeight: 600,
          color: HQ.inkMuted,
          textTransform: "uppercase",
          letterSpacing: 0.8,
        }}
      >
        Add a currency price
      </div>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <Field label="Currency">
          <select
            value={currency}
            onChange={(e) => setCurrency(e.target.value as DefaultCurrencyCode)}
            style={{ ...inputStyle(), width: 130 }}
          >
            {availableCurrencies.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Interval">
          <select
            value={interval}
            onChange={(e) =>
              setInterval(e.target.value as "month" | "year" | "once")
            }
            style={{ ...inputStyle(), width: 130 }}
          >
            <option value="month">month</option>
            <option value="year">year</option>
            <option value="once">once (one-time)</option>
          </select>
        </Field>
        <Field label="Amount (major units)">
          <input
            type="text"
            inputMode="decimal"
            value={amountInput}
            onChange={(e) => setAmountInput(e.target.value)}
            placeholder="49"
            style={{ ...inputStyle(), width: 120 }}
            disabled={state === "saving"}
          />
        </Field>
      </div>

      {intervalIsTaken && (
        <div style={{ fontSize: 11, color: HQ.amber }}>
          {currency} {interval} already exists — pick a different combination
          or edit the existing row.
        </div>
      )}
      {!validAmount && amountInput.length > 0 && (
        <div style={{ fontSize: 11, color: HQ.amber }}>
          Enter a number greater than 0 (max 2 decimal places).
        </div>
      )}

      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <button
          type="button"
          onClick={save}
          disabled={!validAmount || intervalIsTaken || state === "saving"}
          style={{
            background:
              validAmount && !intervalIsTaken ? HQ.ink : "transparent",
            color: validAmount && !intervalIsTaken ? HQ.bg : HQ.inkMuted,
            border:
              validAmount && !intervalIsTaken
                ? "none"
                : `1px solid ${HQ.borderHover}`,
            borderRadius: 6,
            padding: "8px 16px",
            fontFamily: F,
            fontSize: 12.5,
            cursor:
              !validAmount || intervalIsTaken || state === "saving"
                ? "default"
                : "pointer",
            fontWeight: 600,
          }}
        >
          {state === "saving" ? "Creating…" : "Create price"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={state === "saving"}
          style={{
            background: "transparent",
            color: HQ.inkMuted,
            border: `1px solid ${HQ.borderSoft}`,
            borderRadius: 6,
            padding: "8px 12px",
            fontFamily: F,
            fontSize: 12.5,
            cursor: state === "saving" ? "default" : "pointer",
          }}
        >
          Cancel
        </button>

        {state === "saved" && (
          <span style={{ fontSize: 11, color: HQ.green }}>
            Created — Stripe Price added.
          </span>
        )}
        {state === "stub" && (
          <span style={{ fontSize: 11, color: HQ.amber, lineHeight: 1.4 }}>
            ✓ Saved in DB. {stubMsg}
          </span>
        )}
        {state === "error" && (
          <span style={{ fontSize: 11, color: HQ.red, lineHeight: 1.4 }}>
            {errorMsg ?? "Save failed."}
          </span>
        )}
      </div>

      {!stripeConfigured && (
        <div style={{ fontSize: 10.5, color: HQ.inkDim }}>
          Stripe not connected — price saves in DB only; Stripe ID will be
          backfilled when the account is wired up.
        </div>
      )}
      {stripeConfigured && !stripeProductLinked && (
        <div style={{ fontSize: 10.5, color: HQ.inkDim }}>
          Tier has no Stripe Product yet — DB-only until the Product is
          created in Stripe.
        </div>
      )}
    </div>
  );
}
