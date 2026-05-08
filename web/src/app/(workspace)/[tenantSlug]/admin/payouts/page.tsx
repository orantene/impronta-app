/**
 * Phase 8 — canonical Stripe Connect (Payouts) settings page.
 * Server Component — see `payouts-actions-client.tsx` for the interactive
 * Connect / Refresh / Manage / Disconnect buttons.
 *
 * Capability gate: agency.workspace.edit (admin-only). Reads its own snapshot
 * via the persisted columns (no Stripe round-trip on render). Hits Stripe
 * only when the user clicks an action.
 */

import { notFound } from "next/navigation";
import { getTenantScopeBySlug } from "@/lib/saas/scope";
import { userHasCapability } from "@/lib/access";
import { getConnectedAccountSnapshot, type ConnectedAccountStatus } from "@/lib/payments/stripe-connect";
import { PayoutsActionsClient } from "./payouts-actions-client";

export const dynamic = "force-dynamic";

type PageParams = Promise<{ tenantSlug: string }>;

const C = {
  ink:        "#0B0B0D",
  inkMuted:   "rgba(11,11,13,0.55)",
  inkDim:     "rgba(11,11,13,0.35)",
  border:     "rgba(24,24,27,0.08)",
  borderSoft: "rgba(24,24,27,0.06)",
  cardBg:     "#ffffff",
  surface:    "rgba(11,11,13,0.02)",
  accent:     "#0F4F3E",
  green:      "#2E7D5B",
  greenSoft:  "rgba(46,125,91,0.10)",
  amber:      "#9C6B14",
  amberSoft:  "rgba(214,158,46,0.12)",
  coral:      "#B0303A",
  coralSoft:  "rgba(176,48,58,0.10)",
} as const;

const FONT = '"Inter", system-ui, sans-serif';

function StatusPill({ status, charges, payouts }: {
  status: ConnectedAccountStatus;
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

export default async function PayoutsPage({ params }: { params: PageParams }) {
  const { tenantSlug } = await params;
  const scope = await getTenantScopeBySlug(tenantSlug);
  if (!scope) notFound();

  const canEdit = await userHasCapability(scope.tenantId, "agency.workspace.edit");
  if (!canEdit) notFound();

  const snap = await getConnectedAccountSnapshot(tenantSlug);
  if (!snap.ok) {
    return (
      <main style={{ padding: "32px 24px", fontFamily: FONT, maxWidth: 720, margin: "0 auto" }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: C.ink, margin: "0 0 8px" }}>
          Payouts
        </h1>
        <p style={{ color: C.coral, fontSize: 13 }}>
          Couldn&apos;t load Stripe status: {snap.error}
        </p>
      </main>
    );
  }
  const { stripeAccountId, status, chargesEnabled, payoutsEnabled, detailsSubmitted, syncedAt } = snap.data;

  return (
    <main style={{
      padding: "32px 24px 64px",
      fontFamily: FONT,
      maxWidth: 720,
      margin: "0 auto",
      color: C.ink,
    }}>
      <header style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, margin: "0 0 6px" }}>
          Payouts
        </h1>
        <p style={{ fontSize: 13, color: C.inkMuted, margin: 0, lineHeight: 1.5 }}>
          Connect a Stripe account to receive payments from clients directly. Funds settle to
          your bank account; the platform takes a small fee per transaction.
        </p>
      </header>

      <section style={{
        background: C.cardBg,
        border: `1px solid ${C.border}`,
        borderRadius: 12,
        padding: 20,
        marginBottom: 16,
      }}>
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
              {stripeAccountId ? (
                <>Account: <code style={{ fontSize: 11 }}>{stripeAccountId}</code></>
              ) : "No Stripe account connected"}
            </div>
          </div>
          <StatusPill status={status} charges={chargesEnabled} payouts={payoutsEnabled} />
        </div>

        {stripeAccountId && (
          <div style={{ marginTop: 8 }}>
            <CapabilityRow label="Onboarding submitted" on={detailsSubmitted} />
            <CapabilityRow label="Card charges enabled" on={chargesEnabled} />
            <CapabilityRow label="Payouts to bank enabled" on={payoutsEnabled} />
          </div>
        )}

        <div style={{
          fontSize: 11,
          color: C.inkDim,
          marginTop: 12,
          paddingTop: 12,
          borderTop: `1px solid ${C.borderSoft}`,
        }}>
          Last synced: {formatSyncedAt(syncedAt)}
        </div>
      </section>

      <section style={{ marginBottom: 24 }}>
        <PayoutsActionsClient
          tenantSlug={tenantSlug}
          status={status}
          hasAccount={!!stripeAccountId}
          chargesEnabled={chargesEnabled}
          payoutsEnabled={payoutsEnabled}
        />
      </section>

      <section style={{
        background: C.surface,
        border: `1px solid ${C.borderSoft}`,
        borderRadius: 10,
        padding: 16,
        fontSize: 12,
        color: C.inkMuted,
        lineHeight: 1.6,
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
    </main>
  );
}
