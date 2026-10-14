"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { BookingPreviewInput } from "@/lib/promos/booking-quote.actions";

// Loaded on demand, like instant-book-action in catalog-booking-confirm: a
// static import of a "use server" module drags server-only code into the
// builder render path (fidelity + perf scripts import it outside Next).
const previewBookingQuoteAction = async (input: Parameters<typeof import("@/lib/promos/booking-quote.actions").previewBookingQuoteAction>[0]) =>
  (await import("@/lib/promos/booking-quote.actions")).previewBookingQuoteAction(input);
import type { BookingPreview } from "@/lib/promos/booking-preview-view";
import { publicPromoCopy } from "@/lib/promos/copy/public";
import type { PromoCodeOutcome } from "@/lib/promos/public-view";

import { CheckoutPromoBreakdown } from "./checkout-promo-breakdown";
import { PromoCodeField } from "./promo-code-field";

export type BookingPromoChoice = {
  /** The code to send with the confirm (null = none typed or it did not apply). */
  promoCode: string | null;
  /** The discount shown; the server refuses a smaller one as "promo gone". */
  promoShownDiscountCents: number | null;
};

/**
 * Pay-step promo block (Promos v1, design E): link pill, breakdown when a
 * promo applies, and the collapsed "¿Tienes un código?" field. Read-only: the
 * preview holds nothing. `refreshKey` re-quotes (bump it after "promo gone"
 * so the client sees the regular price before confirming again).
 */
export function BookingPromoPanel({
  locale,
  request,
  refreshKey = 0,
  onChange,
}: {
  locale: string;
  request: Omit<BookingPreviewInput, "promoCode">;
  refreshKey?: number;
  onChange: (choice: BookingPromoChoice) => void;
}) {
  const [preview, setPreview] = useState<BookingPreview | null>(null);
  const [code, setCode] = useState<string | null>(null);
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);
  const key = JSON.stringify([request, refreshKey]);

  // A new attempt after "promo gone" starts without the code that ran out.
  useEffect(() => {
    if (refreshKey > 0) setCode(null);
  }, [refreshKey]);

  useEffect(() => {
    let live = true;
    void previewBookingQuoteAction({ ...request, promoCode: code })
      .then((res) => {
        if (!live) return;
        const next = res.ok ? res.preview : null;
        setPreview(next);
        const applied = next?.code?.ok === true;
        onChangeRef.current({
          promoCode: applied ? code : null,
          promoShownDiscountCents: next && next.discountCents > 0 ? next.discountCents : null,
        });
      })
      .catch(() => {
        if (live) setPreview(null);
      });
    return () => {
      live = false;
    };
    // `key` covers request + refreshKey; code is its own trigger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, code]);

  const apply = async (typed: string): Promise<PromoCodeOutcome> => {
    const res = await previewBookingQuoteAction({ ...request, promoCode: typed });
    if (!res.ok) return { ok: false, reason: "promo_unavailable" };
    const outcome = res.preview.code ?? { ok: false, reason: "promo_unavailable" };
    if (outcome.ok) setCode(typed);
    return outcome;
  };

  const copy = publicPromoCopy(locale);
  return (
    <div data-booking-promo-panel="" style={{ display: "flex", flexDirection: "column", gap: 8, margin: "8px 0" }}>
      {preview?.linkApplied ? (
        <span
          data-promo-link-pill=""
          style={{ alignSelf: "flex-start", padding: "2px 10px", borderRadius: 999, fontSize: 12, fontWeight: 600, border: "1px solid currentColor" }}
        >
          {copy.linkPill}
        </span>
      ) : null}
      {preview?.hasPromo ? (
        <CheckoutPromoBreakdown lines={preview.lines} gifts={preview.gifts} currency={preview.currency} locale={locale} />
      ) : null}
      <div style={{ fontSize: 13 }}>
        <PromoCodeField key={refreshKey} locale={locale} onApply={apply} />
      </div>
    </div>
  );
}

/** Sheet-side state for the panel: the choice to send, and the re-quote key. */
export function useBookingPromo() {
  const [choice, setChoice] = useState<BookingPromoChoice>({ promoCode: null, promoShownDiscountCents: null });
  const [refreshKey, setRefreshKey] = useState(0);
  const promoGone = useCallback(() => setRefreshKey((n) => n + 1), []);
  return { choice, setChoice, refreshKey, promoGone };
}
