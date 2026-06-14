/**
 * ServiceMenuList — presentational list of service cards (price + suffix,
 * description, discipline chips, tiers, bundle contents, add-ons).
 *
 * Directive-free (no "use client", no server-only imports) so BOTH the server
 * ServiceMenuBlock and the client ServiceMenuFilter can render it. Pure props →
 * JSX. --plt tokens.
 */

import type { ServiceMenuItem } from "@/lib/talent/services-menu-types";
import { SERVICE_PRICING_SUFFIX } from "@/lib/talent/services-menu-types";

/** Money formatter resilient to a bad/short currency code (falls back to plain). */
export function formatPrice(amountCents: number, currency: string, locale: string): string {
  const amount = amountCents / 100;
  try {
    return new Intl.NumberFormat(locale === "es" ? "es" : "en", {
      style: "currency",
      currency: currency.toUpperCase(),
      maximumFractionDigits: amount % 1 === 0 ? 0 : 2,
    }).format(amount);
  } catch {
    return `${currency.toUpperCase()} ${amount.toLocaleString()}`;
  }
}

/** The price label for a service line: amount + unit suffix, or quote/on-request. */
function priceLabel(it: ServiceMenuItem, locale: string): string {
  if (it.visibility === "on_request") return locale === "es" ? "Bajo consulta" : "On request";
  if (it.pricingType === "custom" || it.amountCents == null) {
    return locale === "es" ? "Cotización a pedido" : "Quote on request";
  }
  const suffix = SERVICE_PRICING_SUFFIX[it.pricingType];
  const price = formatPrice(it.amountCents, it.currency, locale);
  return suffix ? `${price} ${suffix}` : price;
}

type ServiceMenuListProps = {
  items: ServiceMenuItem[];
  locale: string;
  disciplineLabels?: Record<string, string>;
  /** id → name across the FULL visible set, so bundle "Includes" still resolves
   *  even when the list is filtered to a subset. */
  nameById: Map<string, string>;
};

export function ServiceMenuList({ items, locale, disciplineLabels, nameById }: ServiceMenuListProps) {
  const addOnsLabel = locale === "es" ? "Extras" : "Add-ons";
  const includesLabel = locale === "es" ? "Incluye" : "Includes";

  return (
    <div className="mt-5 space-y-3">
      {items.map((it) => {
        const childNames = (it.childServiceIds ?? [])
          .map((cid) => nameById.get(cid))
          .filter((n): n is string => Boolean(n));
        const disciplineNames = (it.taxonomyTermIds ?? [])
          .map((tid) => disciplineLabels?.[tid])
          .filter((n): n is string => Boolean(n));
        return (
          <div
            key={it.id}
            className="rounded-[var(--plt-radius-md)] border p-4"
            style={{ borderColor: "var(--plt-hairline)", background: "var(--plt-bg-raised)" }}
          >
            <div className="flex items-baseline justify-between gap-3">
              <p className="font-medium" style={{ color: "var(--plt-ink)" }}>
                {it.name}
              </p>
              <p
                className="shrink-0 text-sm font-medium tabular-nums"
                style={{ color: "var(--plt-ink)" }}
              >
                {priceLabel(it, locale)}
              </p>
            </div>

            {disciplineNames.length > 0 ? (
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {disciplineNames.map((d) => (
                  <span
                    key={d}
                    className="plt-mono inline-flex items-center rounded-full border px-2 py-0.5 text-[0.625rem] uppercase tracking-[0.1em]"
                    style={{
                      borderColor: "var(--plt-hairline-strong)",
                      color: "var(--plt-muted-soft)",
                    }}
                  >
                    {d}
                  </span>
                ))}
              </div>
            ) : null}

            {it.description ? (
              <p className="mt-1 text-sm" style={{ color: "var(--plt-muted)" }}>
                {it.description}
              </p>
            ) : null}

            {/* Tiers — named price points within this service */}
            {it.tiers.length > 0 ? (
              <ul className="mt-2 space-y-1">
                {it.tiers.map((tier) => (
                  <li
                    key={tier.id}
                    className="flex items-baseline justify-between gap-3 text-sm"
                    style={{ color: "var(--plt-ink-soft)" }}
                  >
                    <span>{tier.label}</span>
                    {tier.amountCents != null ? (
                      <span className="tabular-nums" style={{ color: "var(--plt-muted)" }}>
                        {formatPrice(tier.amountCents, it.currency, locale)}
                      </span>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : null}

            {/* Bundle contents */}
            {childNames.length > 0 ? (
              <p className="mt-2 text-sm" style={{ color: "var(--plt-muted)" }}>
                <span
                  className="plt-mono text-[0.625rem] uppercase tracking-[0.14em]"
                  style={{ color: "var(--plt-muted-soft)" }}
                >
                  {includesLabel}:{" "}
                </span>
                {childNames.join(" · ")}
              </p>
            ) : null}

            {/* Add-ons */}
            {it.addOns.length > 0 ? (
              <div className="mt-2 flex flex-wrap gap-1.5">
                <span
                  className="plt-mono text-[0.625rem] uppercase tracking-[0.14em]"
                  style={{ color: "var(--plt-muted-soft)" }}
                >
                  {addOnsLabel}:
                </span>
                {it.addOns.map((ao) => (
                  <span
                    key={ao.id}
                    className="inline-flex items-center rounded-full border px-2 py-0.5 text-[0.75rem]"
                    style={{
                      borderColor: "var(--plt-hairline-strong)",
                      color: "var(--plt-ink-soft)",
                    }}
                  >
                    {ao.label}
                    {ao.amountCents != null ? (
                      <span className="ml-1 tabular-nums" style={{ color: "var(--plt-muted)" }}>
                        +{formatPrice(ao.amountCents, it.currency, locale)}
                        {SERVICE_PRICING_SUFFIX[ao.pricingType]
                          ? ` ${SERVICE_PRICING_SUFFIX[ao.pricingType]}`
                          : ""}
                      </span>
                    ) : null}
                  </span>
                ))}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
