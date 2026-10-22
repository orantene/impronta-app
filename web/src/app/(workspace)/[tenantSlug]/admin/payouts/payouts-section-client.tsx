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
 * shell's own dictionary hook (`useDashboardText`) supplies the translation —
 * it reads the same dashboard-locale cookie the rest of the SPA does. Before
 * this, the surface rendered hard-coded English inside a Spanish workspace.
 * The embedded `PayoutsActionsClient` keeps its own translator (defaults "en").
 */

import { useDashboardText } from "@/components/admin/shell/internal/dashboard-i18n";
import { InfoTip } from "@/components/ui/info-tip";
import { useDashboardLocale } from "@/i18n/use-dashboard-locale";
import { createTranslator } from "@/i18n/messages";
import { formatDashboardMoney } from "@/lib/money/dashboard-money-format";
import type { ConnectAccountStatus } from "@/lib/payments/stripe-connect";
import { PayoutsActionsClient } from "./payouts-actions-client";
import { BaseFeeClient } from "./base-fee-client";
import { HeldPayoutsBanner } from "@/components/payments/HeldPayoutsBanner";
import type { PayoutsSurfaceData, PayoutsSurfaceResult } from "./payouts-surface-actions";

const C = {
  ink:        "#0B0B0D",
  inkMuted:   "rgba(11,11,13,0.55)",
  inkDim:     "rgba(11,11,13,0.6)",
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

function StatusPill({ status, charges, payouts, t }: {
  status: ConnectAccountStatus;
  charges: boolean;
  payouts: boolean;
  t: (key: string) => string;
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

function CapabilityRow({ label, on, t }: { label: string; on: boolean; t: (key: string) => string }) {
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

function formatSyncedAt(iso: string | null, locale: string, never: string): string {
  if (!iso) return never;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleString(locale.toLowerCase().startsWith("es") ? "es-MX" : "en-US");
}

export function PayoutsSectionClient({
  tenantSlug,
  surface,
}: {
  tenantSlug: string;
  surface: PayoutsSurfaceResult | null;
}) {
  // This surface renders inside the Spanish admin shell but was hard-coded
  // English, so a Spanish workspace saw an English page fronting an English
  // permission error. Route the chrome + the access-denied string through the
  // shell dictionary; server-side error strings that have no translation fall
  // through unchanged (`copy.t` is identity on a miss).
  const copy = useDashboardText();
  return (
    <div style={{ fontFamily: FONT, maxWidth: 720, margin: "0 auto", color: C.ink }}>
      <header style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, margin: "0 0 6px" }}>{copy.t("Payouts")}</h1>
        <p style={{ fontSize: 13, color: C.inkMuted, margin: 0, lineHeight: 1.5 }}>
          {copy.t(
            "Connect a Stripe account to receive payments from clients directly. Funds settle to your bank account; the platform takes a small fee per transaction.",
          )}
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
            {surface && surface.ok === false
              ? copy.t(surface.error)
              : copy.t("Couldn't load payout settings.")}
          </p>
        </div>
      ) : (
        <PayoutsBody tenantSlug={tenantSlug} data={surface.data} />
      )}
    </div>
  );
}

