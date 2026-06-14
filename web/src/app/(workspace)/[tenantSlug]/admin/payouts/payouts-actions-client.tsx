"use client";

/**
 * Action buttons for the Payouts page. Pure-client component because each
 * button kicks off a server action and a redirect / refresh.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ensureWorkspacePayoutAccount,
  getConnectAccountSessionAction,
  getConnectDashboardLinkAction,
  refreshConnectStatusAction,
  disconnectStripeAccountAction,
} from "@/lib/server-actions/admin-stripe-connect";
import type { ConnectAccountStatus } from "@/lib/payments/stripe-connect";
import { ConnectEmbeddedOnboarding } from "@/components/payments/ConnectEmbeddedOnboarding";
import { PAYOUT_COUNTRIES, CONNECT_PAYOUT_COUNTRIES } from "@/lib/payments/payout-countries";

// The agency payout leg is always Stripe Connect, so the workspace country
// picker must only offer Connect-supported countries (US/UK/CA/CH + EEA).
// Previously it showed the full PAYOUT_COUNTRIES list incl. MX/AR/BR, letting an
// admin pick a country Stripe rejects at accounts.create with a confusing error.
const CONNECT_COUNTRY_OPTIONS = PAYOUT_COUNTRIES.filter((c) => CONNECT_PAYOUT_COUNTRIES.has(c.iso2));
import { createTranslator } from "@/i18n/messages";

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
  locale = "en",
}: {
  tenantSlug: string;
  status: ConnectAccountStatus;
  hasAccount: boolean;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  locale?: string;
}) {
  const t = createTranslator(locale);
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [picking, setPicking] = useState(false);
  const [country, setCountry] = useState("");

  const fullyEnabled = status === "enabled" && chargesEnabled && payoutsEnabled;

  // First-time connect: pick the payout country (it's immutable), then mount
  // the inline embedded onboarding. Resuming an existing account skips the
  // picker (the country is already locked).
  const onConnect = () => {
    setError(null); setInfo(null);
    if (hasAccount) { setShowOnboarding(true); return; }
    setPicking(true);
  };

  const onResume = () => {
    setError(null); setInfo(null);
    setShowOnboarding(true);
  };

  const onSubmitCountry = () => {
    if (!country) { setError("Please choose where you'll receive payouts."); return; }
    setError(null); setInfo(null);
    startTransition(async () => {
      const r = await ensureWorkspacePayoutAccount(tenantSlug, { country });
      if (r.ok) { setPicking(false); setShowOnboarding(true); return; }
      setError("error" in r ? r.error : "Could not start payout setup.");
    });
  };

  // Re-pull status from Stripe after the embedded flow exits — ALWAYS collapse
  // back so the admin isn't left on a stranded exited iframe.
  const onOnboardingExit = () => {
    setShowOnboarding(false);
    startTransition(async () => {
      await refreshConnectStatusAction(tenantSlug);
      router.refresh();
    });
  };

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
      setInfo(t("admin.payouts.actions.refreshed"));
      router.refresh();
    });
  };

  const onDisconnect = () => {
    if (!window.confirm(t("admin.payouts.actions.disconnectConfirm"))) {
      return;
    }
    setError(null); setInfo(null);
    startTransition(async () => {
      const r = await disconnectStripeAccountAction(tenantSlug);
      if (!r.ok) { setError(r.error); return; }
      setInfo(t("admin.payouts.actions.disconnected"));
      router.refresh();
    });
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, fontFamily: FONT }}>
      <div className="flex gap-2 flex-wrap">
        {!hasAccount && (
          <button type="button" onClick={onConnect} disabled={pending} style={primaryBtn(pending)}>
            {pending ? t("admin.payouts.actions.loading") : t("admin.payouts.actions.connectStripe")}
          </button>
        )}

        {hasAccount && !fullyEnabled && (
          <button type="button" onClick={onResume} disabled={pending} style={primaryBtn(pending)}>
            {pending ? t("admin.payouts.actions.loading") : t("admin.payouts.actions.continueOnboarding")}
          </button>
        )}

        {hasAccount && fullyEnabled && (
          <button type="button" onClick={onManage} disabled={pending} style={primaryBtn(pending)}>
            {pending ? t("admin.payouts.actions.loading") : t("admin.payouts.actions.manageOnStripe")}
          </button>
        )}

        {hasAccount && (
          <button type="button" onClick={onRefresh} disabled={pending} style={ghostBtn(pending)}>
            {pending ? "…" : t("admin.payouts.actions.refreshStatus")}
          </button>
        )}

        {hasAccount && (
          <button type="button" onClick={onDisconnect} disabled={pending} style={ghostBtn(pending, true)}>
            {t("admin.payouts.actions.disconnect")}
          </button>
        )}
      </div>

      {picking && !showOnboarding && (
        <div style={{ marginTop: 4, maxWidth: 360 }}>
          <label htmlFor="ws-payout-country" style={{ display: "block", fontSize: 12.5, fontWeight: 600, color: C.ink, marginBottom: 6 }}>
            Where will this workspace receive payouts?
          </label>
          <select
            id="ws-payout-country"
            value={country}
            onChange={(e) => setCountry(e.target.value)}
            style={{
              width: "100%", padding: "10px 12px", borderRadius: 8,
              border: `1px solid ${C.border}`, fontFamily: FONT, fontSize: 13,
              color: C.ink, background: "#fff", marginBottom: 12,
            }}
          >
            <option value="">Select your country…</option>
            {CONNECT_COUNTRY_OPTIONS.map((c) => (
              <option key={c.iso2} value={c.iso2}>{c.flag} {c.label}</option>
            ))}
          </select>
          <div className="flex gap-2">
            <button type="button" onClick={onSubmitCountry} disabled={pending} style={primaryBtn(pending)}>
              {pending ? t("admin.payouts.actions.loading") : "Continue"}
            </button>
            <button type="button" onClick={() => { setPicking(false); setError(null); }} style={ghostBtn(false)}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {showOnboarding && !fullyEnabled && (
        <div style={{ marginTop: 4 }}>
          <ConnectEmbeddedOnboarding
            fetchClientSecret={async () => {
              const r = await getConnectAccountSessionAction(tenantSlug, country ? { country } : {});
              return r.ok ? { ok: true, clientSecret: r.data.clientSecret } : r;
            }}
            onExit={onOnboardingExit}
          />
          <button
            type="button"
            onClick={onOnboardingExit}
            style={{ ...ghostBtn(false), marginTop: 12 }}
          >
            Done for now
          </button>
        </div>
      )}

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
