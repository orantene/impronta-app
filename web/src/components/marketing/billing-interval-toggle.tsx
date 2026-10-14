"use client";

/**
 * billing-interval-toggle.tsx: the Monthly / Yearly switch on /pricing
 * (TUL-828). Server-rendered cards carry BOTH price variants; this wrapper
 * only flips `data-interval` on a named Tailwind group, so toggling never
 * refetches, never shifts layout, and works without JS (defaults monthly).
 */
import { useEffect, useState, type ReactNode } from "react";
import {
  DEFAULT_BILLING_INTERVAL,
  type BillingInterval,
} from "@/lib/pricing/interval-pricing";
import { parseBillingInterval } from "@/lib/pricing/pricing-cta-href";

export type BillingToggleCopy = {
  groupLabel: string;
  monthly: string;
  yearly: string;
  /** Already interpolated ("Save up to 17%"); empty hides the badge. */
  saveBadge: string;
};

export function BillingIntervalToggle({
  copy,
  initialInterval = DEFAULT_BILLING_INTERVAL,
  children,
}: {
  copy: BillingToggleCopy;
  /** Parsed server-side from ?interval=, so first paint is already right. */
  initialInterval?: BillingInterval;
  children: ReactNode;
}) {
  const [interval, setBilling] = useState<BillingInterval>(initialInterval);
  // The server already seeded the interval from searchParams; this only
  // re-syncs if the client URL disagrees (e.g. a soft navigation).
  useEffect(() => {
    try {
      const v = new URLSearchParams(window.location.search).get("interval");
      setBilling(parseBillingInterval(v));
    } catch {
      /* no URL access: keep the server value */
    }
  }, []);
  function choose(next: BillingInterval) {
    setBilling(next);
    try {
      const url = new URL(window.location.href);
      if (next === DEFAULT_BILLING_INTERVAL) url.searchParams.delete("interval");
      else url.searchParams.set("interval", next);
      window.history.replaceState(window.history.state, "", url);
    } catch {
      /* URL sync is best effort */
    }
  }
  const options: { value: BillingInterval; label: string }[] = [
    { value: "month", label: copy.monthly },
    { value: "year", label: copy.yearly },
  ];
  return (
    <div
      data-interval={interval}
      data-testid="billing-interval-root"
      className="group/billing"
    >
      <div className="flex justify-center">
        <div
          role="radiogroup"
          data-testid="billing-interval-toggle"
          aria-label={copy.groupLabel}
          className="inline-flex items-center gap-1 rounded-full p-1"
          style={{
            background: "var(--plt-bg-raised)",
            border: "1px solid var(--plt-hairline)",
          }}
        >
          {options.map((o) => {
            const active = o.value === interval;
            return (
              <button
                key={o.value}
                type="button"
                role="radio"
                data-testid={`billing-interval-${o.value}`}
                aria-checked={active}
                onClick={() => choose(o.value)}
                className="inline-flex min-h-11 items-center gap-2 rounded-full px-4 text-[0.9375rem] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 sm:px-5"
                style={{
                  background: active ? "var(--plt-ink)" : "transparent",
                  color: active ? "var(--plt-bg)" : "var(--plt-ink-soft)",
                }}
              >
                {o.label}
                {o.value === "year" && copy.saveBadge ? (
                  <span
                    className="rounded-full px-2 py-0.5 text-[0.75rem] font-semibold"
                    style={{
                      background: active
                        ? "rgba(241,237,227,0.18)"
                        : "rgba(31,74,58,0.12)",
                      color: active ? "var(--plt-bg)" : "var(--plt-forest)",
                    }}
                  >
                    {copy.saveBadge}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      </div>
      {children}
    </div>
  );
}
