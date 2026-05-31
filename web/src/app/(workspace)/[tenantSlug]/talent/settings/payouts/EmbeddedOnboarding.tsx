"use client";

/**
 * Tulala-branded EMBEDDED Stripe Connect onboarding for talent payouts.
 *
 * Renders `<ConnectAccountOnboarding>` (from @stripe/react-connect-js)
 * inline on the talent payouts page, themed with the Tulala Appearance
 * (deep green, Inter) so the talent completes KYC + bank linking without
 * ever leaving for stripe.com. Replaces the old hosted `account_onboarding`
 * Account Link redirect.
 *
 * The Connect instance is initialised in an effect (client-only) — the
 * SDK touches `window`, so it must never run during SSR. The account is
 * lazily created the first time the SDK calls `fetchClientSecret`
 * (→ `createTalentAccountSession`), so no Stripe account exists until the
 * talent actually starts onboarding here.
 */

import { useEffect, useState } from "react";
// `pure` entrypoint: doesn't auto-inject Connect.js on import, so it stays
// quiet during SSR of this client component (the default import logs a
// benign "can't load in SSR" error). We init explicitly in an effect below.
import { loadConnectAndInitialize } from "@stripe/connect-js/pure";
import {
  ConnectAccountOnboarding,
  ConnectComponentsProvider,
} from "@stripe/react-connect-js";

type StripeConnectInstance = ReturnType<typeof loadConnectAndInitialize>;
import { TULALA_CONNECT_APPEARANCE } from "@/lib/payments/connect-appearance";
import { createTalentAccountSession } from "./actions";

const C = {
  ink: "#0B0B0D",
  inkMuted: "rgba(11,11,13,0.55)",
  coral: "#A33A3A",
  coralSoft: "rgba(214,89,89,0.10)",
  surfaceAlt: "rgba(11,11,13,0.025)",
} as const;

export function EmbeddedOnboarding({ onExit }: { onExit?: () => void }) {
  const publishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
  const [connectInstance, setConnectInstance] =
    useState<StripeConnectInstance | null>(null);
  const [initError, setInitError] = useState<string | null>(null);

  useEffect(() => {
    if (!publishableKey) {
      setInitError("Payouts are not available right now.");
      return;
    }
    try {
      const instance = loadConnectAndInitialize({
        publishableKey,
        fetchClientSecret: async () => {
          const r = await createTalentAccountSession();
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
        data-testid="talent-embedded-onboarding-error"
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
        data-testid="talent-embedded-onboarding-loading"
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
    <div data-testid="talent-embedded-onboarding">
      <ConnectComponentsProvider connectInstance={connectInstance}>
        <ConnectAccountOnboarding onExit={() => onExit?.()} />
      </ConnectComponentsProvider>
      <div
        style={{
          marginTop: 10,
          fontSize: 11,
          color: C.inkMuted,
          textAlign: "center",
        }}
      >
        Banking &amp; identity verification secured by Stripe.
      </div>
    </div>
  );
}
