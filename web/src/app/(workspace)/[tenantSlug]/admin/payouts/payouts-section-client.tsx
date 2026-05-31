"use client";

/**
 * Payouts surface — client UI.
 *
 * The Payouts surface renders INSIDE the admin SPA shell now (via the
 * `PayoutsPage` page-module under `components/admin/shell`). That shell
 * directory is under a frozen `ratchet/no-new-inline-style` rule, so the
 * inline-styled markup lives HERE in the payouts route dir — alongside its
 * siblings `payouts-actions-client.tsx` / `base-fee-client.tsx`, which use
 * the same inline-style approach. The shell page-module is a thin wrapper
 * that resolves the tenant slug from context and renders this component.
 *
 * `tenantSlug` + the pre-fetched `surface` payload are passed in (the shell
 * reads both from `useAdminShell()`). Data + capability gate run server-side
 * in the admin layout's bridge `Promise.all` via `loadPayoutsSurface`; this
 * component is purely presentational — no client fetch, no loading state.
 *
 * i18n: the original standalone server page used the server `createTranslator`.
 * A client component can't read the server request locale the same way, so the
 * copy here is plain English matching the `admin.payouts.*` message catalog.
 * The embedded `PayoutsActionsClient` keeps its own translator (defaults "en").
 */

import type { ConnectAccountStatus } from "@/lib/payments/stripe-connect";
import { PayoutsActionsClient } from "./payouts-actions-client";
import { BaseFeeClient } from "./base-fee-client";
import type { PayoutsSurfaceData, PayoutsSurfaceResult } from "./payouts-surface-actions";

const C = {
  ink:        "#0B0B0D",
  inkMuted:   "rgba(11,11,13,0.55)",
  inkDim:     "rgba(11,11,13,0.35)",
  border:     "rgba(24,24,27,0.08)",
  borderSoft: "rgba(24,24,27,0.06)",
  cardBg:     "#ffffff",
  surface:    "rgba(11,11,13,0.02)",
  green:      "#2E7D5B",
  greenSoft:  "rgba(46,125,91,0.10)",
  amber:      "#9C6B14",
  amberSoft:  "rgba(214,158,46,0.12)",
  coral:      "#B0303A",
  coralSoft:  "rgba(176,48,58,0.10)",
} as const;

const FONT = '"Inter", system-ui, sans-serif';

function StatusPill({ status, charges, payouts }: {
  status: ConnectAccountStatus;
  charges: boolean;
  payouts: boolean;
}) {
  let label: string;
  let bg: string;
  let fg: string;
  if (status === "enabled" && charges && payouts) {
    label = "Active";
    bg = C.greenSoft;
    fg = C.green;
  } else if (status === "pending") {
    label = "Onboarding incomplete";
    bg = C.amberSoft;
    fg = C.amber;
  } else if (status === "restricted") {
    label = "Restricted";
    bg = C.coralSoft;
    fg = C.coral;
  } else if (status === "disabled") {
    label = "Disabled";
    bg = C.coralSoft;
    fg = C.coral;
  } else {
    label = "Not connected";
    bg = "rgba(11,11,13,0.06)";
    fg = C.inkMuted;
  }
  return (
    <span style={{
      display: "inline-block",
      fontSize: 11,
      fontWeight: 600,
      letterSpacing: 0.3,
      padding: "3px 10px",
      borderRadius: 999,
      background: bg,
      color: fg,
    }}>
      {label}
    </span>
  );
}

function CapabilityRow({ label, on }: { label: string; on: boolean }) {
  return (
    <div style={{
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      padding: "8px 0",
      borderBottom: `1px solid ${C.borderSoft}`,
      fontSize: 13,
    }}>
      <span style={{ color: C.ink }}>{label}</span>
      <span style={{
        fontSize: 11,
        fontWeight: 600,
        color: on ? C.green : C.inkDim,
      }}>
        {on ? "Enabled" : "Not yet"}
      </span>
    </div>
  );
}

function formatSyncedAt(iso: string | null): string {
  if (!iso) return "Never";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "Unknown";
  return d.toLocaleString();
}

