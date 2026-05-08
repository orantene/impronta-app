"use client";

/**
 * Action buttons for the Payouts page. Pure-client component because each
 * button kicks off a server action and a redirect / refresh.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  getConnectOnboardingLinkAction,
  getConnectDashboardLinkAction,
  refreshConnectStatusAction,
  disconnectStripeAccountAction,
} from "@/lib/server-actions/admin-stripe-connect";
import type { ConnectAccountStatus } from "@/lib/payments/stripe-connect";

const C = {
  ink:        "#0B0B0D",
  inkMuted:   "rgba(11,11,13,0.55)",
  border:     "rgba(24,24,27,0.08)",
  accent:     "#0F4F3E",
  coral:      "#B0303A",
} as const;

const FONT = '"Inter", system-ui, sans-serif';

function primaryBtn(disabled: boolean) {
  return {
    padding: "10px 18px",
    borderRadius: 8,
    border: "none",
    background: C.accent,
    color: "#fff",
    fontFamily: FONT,
    fontSize: 13,
    fontWeight: 600,
    cursor: disabled ? "wait" : "pointer",
    opacity: disabled ? 0.6 : 1,
  } as const;
}

function ghostBtn(disabled: boolean, danger?: boolean) {
  return {
    padding: "10px 18px",
    borderRadius: 8,
    border: `1px solid ${danger ? C.coral : C.border}`,
    background: "transparent",
    color: danger ? C.coral : C.ink,
    fontFamily: FONT,
    fontSize: 13,
    fontWeight: 600,
    cursor: disabled ? "wait" : "pointer",
    opacity: disabled ? 0.6 : 1,
  } as const;
}

export function PayoutsActionsClient({
  tenantSlug,
  status,
  hasAccount,
  chargesEnabled,
  payoutsEnabled,
}: {
  tenantSlug: string;
  status: ConnectAccountStatus;
  hasAccount: boolean;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const fullyEnabled = status === "enabled" && chargesEnabled && payoutsEnabled;

  const onConnect = () => {
    setError(null); setInfo(null);
    startTransition(async () => {
      const r = await getConnectOnboardingLinkAction(tenantSlug);
      if (!r.ok) { setError(r.error); return; }
      window.location.assign(r.data.url);
    });
  };

  const onResume = onConnect; // same flow — Stripe re-uses the in-progress account.

  const onManage = () => {
    setError(null); setInfo(null);
    startTransition(async () => {
      const r = await getConnectDashboardLinkAction(tenantSlug);
      if (!r.ok) { setError(r.error); return; }
      window.open(r.data.url, "_blank", "noopener,noreferrer");
    });
  };

  const onRefresh = () => {
    setError(null); setInfo(null);
    startTransition(async () => {
      const r = await refreshConnectStatusAction(tenantSlug);
      if (!r.ok) { setError(r.error); return; }
      setInfo("Status refreshed.");
      router.refresh();
    });
  };

  const onDisconnect = () => {
    if (!window.confirm("Disconnect Stripe? Future client payments will route to the platform account again until you reconnect. Your Stripe account is NOT deleted.")) {
      return;
    }
    setError(null); setInfo(null);
    startTransition(async () => {
      const r = await disconnectStripeAccountAction(tenantSlug);
      if (!r.ok) { setError(r.error); return; }
      setInfo("Disconnected.");
      router.refresh();
    });
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, fontFamily: FONT }}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {!hasAccount && (
          <button type="button" onClick={onConnect} disabled={pending} style={primaryBtn(pending)}>
            {pending ? "Loading…" : "Connect Stripe"}
          </button>
        )}

        {hasAccount && !fullyEnabled && (
          <button type="button" onClick={onResume} disabled={pending} style={primaryBtn(pending)}>
            {pending ? "Loading…" : "Continue onboarding"}
          </button>
        )}

        {hasAccount && fullyEnabled && (
          <button type="button" onClick={onManage} disabled={pending} style={primaryBtn(pending)}>
            {pending ? "Loading…" : "Manage on Stripe"}
          </button>
        )}

        {hasAccount && (
          <button type="button" onClick={onRefresh} disabled={pending} style={ghostBtn(pending)}>
            {pending ? "…" : "Refresh status"}
          </button>
        )}

        {hasAccount && (
          <button type="button" onClick={onDisconnect} disabled={pending} style={ghostBtn(pending, true)}>
            Disconnect
          </button>
        )}
      </div>

      {error && (
        <div style={{ fontSize: 12, color: C.coral }}>
          {error}
        </div>
      )}
      {info && !error && (
        <div style={{ fontSize: 12, color: C.inkMuted }}>
          {info}
        </div>
      )}
    </div>
  );
}
