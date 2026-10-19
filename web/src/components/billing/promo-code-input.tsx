"use client";

/**
 * PromoCodeInput (TUL-833) · reusable "Have a code?" box for upgrade surfaces
 * (the upgrade modal, TUL-829, mounts it). It only PREVIEWS: it asks
 * `validatePromoCode` what the code would do and reports the accepted code via
 * `onApplied`. The parent passes that code to the checkout action, which
 * re-validates it server-side.
 */
import { useState, useTransition } from "react";
import { useT } from "@/i18n/use-t";
import { useDashboardLocale } from "@/i18n/use-dashboard-locale";
import { validatePromoCode } from "@/lib/server-actions/validate-promo-code";
import type { PromoPreview } from "@/lib/billing/promo-preview";
import type { TalentPlanKey } from "@/lib/stripe/price-ids";

export type PromoCodeInputProps = {
  plan: TalentPlanKey;
  interval: "month" | "year";
  /** Pre-fills (and opens) the box, e.g. the `?promo=` value from the URL. */
  defaultCode?: string | null;
  /** Called with the validated code + preview, or (null, null) when cleared. */
  onApplied: (code: string | null, preview: PromoPreview | null) => void;
};

function usd(cents: number): string {
  return `$${(cents / 100).toFixed(cents % 100 === 0 ? 0 : 2)}`;
}

export function PromoCodeInput({ plan, interval, defaultCode, onApplied }: PromoCodeInputProps) {
  const t = useT();
  const locale = useDashboardLocale();
  const lang = locale === "es" ? "es" : "en";
  const [open, setOpen] = useState(Boolean(defaultCode));
  const [value, setValue] = useState(defaultCode ?? "");
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<PromoPreview | null>(null);
  const [pending, start] = useTransition();

  function apply() {
    const code = value.trim();
    if (!code) return;
    setError(null);
    start(async () => {
      const res = await validatePromoCode(code, plan, interval);
      if (res.ok) {
        setPreview(res.preview);
        onApplied(res.preview.code, res.preview);
      } else {
        setPreview(null);
        setError(res.message[lang]);
        onApplied(null, null);
      }
    });
  }

  function clear() {
    setPreview(null);
    setValue("");
    setError(null);
    onApplied(null, null);
  }

  if (!open) {
    return (
      <button
        type="button"
        className="text-sm text-muted-foreground underline underline-offset-2"
        onClick={() => setOpen(true)}
      >
        {t("dashboard.promoCode.toggle")}
      </button>
    );
  }

  if (preview) {
    return (
      <div className="flex items-center justify-between gap-3 text-sm" role="status">
        <span>
          <strong>{preview.code}</strong>: {preview.label[lang]} ({usd(preview.baseCents)}
          {" → "}
          {usd(preview.discountedCents)})
        </span>
        <button type="button" className="underline underline-offset-2" onClick={clear}>
          {t("dashboard.promoCode.remove")}
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex gap-2">
        <input
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value.toUpperCase())}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              apply();
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
        <button
          type="button"
          onClick={apply}
          disabled={pending || !value.trim()}
          className="h-9 rounded-md border px-3 text-sm disabled:opacity-50"
        >
          {pending ? t("dashboard.promoCode.checking") : t("dashboard.promoCode.apply")}
        </button>
      </div>
      {error ? (
        <p className="text-sm text-red-600" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