export function PayoutsSectionClient({
  tenantSlug,
  surface,
}: {
  tenantSlug: string;
  surface: PayoutsSurfaceResult | null;
}) {
  return (
    <div style={{ fontFamily: FONT, maxWidth: 720, margin: "0 auto", color: C.ink }}>
      <header style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, margin: "0 0 6px" }}>Payouts</h1>
        <p style={{ fontSize: 13, color: C.inkMuted, margin: 0, lineHeight: 1.5 }}>
          Connect a Stripe account to receive payments from clients directly. Funds settle to your
          bank account; the platform takes a small fee per transaction.
        </p>
      </header>

      {surface == null || surface.ok === false ? (
        <div style={{
          background: C.cardBg,
          border: `1px solid ${C.border}`,
          borderRadius: 12,
          padding: 20,
        }}>
          <p style={{ color: C.coral, fontSize: 13, margin: 0 }}>
            {surface && surface.ok === false ? surface.error : "Couldn't load payout settings."}
          </p>
        </div>
      ) : (
        <PayoutsBody tenantSlug={tenantSlug} data={surface.data} />
      )}
    </div>
  );
}

function PayoutsBody({ tenantSlug, data }: { tenantSlug: string; data: PayoutsSurfaceData }) {
  const { connect, baseFee } = data;

  return (
    <>
      <section style={{
        background: C.cardBg,
        border: `1px solid ${C.border}`,
        borderRadius: 12,
        padding: 20,
        marginBottom: 16,
      }}>
        {connect.ok ? (
          <>
            <div style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
              marginBottom: 12,
            }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 600, color: C.ink }}>
                  Stripe account status
                </div>
                <div style={{ fontSize: 11, color: C.inkDim, marginTop: 2 }}>
                  {connect.data.stripeAccountId ? (
                    <>Stripe account status: <code style={{ fontSize: 11 }}>{connect.data.stripeAccountId}</code></>
                  ) : "No Stripe account connected"}
                </div>
              </div>
              <StatusPill
                status={connect.data.status}
                charges={connect.data.chargesEnabled}
                payouts={connect.data.payoutsEnabled}
              />
            </div>

            {connect.data.stripeAccountId && (
              <div style={{ marginTop: 8 }}>
                <CapabilityRow label="Onboarding submitted" on={connect.data.detailsSubmitted} />
                <CapabilityRow label="Card charges enabled" on={connect.data.chargesEnabled} />
                <CapabilityRow label="Payouts to bank enabled" on={connect.data.payoutsEnabled} />
              </div>
            )}

            <div style={{
              fontSize: 11,
              color: C.inkDim,
              marginTop: 12,
              paddingTop: 12,
              borderTop: `1px solid ${C.borderSoft}`,
            }}>
              Last synced: {formatSyncedAt(connect.data.syncedAt)}
            </div>
          </>
        ) : (
          <>
            <div style={{ fontSize: 14, fontWeight: 600, color: C.ink, marginBottom: 6 }}>
              Stripe account status
            </div>
            <p style={{ color: C.coral, fontSize: 13, margin: 0 }}>
              Couldn&apos;t load Stripe status: {connect.error}
            </p>
          </>
        )}
      </section>

      {connect.ok && (
        <section style={{ marginBottom: 24 }}>
          <PayoutsActionsClient
            tenantSlug={tenantSlug}
            status={connect.data.status}
            hasAccount={!!connect.data.stripeAccountId}
            chargesEnabled={connect.data.chargesEnabled}
            payoutsEnabled={connect.data.payoutsEnabled}
          />
        </section>
      )}

      {baseFee.ok && (
        <BaseFeeClient tenantSlug={tenantSlug} initial={baseFee.data} />
      )}

      <section style={{
        background: C.surface,
        border: `1px solid ${C.borderSoft}`,
        borderRadius: 10,
        padding: 16,
        fontSize: 12,
        color: C.inkMuted,
        lineHeight: 1.6,
        marginTop: 16,
      }}>
        <div style={{ fontWeight: 600, color: C.ink, marginBottom: 6, fontSize: 13 }}>
          How payouts work
        </div>
        <ul style={{ margin: 0, paddingLeft: 18 }}>
          <li>Once connected, all client payments through your workspace route directly to your Stripe account.</li>
          <li>Stripe handles the legal / KYC dance. You manage your bank account from the Stripe dashboard.</li>
          <li>Payouts run on Stripe&apos;s default schedule (typically 2–7 days for new accounts).</li>
          <li>Disconnecting clears the binding here; it does not delete your Stripe account.</li>
        </ul>
      </section>
    </>
  );
}
