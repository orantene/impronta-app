"use client";

/**
 * PaymentsProvidersCard — Settings › Payments & providers (W21, money.md §2).
 *
 * READ-ONLY, ON PURPOSE. Every provider here is configured through
 * environment variables the platform manages (money.md §3 confirms POS card
 * collection is the platform Stripe account, never a per-workspace key), so
 * there is nothing this screen could let a workspace edit truthfully.
 * Offering a "Connect" button that could not do anything would be exactly
 * the control-that-cannot-work this settings surface exists to refuse.
 *
 * NEVER SHOWS A SECRET. `getPaymentProviderStatus` returns booleans and a
 * closed reason code — see `lib/payments/provider-status.ts`. Nothing this
 * component renders can leak a key even by accident.
 */

import { useEffect, useState } from "react";

import { useT } from "@/i18n/use-t";
import { getPaymentProviderStatus } from "@/lib/server-actions/payment-providers";
import { PROVIDER_IDS, type ProviderStatus } from "@/lib/payments/provider-status";

const K = "dashboard.adminWorkspace.paymentsProviders";

export function PaymentsProvidersCard() {
  const t = useT();
  const [providers, setProviders] = useState<ProviderStatus[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void getPaymentProviderStatus().then((res) => {
      if (cancelled) return;
      if (res.ok) setProviders(res.providers);
      else setError(res.error);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div data-testid="payments-providers-card" className="mb-2 rounded-admin-lg border border-admin-border-soft bg-admin-card p-4">
      {error ? (
        <div className="text-[11px] text-admin-critical">{error}</div>
      ) : providers === null ? (
        <div className="text-[11px] text-admin-ink-muted">{t(`${K}.loading`)}</div>
      ) : (
        <div className="flex flex-col gap-2">
          {PROVIDER_IDS.map((id) => {
            const status = providers.find((p) => p.id === id);
            if (!status) return null;
            return (
              <div
                key={id}
                className={`flex items-center justify-between gap-3 rounded-admin-md border p-3 ${
                  status.configured ? "border-admin-border bg-admin-surface" : "border-admin-border-soft bg-admin-card"
                }`}
              >
                <div className="min-w-0">
                  <div className="text-[13px] font-semibold text-admin-ink">{t(`${K}.providers.${id}.label`)}</div>
                  <div className="mt-0.5 text-[12px] text-admin-ink-muted">{t(`${K}.reasons.${status.reason}`)}</div>
                </div>
                <span
                  className={`shrink-0 text-[11px] font-semibold ${
                    status.configured ? "text-admin-success" : "text-admin-ink-muted"
                  }`}
                >
                  {status.configured ? t(`${K}.statusReady`) : t(`${K}.statusNeedsSetup`)}
                </span>
              </div>
            );
          })}
        </div>
      )}

      <div className="mt-3 text-[11px] leading-relaxed text-admin-ink-muted">{t(`${K}.secretsNote`)}</div>
    </div>
  );
}
