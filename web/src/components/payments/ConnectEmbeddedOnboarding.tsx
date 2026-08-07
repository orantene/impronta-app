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
 */

import { useEffect, useRef, useState } from "react";
import { loadConnectAndInitialize } from "@stripe/connect-js/pure";
import {
  ConnectAccountOnboarding,
  ConnectComponentsProvider,
} from "@stripe/react-connect-js";
import { TULALA_CONNECT_APPEARANCE } from "@/lib/payments/connect-appearance";

type StripeConnectInstance = ReturnType<typeof loadConnectAndInitialize>;

/** Mints an Account Session client secret server-side (a "use server" action). */
export type AccountSessionFetch = () => Promise<
  { ok: true; clientSecret: string } | { ok: false; error: string }
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
  const publishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
  const [connectInstance, setConnectInstance] =
    useState<StripeConnectInstance | null>(null);
  const [initError, setInitError] = useState<string | null>(null);

  // Keep the latest fetcher in a ref so the Connect instance is created ONCE
  // (callers may pass an inline `fetchClientSecret`; depending on its identity
  // would re-init — and remount the iframe — on every render).
  const fetchRef = useRef(fetchClientSecret);
  useEffect(() => {
    fetchRef.current = fetchClientSecret;
  });

  useEffect(() => {
    if (!publishableKey) {
      setInitError("Payouts are not available right now.");
      return;
    }
    try {
      const instance = loadConnectAndInitialize({
        publishableKey,
        fetchClientSecret: async () => {
          const r = await fetchRef.current();
          if (!r.ok) throw new Error(r.error);
          return r.clientSecret;
        },
        appearance: TULALA_CONNECT_APPEARANCE,
      });
      setConnectInstance(instance);
    } catch {
      setInitError("Could not load payout setup. Please refresh and try again.");
    }
  }, [publishableKey]);

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
    <div data-testid="connect-embedded-onboarding">
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
