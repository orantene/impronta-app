// Phase 3.10 — Client Settings page.
// Profile info, notification preferences, and account management.

import { notFound } from "next/navigation";
import { getTenantScopeBySlug } from "@/lib/saas/scope";
import { getCachedActorSession } from "@/lib/server/request-cache";
import { loadClientSelfProfile, loadClientTrustBillingState } from "../../_data-bridge";
import { ClientTrustShell } from "./ClientTrustShell";
import { isStripeConfigured } from "@/lib/stripe/client";

export const dynamic = "force-dynamic";
type PageParams = Promise<{ tenantSlug: string }>;

const C = {
  ink:        "#0B0B0D",
  inkMuted:   "rgba(11,11,13,0.55)",
  inkDim:     "rgba(11,11,13,0.35)",
  borderSoft: "rgba(24,24,27,0.08)",
  cardBg:     "#ffffff",
  surface:    "rgba(11,11,13,0.02)",
  accent:     "#1D4ED8",
  accentSoft: "rgba(29,78,216,0.08)",
  blue:       "#2563EB",
  blueDeep:   "#1D4ED8",
} as const;

const FONT = '"Inter", system-ui, sans-serif';
const FONT_DISPLAY = 'var(--font-geist-sans), "Inter", -apple-system, system-ui, sans-serif';

function SettingRow({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 16,
        padding: "14px 0",
        borderBottom: `1px solid ${C.borderSoft}`,
        fontFamily: FONT,
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 500, color: C.ink }}>{label}</div>
        {hint && <div style={{ fontSize: 11.5, color: C.inkMuted, marginTop: 2 }}>{hint}</div>}
      </div>
      <div style={{ fontSize: 13, color: C.inkMuted, flexShrink: 0, maxWidth: 260, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {value}
      </div>
    </div>
  );
}

function Card({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section
      style={{
        background: C.cardBg,
        border: `1px solid ${C.borderSoft}`,
        borderRadius: 14,
        padding: "16px 20px",
        fontFamily: FONT,
      }}
    >
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 15, fontWeight: 600, color: C.ink, letterSpacing: -0.1 }}>{title}</div>
        {subtitle && <div style={{ fontSize: 12.5, color: C.inkMuted, marginTop: 3 }}>{subtitle}</div>}
      </div>
      {children}
    </section>
  );
}

export default async function ClientSettingsPage({ params }: { params: PageParams }) {
  const { tenantSlug } = await params;
  const session = await getCachedActorSession();
  if (!session.user) notFound();

  const scope = await getTenantScopeBySlug(tenantSlug);
  if (!scope) notFound();

  const [clientProfile, trustState] = await Promise.all([
    loadClientSelfProfile(session.user.id, scope.tenantId),
    loadClientTrustBillingState(session.user.id, scope.tenantId),
  ]);
  if (!clientProfile) notFound();
  const stripeEnabled = isStripeConfigured();

  const userEmail =
    (session.user.email as string | undefined) ?? "—";

  const userName =
    (session.user.user_metadata?.full_name as string | undefined) ??
    (session.user.user_metadata?.name as string | undefined) ??
    userEmail.split("@")[0];

  return (
    <div style={{ fontFamily: FONT }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h1
          style={{
            fontFamily: FONT_DISPLAY,
            fontSize: 24,
            fontWeight: 600,
            color: C.ink,
            margin: 0,
            letterSpacing: -0.4,
          }}
        >
          Settings
        </h1>
        <p style={{ fontSize: 13, color: C.inkMuted, margin: "6px 0 0" }}>
          Your account details and preferences.
        </p>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 680 }}>
        {/* Profile */}
        <Card
          title="Profile"
          subtitle="Your display name and company shown to the agency."
        >
          <SettingRow
            label="Name"
            value={clientProfile.displayName}
          />
          <SettingRow
            label="Company"
            value={clientProfile.company ?? "—"}
            hint="Used on inquiries and bookings."
          />
          <div
            style={{
              padding: "12px 0 0",
              fontSize: 12,
              color: C.inkMuted,
              fontFamily: FONT,
            }}
          >
            Contact {clientProfile.agencyName} to update your profile details.
          </div>
        </Card>

        {/* Account */}
        <Card
          title="Account"
          subtitle="Your login credentials."
        >
          <SettingRow
            label="Email"
            value={userEmail}
          />
          <SettingRow
            label="Sign-in method"
            value="Email / password"
          />
          <div
            style={{
              padding: "12px 0 0",
              fontSize: 12,
              color: C.inkMuted,
              fontFamily: FONT,
            }}
          >
            To change your email or password, visit your account settings or contact support.
          </div>
        </Card>

        {/* Notifications — placeholder */}
        <Card
          title="Notifications"
          subtitle="How you hear about inquiry updates."
        >
          <div
            style={{
              padding: "20px 0",
              textAlign: "center",
              fontSize: 13,
              color: C.inkMuted,
              fontFamily: FONT,
            }}
          >
            Email notification preferences will be configurable in a future update.
          </div>
        </Card>

        {/* Phase 8.3 — Trust badge + verification + balance top-up */}
        <ClientTrustShell
          tenantSlug={tenantSlug}
          trustLevel={trustState.trustLevel}
          verifiedAt={trustState.verifiedAt}
          fundedBalanceCents={trustState.fundedBalanceCents}
          stripeEnabled={stripeEnabled}
        />
      </div>
    </div>
  );
}
