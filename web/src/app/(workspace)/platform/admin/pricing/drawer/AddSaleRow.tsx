"use client";

/**
 * AddSaleRow — Phase 5 drawer affordance for creating a time-bounded
 * sale price.
 *
 * Sale prices live alongside the canonical price for a given
 * (currency × interval) pair. The sale-aware reader picks the
 * in-window row at render time and falls back to canonical outside
 * the window. So the operator's mental model is:
 *
 *   "I want to discount Studio USD/month from $49 to $24.50 for the
 *    next 7 days." → pick USD/month + amount 24.50 + start now +
 *    end now+7d → DONE.
 *
 * Lives in its own file so PricingTab.tsx stays under the 800-line
 * max-lines lint cap.
 */

import { useState, useTransition } from "react";
import { addTierPrice } from "@/lib/server-actions/admin-product-pricing";
import { useT } from "@/i18n/use-t";
import { interpolate } from "@/i18n/interpolate";
import { HQ, F } from "../_tokens";
import { Field, inputStyle } from "../_primitives";

export function AddSaleRow({
  tierId,
  eligibleCombos,
  stripeConfigured,
}: {
  tierId: string;
  /** ["USD|month", "USD|year", ...] — combos that have a CANONICAL row.
   *  Operators can only stack sales onto an existing canonical price. */
  eligibleCombos: string[];
  stripeConfigured: boolean;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);

  if (eligibleCombos.length === 0) {
    // Nothing canonical to stack a sale onto. Render as a dimmed hint
    // so the operator understands why the affordance is missing.
    return (
      <div
        style={{
          background: HQ.cardSoft,
          border: `1px dashed ${HQ.borderSoft}`,
          borderRadius: 8,
          padding: "10px 12px",
          fontSize: 11.5,
          color: HQ.inkDim,
          fontFamily: F,
        }}
      >
        {t("dashboard.platform.pricing.addSale.needCanonical")}
      </div>
    );
  }

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
        {t("dashboard.platform.pricing.addSale.addSale")}
      </button>
    );
  }

  return (
    <AddSaleForm
      tierId={tierId}
      eligibleCombos={eligibleCombos}
      stripeConfigured={stripeConfigured}
      onCancel={() => setOpen(false)}
    />
  );
}

