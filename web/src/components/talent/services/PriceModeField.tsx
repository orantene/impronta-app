"use client";

import { useDashboardText } from "@/components/admin/shell/internal/dashboard-i18n";
import { toFixedMode, toQuoteMode } from "@/lib/talent/offering-price-mode";
import type { TalentOffering } from "@/lib/talent/offerings-types";

/**
 * TUL-633: Fixed price | Get a quote switch for a service (split out of
 * EditorScreen to keep it under its max-lines budget). "Get a quote" services
 * publish with a Request-a-quote button and a reminder to add a price.
 */
export function PriceModeField({
  item,
  patch,
  labelClass,
}: {
  item: TalentOffering;
  patch: (partial: Partial<TalentOffering>) => void;
  labelClass: string;
}) {
  const copy = useDashboardText();
  const quote = item.priceDisplay === "quote";
  const LABEL = labelClass;
  return (
    <div className="block">
      <span className={LABEL}>{copy.t("How the price works")}</span>
      <div role="radiogroup" aria-label={copy.t("How the price works")} className="mt-1 grid grid-cols-2 gap-1 rounded-lg border border-admin-border-soft bg-white p-1">
        {([false, true] as const).map((q) => (
          <button
            key={String(q)}
            type="button"
            role="radio"
            aria-checked={quote === q}
            data-testid={`service-price-mode-${q ? "quote" : "fixed"}`}
            onClick={() => patch(q ? toQuoteMode() : toFixedMode())}
            className={`rounded-md px-3 py-2 text-[14px] font-semibold ${quote === q ? "bg-emerald-900 text-white" : "text-admin-ink"}`}
          >
            {q ? copy.t("Get a quote") : copy.t("Fixed price")}
          </button>
        ))}
      </div>
      {!quote && (
        <label className="mt-2 flex items-center gap-2 text-[13px] text-admin-ink-dim">
          <input type="checkbox" checked={item.priceDisplay === "from"} onChange={(e) => patch({ priceDisplay: e.target.checked ? "from" : "exact" })} />
          {copy.t("Show as starting at")}
        </label>
      )}
      {quote && (
        <p className="mt-2 text-[13px] text-admin-ink-dim" data-testid="service-quote-reminder">
          {copy.t("Clients see Request a quote. Add a price to take bookings.")}
        </p>
      )}
    </div>
  );
}
