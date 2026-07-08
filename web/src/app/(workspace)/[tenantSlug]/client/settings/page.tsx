// Phase 3.10 — Client Settings page.
// Profile info, notification preferences, and account management.

import { notFound } from "next/navigation";
import { getTenantPortalScopeBySlug } from "@/lib/saas/scope";
import { getCachedActorSession } from "@/lib/server/request-cache";
import { loadClientSelfProfile, loadClientTrustBillingState } from "../../_data-bridge";
import { ClientTrustShell } from "./ClientTrustShell";
import { ClientSocialVerificationPanel } from "./ClientSocialVerificationPanel";
import { isStripeConfigured } from "@/lib/stripe/client";
import { ClientPageHeader } from "../_components/ClientPageHeader";
import { loadUserPrefs } from "@/lib/server-actions/user-prefs";
import { NotificationPrefsPanel, type UiCategory, type UiChannel } from "./NotificationPrefsPanel";
import { ORDERED_CATEGORIES } from "@/lib/notifications/categories";
import { LIVE_CHANNELS } from "@/lib/notifications/types";
import { ProfileFields, AccountFields } from "./_components/AccountFormsClient";
import {
  loadClientReviews,
  loadClientRatingSummary,
  loadReviewsAuthoredByUser,
} from "@/lib/reviews/load-reviews";
import type { TalentReview } from "@/lib/reviews/review-types";
import { ClientReviewsPanel, type GivenReview } from "../_components/ClientReviewsPanel";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { SettingsSectionIcon } from "@/components/admin/settings/settings-section-icons";
import { getRequestLocale } from "@/i18n/request-locale";
import { createTranslator } from "@/i18n/messages";

export const dynamic = "force-dynamic";
type PageParams = Promise<{ tenantSlug: string }>;

const C = {
  ink:        "#0B0B0D",
  inkMuted:   "rgba(11,11,13,0.55)",
  borderSoft: "rgba(24,24,27,0.08)",
  cardBg:     "#ffffff",
} as const;

const FONT = '"Inter", system-ui, sans-serif';

function Card({
  title,
  subtitle,
  icon,
  children,
}: {
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
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
      <div className="mb-3.5" style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
        {icon && <span style={{ flexShrink: 0, marginTop: 1 }}>{icon}</span>}
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: C.ink, letterSpacing: -0.1 }}>{title}</div>
          {subtitle && <div style={{ fontSize: 12.5, color: C.inkMuted, marginTop: 3 }}>{subtitle}</div>}
        </div>
      </div>
      {children}
    </section>
  );
}

/**
 * Resolve talent profile display names by id for the "reviews you've written"
 * list. talent_profiles SELECT is RLS-scoped, so we use the service-role client
 * (read-only, name only) — same proven pattern as load-reviews.ts. Degrades to
 * null names on any failure; never throws.
 */
async function resolveTalentNames(
  talentProfileIds: string[],
): Promise<Map<string, string | null>> {
  const out = new Map<string, string | null>();
  const ids = Array.from(new Set(talentProfileIds.filter(Boolean)));
  if (ids.length === 0) return out;
  const svc = createServiceRoleClient();
  if (!svc) return out;
  try {
    const { data } = await svc
      .from("talent_profiles")
      .select("id, display_name")
      .in("id", ids)
      .returns<{ id: string; display_name: string | null }[]>();
    for (const row of data ?? []) {
      out.set(row.id, row.display_name?.trim() || null);
    }
  } catch {
    // Degrade silently — talent names render as null.
  }
  return out;
}

