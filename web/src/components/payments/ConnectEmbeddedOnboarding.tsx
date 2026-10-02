"use client";

/**
 * Tulala-branded EMBEDDED Stripe Connect onboarding — shared by talent
 * (`/talent/settings/payouts`) and workspace (`/[tenant]/admin/payouts`)
 * payout setup. Renders `<ConnectAccountOnboarding>` inline, themed with the
 * Tulala Appearance, so the recipient completes KYC + bank linking without
 * ever leaving for stripe.com. Replaces the hosted `account_onboarding`
 * Account Link redirect.
 *
 * The Connect instance is initialised in an effect (client-only) — the SDK
 * touches `window`, so it must never run during SSR (we use the `pure`
 * entrypoint to avoid the import-time side effect too). The caller supplies
 * `fetchClientSecret`, which the SDK invokes to mint an Account Session; the
 * underlying Express account is created lazily at that point.
 *
 * The first session is minted BEFORE the Connect instance: its result names the
 * publishable key of the platform that owns the account (US or MX), and the
 * instance must be initialised with that key. That first secret is handed to
 * the SDK's first fetch; later fetches mint fresh sessions.
 */

import { useEffect, useRef, useState } from "react";
import { loadConnectAndInitialize } from "@stripe/connect-js/pure";
import {
  ConnectAccountOnboarding,
  ConnectComponentsProvider,
} from "@stripe/react-connect-js";
import { TULALA_CONNECT_APPEARANCE } from "@/lib/payments/connect-appearance";
import { useDashboardLocale } from "@/i18n/use-dashboard-locale";
import { stripeConnectLocale } from "@/lib/payments/connect-locale";

type StripeConnectInstance = ReturnType<typeof loadConnectAndInitialize>;

/** Mints an Account Session client secret server-side (a "use server" action). */
export type AccountSessionFetch = () => Promise<
  { ok: true; clientSecret: string; publishableKey?: string | null } | { ok: false; error: string }
>;

const C = {
  ink: "#0B0B0D",
  inkMuted: "rgba(11,11,13,0.55)",
  coral: "#A33A3A",
  coralSoft: "rgba(214,89,89,0.10)",
  surfaceAlt: "rgba(11,11,13,0.025)",
} as const;

export function ConnectEmbeddedOnboarding({
  fetchClientSecret,
  onExit,
}: {
  fetchClientSecret: AccountSessionFetch;
  onExit?: () => void;
}) {
  const defaultPublishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
  const [connectInstance, setConnectInstance] =
    useState<StripeConnectInstance | null>(null);
  const [initError, setInitError] = useState<string | null>(null);
  // Render Stripe's KYC in the talent's own language. The cookie is only read
  // after hydration, so this is "en" on the very first client render; the
  // instance is created in an effect that depends on it, so the FIRST real
  // init already carries the resolved locale.
  const dashboardLocale = useDashboardLocale();

  // Keep the latest fetcher in a ref so the Connect instance is created ONCE
  // (callers may pass an inline `fetchClientSecret`; depending on its identity
  // would re-init — and remount the iframe — on every render).
  const fetchRef = useRef(fetchClientSecret);
  useEffect(() => {
    fetchRef.current = fetchClientSecret;
  });

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const first = await fetchRef.current();
        if (cancelled) return;
        if (!first.ok) {
          setInitError(first.error);
          return;
        }
        // The account's own platform key (MX accounts need the MX key). Only an
        // ABSENT field falls back to the US key; an explicit null (MX key not
        // set) refuses rather than opening an MX session with the US key.
        const publishableKey =
          first.publishableKey === undefined ? defaultPublishableKey : first.publishableKey;
        if (!publishableKey) {
          setInitError("Payouts are not available right now.");
          return;
        }
        let prefetched: string | null = first.clientSecret;
        const locale = stripeConnectLocale(dashboardLocale);
        const instance = loadConnectAndInitialize({
          publishableKey,
          fetchClientSecret: async () => {
            if (prefetched) {
              const s = prefetched;
              prefetched = null;
              return s;
            }
            const r = await fetchRef.current();
            if (!r.ok) throw new Error(r.error);
            return r.clientSecret;
          },
          appearance: TULALA_CONNECT_APPEARANCE,
          ...(locale ? { locale } : {}),
        });
        setConnectInstance(instance);
      } catch {
        if (!cancelled) setInitError("Could not load payout setup. Please refresh and try again.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [defaultPublishableKey, dashboardLocale]);

  if (initError) {
    return (
      <div
        role="alert"
        data-testid="connect-embedded-onboarding-error"
        style={{
          padding: "12px 14px",
          background: C.coralSoft,
          color: C.coral,
          borderRadius: 10,
          fontSize: 12.5,
          lineHeight: 1.5,
        }}
      >
        {initError}
      </div>
    );
  }

  if (!connectInstance) {
    return (
      <div
        data-testid="connect-embedded-onboarding-loading"
        style={{
          padding: "20px 16px",
          background: C.surfaceAlt,
          borderRadius: 12,
          fontSize: 13,
          color: C.inkMuted,
          textAlign: "center",
        }}
      >
        Loading secure payout setup…
      </div>
    );
  }

  return (
    <div data-testid="connect-embedded-onboarding" data-tulala-privacy="block">
      <ConnectComponentsProvider connectInstance={connectInstance}>
        <ConnectAccountOnboarding onExit={() => onExit?.()} />
      </ConnectComponentsProvider>
      <div
        style={{
          marginTop: 14,
          fontSize: 11.5,
          lineHeight: 1.5,
          color: C.inkMuted,
          textAlign: "center",
        }}
      >
        Banking &amp; identity verification secured by Stripe.
      </div>
    </div>
  );
}
