"use client";

import { useState } from "react";
import { useT } from "@/i18n/use-t";

/**
 * TUL-833 · "Have a code?" box for the in-app plan change. It only collects
 * the string: the server validates it while pricing the preview (the same
 * catalog validator the checkout uses), so the discounted amount shown above
 * the confirm button is Stripe's own number, never a client estimate.
 */
export function PlanChangePromoBox({
  applied,
  error,
  pending,
  onApply,
  onClear,
}: {
  applied: string | null;
  error: string | null;
  pending: boolean;
  onApply: (code: string) => void;
  onClear: () => void;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");

  if (applied) {
    return (
      <div className="flex items-center justify-between gap-3 text-sm" data-testid="plan-change-promo-applied">
        <strong>{applied}</strong>
        <button
          type="button"
          className="underline underline-offset-2"
          onClick={() => {
            setValue("");
            onClear();
          }}
          disabled={pending}
        >
          {t("dashboard.promoCode.remove")}
        </button>
      </div>
    );
  }
  if (!open && !error) {
    return (
      <button type="button" className="self-start text-sm text-muted-foreground underline underline-offset-2" onClick={() => setOpen(true)}>
        {t("dashboard.promoCode.toggle")}
      </button>
    );
  }
  const submit = () => {
    const code = value.trim();
    if (code) onApply(code);
  };
  return (
    <div className="flex flex-col gap-1" data-testid="plan-change-promo-box">
      <div className="flex gap-2">
        <input
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value.toUpperCase())}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              submit();
            }
          }}
          aria-label={t("dashboard.promoCode.label")}
          aria-invalid={error ? true : undefined}
          placeholder={t("dashboard.promoCode.placeholder")}
          autoComplete="off"
          spellCheck={false}
          maxLength={40}
          className="h-9 flex-1 rounded-md border px-3 text-sm"
        />
        <button type="button" onClick={submit} disabled={pending || !value.trim()} className="h-9 rounded-md border px-3 text-sm disabled:opacity-50">
          {pending ? t("dashboard.promoCode.checking") : t("dashboard.promoCode.apply")}
        </button>
      </div>
      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
