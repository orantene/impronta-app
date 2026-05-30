/**
 * Phase 8 — canonical Stripe Connect (Payouts) settings page.
 * Server Component — see `payouts-actions-client.tsx` for the interactive
 * Connect / Refresh / Manage / Disconnect buttons.
 *
 * Capability gate: agency.payout_account.manage (owner-level). Reads its own snapshot
 * via the persisted columns (no Stripe round-trip on render). Hits Stripe
 * only when the user clicks an action.
 */

import { notFound } from "next/navigation";
import { getTenantScopeBySlug } from "@/lib/saas/scope";
import { userHasCapability } from "@/lib/access";
import { getConnectedAccountSnapshot, type ConnectAccountStatus } from "@/lib/payments/stripe-connect";
import { PayoutsActionsClient } from "./payouts-actions-client";
import { BaseFeeClient } from "./base-fee-client";
import { loadWorkspaceBaseFee } from "./base-fee-actions";
import { getRequestLocale } from "@/i18n/request-locale";
import { createTranslator } from "@/i18n/messages";

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

function StatusPill({ status, charges, payouts, t }: {
  status: ConnectAccountStatus;
  charges: boolean;
  payouts: boolean;
  t: (k: string) => string;
}) {
  let label: string;
  let bg: string;
  let fg: string;
  if (status === "enabled" && charges && payouts) {
    label = t("admin.payouts.statusActive");
    bg = C.greenSoft;
    fg = C.green;
  } else if (status === "pending") {
    label = t("admin.payouts.statusPending");
    bg = C.amberSoft;
    fg = C.amber;
  } else if (status === "restricted") {
    label = t("admin.payouts.statusRestricted");
    bg = C.coralSoft;
    fg = C.coral;
  } else if (status === "disabled") {
    label = t("admin.payouts.statusDisabled");
    bg = C.coralSoft;
    fg = C.coral;
  } else {
    label = t("admin.payouts.statusNotConnected");
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

function CapabilityRow({ label, on, t }: { label: string; on: boolean; t: (k: string) => string }) {
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
        {on ? t("admin.payouts.capEnabled") : t("admin.payouts.capNotYet")}
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

  // Capability gate: managing payout settings is owner-level (same capability
  // the Connect onboarding action uses). NOTE: signature is
  // userHasCapability(capability, tenantId) — passing them in the wrong order,
  // or using an unregistered key, silently denies everyone.
  const canEdit = await userHasCapability("agency.payout_account.manage", scope.tenantId);
  if (!canEdit) notFound();

  const locale = await getRequestLocale();
  const t = createTranslator(locale);

  const baseFee = await loadWorkspaceBaseFee(tenantSlug);
  const snap = await getConnectedAccountSnapshot(tenantSlug);
  if (!snap.ok) {
    return (
      <div style={{ minHeight: "100vh", background: "#FAFAF7" }}>
      <main style={{ padding: "32px 24px", fontFamily: FONT, maxWidth: 720, margin: "0 auto" }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: C.ink, margin: "0 0 8px" }}>
          {t("admin.payouts.title")}
        </h1>
        <p style={{ color: C.coral, fontSize: 13 }}>
          {t("admin.payouts.loadError")}: {snap.error}
        </p>
      </main>
      </div>
    );
  }
  const { stripeAccountId, status, chargesEnabled, payoutsEnabled, detailsSubmitted, syncedAt } = snap.data;

  return (
    <div style={{ minHeight: "100vh", background: "#FAFAF7" }}>
    <main style={{
      padding: "32px 24px 64px",
      fontFamily: FONT,
      maxWidth: 720,
      margin: "0 auto",
      color: C.ink,
    }}>
      <header className="mb-6">
        <h1 style={{ fontSize: 24, fontWeight: 700, margin: "0 0 6px" }}>
          {t("admin.payouts.title")}
        </h1>
        <p style={{ fontSize: 13, color: C.inkMuted, margin: 0, lineHeight: 1.5 }}>
          {t("admin.payouts.description")}
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
              {t("admin.payouts.accountStatus")}
            </div>
            <div style={{ fontSize: 11, color: C.inkDim, marginTop: 2 }}>
              {stripeAccountId ? (
                <>{t("admin.payouts.accountStatus")}: <code style={{ fontSize: 11 }}>{stripeAccountId}</code></>
              ) : t("admin.payouts.noAccount")}
            </div>
          </div>
          <StatusPill status={status} charges={chargesEnabled} payouts={payoutsEnabled} t={t} />
        </div>

        {stripeAccountId && (
          <div className="mt-2">
            <CapabilityRow label={t("admin.payouts.onboardingSubmitted")} on={detailsSubmitted} t={t} />
            <CapabilityRow label={t("admin.payouts.chargesEnabled")} on={chargesEnabled} t={t} />
            <CapabilityRow label={t("admin.payouts.payoutsEnabled")} on={payoutsEnabled} t={t} />
          </div>
        )}

        <div style={{
          fontSize: 11,
          color: C.inkDim,
          marginTop: 12,
          paddingTop: 12,
          borderTop: `1px solid ${C.borderSoft}`,
        }}>
          {t("admin.payouts.lastSynced")}: {formatSyncedAt(syncedAt)}
        </div>
      </section>

      <section className="mb-6">
        <PayoutsActionsClient
          tenantSlug={tenantSlug}
          status={status}
          hasAccount={!!stripeAccountId}
          chargesEnabled={chargesEnabled}
          payoutsEnabled={payoutsEnabled}
          locale={locale}
        />
      </section>

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
      }}>
        <div style={{ fontWeight: 600, color: C.ink, marginBottom: 6, fontSize: 13 }}>
          {t("admin.payouts.howItWorksTitle")}
        </div>
        <ul style={{ margin: 0, paddingLeft: 18 }}>
          <li>{t("admin.payouts.howItWorks1")}</li>
          <li>{t("admin.payouts.howItWorks2")}</li>
          <li>{t("admin.payouts.howItWorks3")}</li>
          <li>{t("admin.payouts.howItWorks4")}</li>
        </ul>
      </section>
    </main>
    </div>
  );
}
