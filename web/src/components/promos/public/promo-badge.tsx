import type { CSSProperties } from "react";

import { publicPromoCopy } from "@/lib/promos/copy/public";
import type { DisplayPrice } from "@/lib/promos/display-price";
import { formatMoney } from "@/lib/talent/offerings-money";

/**
 * Strike-through price + badge ("-20%" / "Gratis: X") + scarcity line when
 * <= 5 left. Server-safe (no hooks). Renders the plain price when no promo is
 * live, so a surface looks exactly as before.
 */
export function PromoBadge({
  price,
  locale,
  prefix,
  style,
}: {
  price: DisplayPrice;
  locale: string;
  /** e.g. "Desde". */
  prefix?: string | null;
  style?: CSSProperties;
}) {
  const now = formatMoney(price.final_cents, price.currency, locale);
  if (!price.hasPromo) return <span style={style}>{prefix ? `${prefix} ${now}` : now}</span>;
  const before = formatMoney(price.list_cents, price.currency, locale);
  const copy = publicPromoCopy(locale);
  const struck = price.final_cents < price.list_cents;
  return (
    <span data-promo-price="" style={style}>
      {prefix ? `${prefix} ` : null}
      {struck ? (
        <>
          <span aria-hidden="true">
            <s style={{ opacity: 0.6 }}>{before}</s> <strong>{now}</strong>
          </span>
          <span className="sr-only">{copy.beforeNow(before, now)}</span>
        </>
      ) : (
        now
      )}
      {price.badge ? (
        <span
          data-promo-badge=""
          style={{ marginLeft: 6, padding: "1px 6px", borderRadius: 999, fontSize: "0.8em", fontWeight: 600, border: "1px solid currentColor" }}
        >
          {price.badge.label}
        </span>
      ) : null}
      {price.leftLabel ? <span data-promo-left="" style={{ marginLeft: 6, fontSize: "0.85em" }}>{price.leftLabel}</span> : null}
    </span>
  );
}

/** Plain-text form for surfaces that join facts into one string. */
export function promoPriceText(price: DisplayPrice, locale: string, prefix?: string | null): string {
  const now = formatMoney(price.final_cents, price.currency, locale);
  const head = prefix ? `${prefix} ` : "";
  if (!price.hasPromo) return `${head}${now}`;
  const copy = publicPromoCopy(locale);
  const parts = [
    price.final_cents < price.list_cents ? `${head}${copy.beforeNow(formatMoney(price.list_cents, price.currency, locale), now)}` : `${head}${now}`,
    price.badge?.label ?? null,
    price.leftLabel,
  ];
  return parts.filter(Boolean).join(" ");
}
