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
import { ProfileFields, AccountFields } from "./_components/AccountFormsClient";

export const dynamic = "force-dynamic";
type PageParams = Promise<{ tenantSlug: string }>;

const C = {
  ink:        "#0B0B0D",
  inkMuted:   "rgba(11,11,13,0.55)",
  borderSoft: "rgba(24,24,27,0.08)",
  cardBg:     "#ffffff",
} as const;

const FONT = '"Inter", system-ui, sans-serif';

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
        {/* Profile — now editable. `EditableTextRow` writes to
            profiles.display_name + client_profiles.company_name via the
            client self-edit server actions; RLS already permits
            (`client_profiles_write_own`). */}
        <Card
          title="Profile"
          subtitle="Your display name and company shown on inquiries and bookings."
        >
          <ProfileFields
            tenantSlug={tenantSlug}
            initialDisplayName={clientProfile.displayName}
            initialCompany={clientProfile.company ?? ""}
            agencyName={clientProfile.agencyName}
          />
        </Card>

        {/* Account — email + password are now editable via Supabase
            auth.updateUser. Email triggers a two-sided confirmation; the
            password change applies immediately. */}
        <Card
          title="Account"
          subtitle="Your sign-in credentials."
        >
          <AccountFields
            initialEmail={userEmail}
            signInMethodLabel={signInMethodLabel}
          />
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
