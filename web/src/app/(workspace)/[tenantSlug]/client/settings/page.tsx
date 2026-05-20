// Phase 3.10 — Client Settings page.
// Profile info, notification preferences, and account management.

import { notFound } from "next/navigation";
import { getTenantPortalScopeBySlug } from "@/lib/saas/scope";
import { getCachedActorSession } from "@/lib/server/request-cache";
import { loadClientSelfProfile, loadClientTrustBillingState } from "../../_data-bridge";
import { ClientTrustShell } from "./ClientTrustShell";
import { isStripeConfigured } from "@/lib/stripe/client";
import { ClientPageHeader } from "../_components/ClientPageHeader";
import { loadUserPrefs } from "@/lib/server-actions/user-prefs";
import { NotificationPrefsPanel } from "./NotificationPrefsPanel";

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
      <div className="flex-1 min-w-0">
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
      <div className="mb-3.5">
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

  const scope = await getTenantPortalScopeBySlug(tenantSlug);
  if (!scope) notFound();

  const [clientProfile, trustState, userPrefs] = await Promise.all([
    loadClientSelfProfile(session.user.id, scope.tenantId),
    loadClientTrustBillingState(session.user.id, scope.tenantId),
    loadUserPrefs(session.user.id),
  ]);
  if (!clientProfile) notFound();
  const stripeEnabled = isStripeConfigured();
  const notificationPrefs = userPrefs?.notificationPrefs ?? {};

  const userEmail =
    (session.user.email as string | undefined) ?? "—";

  const userName =
    (session.user.user_metadata?.full_name as string | undefined) ??
    (session.user.user_metadata?.name as string | undefined) ??
    userEmail.split("@")[0];

  const rawProvider =
    (session.user.app_metadata?.provider as string | undefined) ??
    (Array.isArray(session.user.app_metadata?.providers)
      ? (session.user.app_metadata.providers as string[])[0]
      : undefined) ??
    "email";
  const signInMethodLabel =
    rawProvider === "google"
      ? "Google"
      : rawProvider === "github"
      ? "GitHub"
      : rawProvider === "apple"
      ? "Apple"
      : rawProvider === "azure"
      ? "Microsoft"
      : "Email / password";

  return (
    <div style={{ fontFamily: FONT }}>
      <ClientPageHeader
        eyebrow="Account"
        title="Settings"
        subtitle="Your account details, preferences, and trust verification."
      />

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
            value={signInMethodLabel}
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
          subtitle="How you hear about inquiry updates. Changes auto-save."
        >
          <NotificationPrefsPanel initialPrefs={notificationPrefs} />
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
