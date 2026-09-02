"use client";

/**
 * ImportFromStripeButton — pull promotion codes that exist only in Stripe into
 * `product_discounts`.
 *
 * This is the bridge that let the Stripe-only discount screen be deleted. Codes
 * minted there had no database row, so consolidating without importing first
 * would have stranded them: still live and redeemable at Stripe, listed on no
 * screen anywhere. It stays after the migration because a code can still be
 * minted in the Stripe dashboard by hand.
 *
 * Safe to press twice: the action is keyed on `code`, only ever fills MISSING
 * Stripe ids on rows that already exist, and never overwrites a value an
 * operator set here.
 */

import { useState, useTransition } from "react";
import { importStripePromotionCodes } from "@/lib/server-actions/admin-discount-stripe-import";
import { useT } from "@/i18n/use-t";
import { interpolate } from "@/i18n/interpolate";
import { HQ, F } from "../_tokens";

const P = "dashboard.platform.commerce.discounts";

export function ImportFromStripeButton() {
  const t = useT();
  const [state, setState] = useState<"idle" | "running" | "done" | "stub" | "error">(
    "idle",
  );
  const [message, setMessage] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function run() {
    setState("running");
    setMessage(null);
    startTransition(async () => {
      const res = await importStripePromotionCodes();
      if (!res.ok) {
        setState("error");
        setMessage(res.error);
        return;
      }
      if (res.stub) {
        setState("stub");
        setMessage(res.reason ?? t(`${P}.importNotConnected`));
        return;
      }
      setState("done");
      setMessage(
        interpolate(t(`${P}.importResult`), {
          imported: res.imported,
          linked: res.linked,
          skipped: res.skipped,
        }),
      );
    });
  }

  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
      <button
        type="button"
        onClick={run}
        disabled={state === "running"}
        title={t(`${P}.importHint`)}
        style={{
          background: "transparent",
          color: HQ.inkMuted,
          border: `1px solid ${HQ.borderSoft}`,
          borderRadius: 8,
          padding: "10px 14px",
          fontSize: 12.5,
          fontFamily: F,
          cursor: state === "running" ? "wait" : "pointer",
        }}
      >
        {state === "running" ? t(`${P}.importing`) : t(`${P}.importFromStripe`)}
      </button>
      {message && (
        <span
          style={{
            fontSize: 11.5,
            lineHeight: 1.4,
            color:
              state === "error"
                ? HQ.red
                : state === "stub"
                  ? HQ.amber
                  : HQ.green,
          }}
        >
          {message}
        </span>
      )}
    </span>
  );
}