function AddSaleForm({
  tierId,
  eligibleCombos,
  stripeConfigured,
  onCancel,
}: {
  tierId: string;
  eligibleCombos: string[];
  stripeConfigured: boolean;
  onCancel: () => void;
}) {
  const t = useT();
  // Decompose "USD|month" → { currency, interval }
  const [combo, setCombo] = useState(eligibleCombos[0] ?? "");
  const [amountInput, setAmountInput] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [state, setState] = useState<"idle" | "saving" | "saved" | "stub" | "error">(
    "idle",
  );
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [stubMsg, setStubMsg] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const parts = combo.split("|");
  const currency = parts[0] ?? "USD";
  const interval = (parts[1] ?? "month") as "month" | "year" | "once" | "lifetime";

  const validAmount =
    /^[0-9]+(\.[0-9]{1,2})?$/.test(amountInput) && Number(amountInput) > 0;
  // At least one of start/end must be set (otherwise the row is
  // canonical, not a sale).
  const windowSet = startsAt !== "" || endsAt !== "";
  const startsBeforeEnds =
    !startsAt ||
    !endsAt ||
    new Date(startsAt).getTime() < new Date(endsAt).getTime();
  const canSave =
    validAmount && windowSet && startsBeforeEnds && state !== "saving";

  function isoOrNull(local: string): string | null {
    if (!local) return null;
    try {
      return new Date(local).toISOString();
    } catch {
      return null;
    }
  }

  function save() {
    setState("saving");
    setErrorMsg(null);
    setStubMsg(null);
    startTransition(async () => {
      const cents = Math.round(Number(amountInput) * 100);
      const res = await addTierPrice({
        tierId,
        currency: currency as Parameters<typeof addTierPrice>[0]["currency"],
        interval,
        unitAmount: cents,
        validFrom: isoOrNull(startsAt),
        validUntil: isoOrNull(endsAt),
      });
      if (!res.ok) {
        setState("error");
        setErrorMsg(res.error);
        return;
      }
      if (res.stripe.stub) {
        setState("stub");
        setStubMsg(
          res.stripe.reason ??
            t("dashboard.platform.pricing.addSale.savedDbOnlyDefault"),
        );
        setTimeout(onCancel, 2500);
      } else {
        setState("saved");
        setTimeout(onCancel, 1500);
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
        {t("dashboard.platform.pricing.addSale.title")}
      </div>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <Field label={t("dashboard.platform.pricing.addSale.appliesTo")}>
          <select
            value={combo}
            onChange={(e) => setCombo(e.target.value)}
            style={{ ...inputStyle(), width: 180 }}
          >
            {eligibleCombos.map((c) => (
              <option key={c} value={c}>
                {c.replace("|", " · ")}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t("dashboard.platform.pricing.addSale.saleAmount")}>
          <input
            type="text"
            inputMode="decimal"
            value={amountInput}
            onChange={(e) => setAmountInput(e.target.value)}
            placeholder="24.50"
            style={{ ...inputStyle(), width: 140 }}
            disabled={state === "saving"}
          />
        </Field>
      </div>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <Field label={t("dashboard.platform.pricing.addSale.startsAt")}>
          <input
            type="datetime-local"
            value={startsAt}
            onChange={(e) => setStartsAt(e.target.value)}
            style={{ ...inputStyle(), width: 220 }}
          />
        </Field>
        <Field label={t("dashboard.platform.pricing.addSale.endsAt")}>
          <input
            type="datetime-local"
            value={endsAt}
            onChange={(e) => setEndsAt(e.target.value)}
            style={{ ...inputStyle(), width: 220 }}
          />
        </Field>
      </div>

      {!windowSet && amountInput !== "" && (
        <div style={{ fontSize: 11, color: HQ.amber }}>
          {t("dashboard.platform.pricing.addSale.windowRequired")}
        </div>
      )}
      {!startsBeforeEnds && (
        <div style={{ fontSize: 11, color: HQ.amber }}>
          {t("dashboard.platform.pricing.addSale.startBeforeEnd")}
        </div>
      )}

      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <button
          type="button"
          onClick={save}
          disabled={!canSave}
          style={{
            background: canSave ? HQ.ink : "transparent",
            color: canSave ? HQ.bg : HQ.inkMuted,
            border: canSave ? "none" : `1px solid ${HQ.borderHover}`,
            borderRadius: 6,
            padding: "8px 16px",
            fontFamily: F,
            fontSize: 12.5,
            cursor: canSave ? "pointer" : "default",
            fontWeight: 600,
          }}
        >
          {state === "saving"
            ? t("dashboard.platform.pricing.addSale.creating")
            : t("dashboard.platform.pricing.addSale.createSale")}
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
          {t("dashboard.platform.pricing.addSale.cancel")}
        </button>

        {state === "saved" && (
          <span style={{ fontSize: 11, color: HQ.green }}>
            {t("dashboard.platform.pricing.addSale.createdStripe")}
          </span>
        )}
        {state === "stub" && (
          <span style={{ fontSize: 11, color: HQ.amber, lineHeight: 1.4 }}>
            ✓{" "}
            {interpolate(t("dashboard.platform.pricing.addSale.savedDbOnly"), {
              detail: stubMsg ?? "",
            })}
          </span>
        )}
        {state === "error" && (
          <span style={{ fontSize: 11, color: HQ.red, lineHeight: 1.4 }}>
            {errorMsg ?? t("dashboard.platform.pricing.addSale.saveFailed")}
          </span>
        )}
      </div>

      {!stripeConfigured && (
        <div style={{ fontSize: 10.5, color: HQ.inkDim }}>
          {t("dashboard.platform.pricing.addSale.notConnectedHint")}
        </div>
      )}
    </div>
  );
}