export default async function ClientSettingsPage({ params }: { params: PageParams }) {
  const { tenantSlug } = await params;
  const locale = await getRequestLocale();
  const t = createTranslator(locale);
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

  // W8 — two-sided reviews. Received (talent→client) + given (client→talent).
  // Read with Agent 1's helpers; resolve talent names for the "given" list.
  const [receivedReviews, receivedSummary, authoredReviews] = await Promise.all([
    loadClientReviews(session.user.id),
    loadClientRatingSummary(session.user.id),
    loadReviewsAuthoredByUser(session.user.id) as Promise<TalentReview[]>,
  ]);
  const talentNames = await resolveTalentNames(
    authoredReviews.map((r) => r.talentProfileId),
  );
  const givenReviews: GivenReview[] = authoredReviews.map((r) => ({
    id: r.id,
    talentName: talentNames.get(r.talentProfileId) ?? null,
    rating: r.rating,
    body: r.body,
    status: r.status,
    createdAt: r.createdAt,
  }));
  const hasAnyReviews =
    receivedReviews.length > 0 || givenReviews.length > 0;
  const notificationPrefs = userPrefs?.notificationPrefs ?? {};

  // Category list for the prefs panel. categories.ts is server-only, so we map
  // the canonical definitions to a serializable shape here and hand them to the
  // client panel. Channels are narrowed to the live set the dispatcher can
  // actually deliver on — the panel renders a toggle only for those.
  const notificationCategories: UiCategory[] = ORDERED_CATEGORIES.map((c) => ({
    id: c.id,
    label: c.label,
    description: c.description,
    required: c.required,
    channels: c.defaultChannels.filter((ch): ch is UiChannel =>
      (LIVE_CHANNELS as readonly string[]).includes(ch),
    ),
  }));

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
      ? t("dashboard.clientSettings.signInGoogle")
      : rawProvider === "github"
      ? t("dashboard.clientSettings.signInGithub")
      : rawProvider === "apple"
      ? t("dashboard.clientSettings.signInApple")
      : rawProvider === "azure"
      ? t("dashboard.clientSettings.signInMicrosoft")
      : t("dashboard.clientSettings.signInEmail");

  return (
    <div style={{ fontFamily: FONT }}>
      <ClientPageHeader
        eyebrow={t("dashboard.clientSettings.eyebrow")}
        title={t("dashboard.clientSettings.title")}
        subtitle={t("dashboard.clientSettings.subtitle")}
      />

      <div style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 680 }}>
        {/* Profile — now editable. `EditableTextRow` writes to
            profiles.display_name + client_profiles.company_name via the
            client self-edit server actions; RLS already permits
            (`client_profiles_write_own`). */}
        <Card
          title={t("dashboard.clientSettings.profileTitle")}
          subtitle={t("dashboard.clientSettings.profileSubtitle")}
          icon={<SettingsSectionIcon sectionId="profile" />}
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
          title={t("dashboard.clientSettings.accountTitle")}
          subtitle={t("dashboard.clientSettings.accountSubtitle")}
          icon={<SettingsSectionIcon sectionId="account" />}
        >
          <AccountFields
            initialEmail={userEmail}
            signInMethodLabel={signInMethodLabel}
          />
        </Card>

        {/* Notifications — per-category channel prefs the dispatcher honors. */}
        <Card
          title={t("dashboard.clientSettings.notificationsTitle")}
          subtitle={t("dashboard.clientSettings.notificationsSubtitle")}
          icon={<SettingsSectionIcon sectionId="notifications" />}
        >
          <NotificationPrefsPanel
            categories={notificationCategories}
            initialPrefs={notificationPrefs}
          />
        </Card>

        {/* W8 — two-sided reviews. Reviews received from talent + reviews this
            client has written. Reporting a received review flags it for staff. */}
        <Card
          title={t("dashboard.clientSettings.reviewsTitle")}
          subtitle={
            hasAnyReviews
              ? t("dashboard.clientSettings.reviewsSubtitleSome")
              : t("dashboard.clientSettings.reviewsSubtitleNone")
          }
          icon={<SettingsSectionIcon sectionId="brand" />}
        >
          <ClientReviewsPanel
            received={receivedReviews}
            receivedSummary={receivedSummary}
            given={givenReviews}
          />
        </Card>

        {/* Phase 8.3 — Trust badge + verification + balance top-up */}
        <ClientTrustShell
          tenantSlug={tenantSlug}
          trustLevel={trustState.trustLevel}
          verifiedAt={trustState.verifiedAt}
          fundedBalanceCents={trustState.fundedBalanceCents}
          stripeEnabled={stripeEnabled}
        />

        <Card
          title={t("dashboard.clientSettings.socialTitle")}
          subtitle={t("dashboard.clientSettings.socialSubtitle")}
        >
          <ClientSocialVerificationPanel tenantSlug={tenantSlug} />
        </Card>
      </div>
    </div>
  );
}