function PayoutsBody({ tenantSlug, data }: { tenantSlug: string; data: PayoutsSurfaceData }) {
  const { connect, baseFee, held, laneAttention, laneMismatch } = data;
  const copy = useDashboardText();
  const locale = useDashboardLocale();
  const tr = createTranslator(locale);
  const enabled = connect.ok && connect.data.status === "enabled" && connect.data.payoutsEnabled;

  return (
    <>
      {!enabled && <HeldPayoutsBanner held={held} audience="workspace" />}
      {laneMismatch ? (
        <div
          data-testid="lane-currency-mismatch"
          role="alert"
          style={{ marginBottom: 16, padding: "12px 14px", background: C.amberSoft, border: `1px solid ${C.border}`, borderRadius: 12 }}
        >
          <div style={{ fontSize: 13.5, fontWeight: 600, color: C.ink, lineHeight: 1.35 }}>
            {laneMismatch.lane === "us"
              ? copy.t("Your payments account (US) only charges in USD. Change the price to USD or connect a Mexico account.")
              : copy.t("Your payments account cannot charge some of your prices. Change them to MXN or USD.")}
          </div>
          <div style={{ fontSize: 12.5, color: C.inkMuted, marginTop: 4 }}>
            {copy.t("Guests cannot pay for these items online yet:")}
          </div>
          <ul style={{ margin: "6px 0 0", paddingLeft: 18, fontSize: 13, color: C.ink }}>
            {laneMismatch.items.slice(0, 10).map((item) => (
              <li key={item.id}>
                {item.title} ({item.currency})
              </li>
            ))}
            {laneMismatch.items.length > 10 ? <li>+{laneMismatch.items.length - 10}</li> : null}
          </ul>
        </div>
      ) : null}
      {(laneAttention ?? []).map((row) => {
        const amount = formatDashboardMoney(row.amountCents / 100, row.currency, locale, { wholeUnits: true });
        const where =
          row.lane === "mx"
            ? copy.t("Connect the business's payout account in Mexico to release {amount} held")
            : row.lane === "us"
              ? copy.t("Connect the business's payout account in the United States to release {amount} held")
              : copy.t("Connect the business's payout account to release {amount} held");
        return (
          <div
            key={`${row.lane}-${row.currency}`}
            data-testid="connect-lane-attention"
            role="status"
            style={{ marginBottom: 16, padding: "12px 14px", background: C.amberSoft, border: `1px solid ${C.border}`, borderRadius: 12, display: "flex", alignItems: "center", gap: 8 }}
          >
            <span style={{ fontSize: 13.5, fontWeight: 600, color: C.ink, lineHeight: 1.35 }}>{where.replace("{amount}", amount)}</span>
            <InfoTip
              label={copy.t("The payment was collected in a different country than this account. It is released automatically once the business connects its account there.")}
              triggerLabel={copy.t("More info")}
            />
          </div>
        );
      })}
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
                  {tr("admin.payouts.accountStatus")}
                </div>
                <div style={{ fontSize: 11, color: C.inkDim, marginTop: 2 }}>
                  {connect.data.stripeAccountId ? (
                    <code style={{ fontSize: 11 }}>{connect.data.stripeAccountId}</code>
                  ) : tr("admin.payouts.noAccount")}
                </div>
              </div>
              <StatusPill
                status={connect.data.status}
                charges={connect.data.chargesEnabled}
                payouts={connect.data.payoutsEnabled}
                t={tr}
              />
            </div>

            {connect.data.stripeAccountId && (
              <div style={{ marginTop: 8 }}>
                <CapabilityRow label={tr("admin.payouts.onboardingSubmitted")} on={connect.data.detailsSubmitted} t={tr} />
                <CapabilityRow label={tr("admin.payouts.chargesEnabled")} on={connect.data.chargesEnabled} t={tr} />
                <CapabilityRow label={tr("admin.payouts.payoutsEnabled")} on={connect.data.payoutsEnabled} t={tr} />
              </div>
            )}

            <div style={{
              fontSize: 11,
              color: C.inkDim,
              marginTop: 12,
              paddingTop: 12,
              borderTop: `1px solid ${C.borderSoft}`,
            }}>
              {tr("admin.payouts.lastSynced")}: {formatSyncedAt(connect.data.syncedAt, locale, tr("admin.payouts.never"))}
            </div>
          </>
        ) : (
          <>
            <div style={{ fontSize: 14, fontWeight: 600, color: C.ink, marginBottom: 6 }}>
              {tr("admin.payouts.accountStatus")}
            </div>
            <p style={{ color: C.coral, fontSize: 13, margin: 0 }}>
              {tr("admin.payouts.loadError")}: {copy.t(connect.error)}
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
            locale={locale}
          />
        </section>
      )}

      {baseFee.ok && (
        <BaseFeeClient tenantSlug={tenantSlug} initial={baseFee.data} locale={locale} />
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
          {tr("admin.payouts.howItWorksTitle")}
        </div>
        <ul style={{ margin: 0, paddingLeft: 18 }}>
          <li>{tr("admin.payouts.howItWorks1")}</li>
          <li>{tr("admin.payouts.howItWorks2")}</li>
          <li>{tr("admin.payouts.howItWorks3")}</li>
          <li>{tr("admin.payouts.howItWorks4")}</li>
        </ul>
      </section>
    </>
  );
}
