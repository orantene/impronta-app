import { breakdownModel, type BreakdownGiftInput, type BreakdownLineInput } from "@/lib/promos/public-view";
import type { UsdRates } from "@/lib/pricing/usd-equivalent";

/**
 * Checkout breakdown (design E, L6): list, promo line, free extra at $0 with
 * the struck value, total, ≈US$ line, and "Antes · Ahora · Ahorras".
 */
export function CheckoutPromoBreakdown(props: {
  lines: readonly BreakdownLineInput[];
  gifts?: readonly BreakdownGiftInput[];
  currency: string;
  locale: string;
  usdRates?: UsdRates | null;
}) {
  const m = breakdownModel(props);
  return (
    <div data-checkout-promo-breakdown="">
      <dl style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: "4px 12px", margin: 0 }}>
        {m.rows.map((r, i) => (
          <div key={`${r.kind}-${i}`} style={{ display: "contents", fontWeight: r.kind === "total" ? 700 : 400 }}>
            <dt>{r.label}</dt>
            <dd style={{ margin: 0, textAlign: "right" }}>
              {r.kind === "gift" ? (
                <>
                  {r.amount} <s style={{ opacity: 0.6 }}>{r.struck}</s>
                </>
              ) : (
                r.amount
              )}
            </dd>
          </div>
        ))}
      </dl>
      {m.usdLine ? <p style={{ margin: "4px 0 0", fontSize: 13, textAlign: "right" }}>{m.usdLine}</p> : null}
      {m.summary ? <p style={{ margin: "8px 0 0", fontSize: 14 }}>{m.summary}</p> : null}
    </div>
  );
}
