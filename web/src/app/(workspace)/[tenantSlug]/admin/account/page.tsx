// Phase 3 — canonical workspace Account & Billing page.
// Server Component — no "use client".
//
// Shows plan tier, roster usage, subscription state, and agency identity.
// Upgrade CTAs wire through Stripe Checkout (paid plans) or direct DB write (free).
// Manage subscription CTA opens Stripe Billing Portal for active subscribers.
// Capability gate: agency.workspace.view (viewer+). Billing CTAs: manage_billing (admin+).

import { formatPeriodDate } from "@/lib/billing/period-date";
import { notFound, redirect } from "next/navigation";
import { verifyCheckoutReturn } from "@/lib/billing/checkout-return";
import Link from "next/link";
import { getTenantScopeBySlug } from "@/lib/saas/scope";
import { userHasCapability } from "@/lib/access";
import { getCachedActorSession } from "@/lib/server/request-cache";
import {
  loadWorkspaceAgencySummary,
  loadWorkspaceBillingState,
  loadWorkspacePayoutSnapshot,
  type WorkspacePlan,
} from "../../_data-bridge";
import {
  UpgradePlanButton,
  ManageSubscriptionButton,
  SubscriptionStatusBadge,
} from "./BillingActionButtons";
import { WorkspaceCheckoutAutoStart } from "./WorkspaceCheckoutAutoStart";
import { WorkspacePlanChangeOpener } from "./WorkspacePlanChangeOpener";
import { workspaceAutoStartDecision, parsePlanIntent, isWorkspaceIntent, planIntentAction, planIntentLabel } from "@/lib/onboarding/plan-intent";
import { PastDueBanner } from "@/components/billing/PastDueBanner";
import { BriefCard } from "./BriefCard";
import { PendingPayoutAccounts } from "./PendingPayoutAccounts";
import { loadPendingPayoutAccounts } from "@/lib/payments/pending-payout-accounts";
import { CurrencyPicker } from "./CurrencyPicker";
import {
  createStaffPayoutAccountAction,
  createWorkspacePayoutAccountAction,
} from "./payout-account-actions";
import { isStripeConfigured } from "@/lib/stripe/client";
import { getRequestLocale } from "@/i18n/request-locale";
import { createTranslator } from "@/i18n/messages";
import { loadWorkspaceOverrideBanner } from "../../../platform/workspace-override-banner-data";

export const dynamic = "force-dynamic";

type PageParams = Promise<{ tenantSlug: string }>;
const BILLING_NOTICES: Record<string, string> = {
  success: "Your subscription is active. Plan features and seat limits update within a minute.",
  cancelled: "Checkout was cancelled. Your workspace is still on the Free plan.",
  checkout_failed: "We couldn't open checkout. Upgrade from this page when you're ready.",
};

type SearchParams = Promise<{
  pmsg?: string;
  perr?: string;
  billing?: string;
  return?: string;
  plan?: string;
  interval?: string;
}>;

import { C, FONT, PLAN_META, SectionHead, DetailRow, RosterUsageBar, Divider } from "./AccountPageParts";

// ─── Page ─────────────────────────────────────────────────────────────────────
export default async function WorkspaceAccountPage({
  params,
  searchParams,
}: {
  params: PageParams;
  searchParams: SearchParams;
}) {
  const { tenantSlug } = await params;
  const resolvedSearch = await searchParams;
  const { pmsg, perr, billing } = resolvedSearch;
  const billingNotice = BILLING_NOTICES[billing ?? ""] ?? null;

  const scope = await getTenantScopeBySlug(tenantSlug);
  if (!scope) notFound();

  const canView = await userHasCapability("agency.workspace.view", scope.tenantId);
  if (!canView) notFound();

  // Trial-door return-to-spot: only a token this workspace's checkout signed verifies.
  if (billing === "success" && resolvedSearch.return) {
    const back = verifyCheckoutReturn(resolvedSearch.return, scope.tenantId);
    if (back.ok) redirect(back.path);
  }

  const session = await getCachedActorSession();
  if (!session.user) notFound();

  const locale = await getRequestLocale();
  const t = createTranslator(locale);

  const [
    canManageBilling,
    canManageWorkspacePayout,
    summary,
    billingState,
    payout,
    overrideBanner,
  ] = await Promise.all([
    userHasCapability("manage_billing", scope.tenantId),
    userHasCapability("agency.payout_account.manage", scope.tenantId),
    loadWorkspaceAgencySummary(scope.tenantId),
    loadWorkspaceBillingState(scope.tenantId),
    loadWorkspacePayoutSnapshot(scope.tenantId, session.user.id),
    loadWorkspaceOverrideBanner(scope.tenantId),
  ]);
  // Owner only (agency.payout_account.manage is in OWNER_CAPS; manage_billing is not enough).
  const pendingPayouts = canManageWorkspacePayout ? await loadPendingPayoutAccounts(scope.tenantId) : [];

  // Platform-granted plan override (comp / trial) — explains why the plan
  // badge above may differ from any paid subscription.
  const overrideExpiryLabel = overrideBanner?.expiresAt
    ? new Date(overrideBanner.expiresAt).toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : null;
  const canManagePayout = canManageWorkspacePayout || canManageBilling;
  const canCreateSelfPayout = ["owner", "admin", "manager"].includes(scope.membership.role);

  const stripeEnabled = isStripeConfigured();
  const planMeta = summary ? PLAN_META[summary.plan] : PLAN_META.free;

  const planTaglines: Record<WorkspacePlan, string> = {
    free:    t("admin.account.planTaglineFree"),
    website: t("admin.account.planTaglineWebsite"),
    studio:  t("admin.account.planTaglineStudio"),
    agency:  t("admin.account.planTaglineAgency"),
    network: t("admin.account.planTaglineNetwork"),
  };
  const planPrices: Record<WorkspacePlan, string | null> = {
    free:    null,
    website: t("admin.account.planPriceWebsite"),
    studio:  t("admin.account.planPriceStudio"),
    agency:  t("admin.account.planPriceAgency"),
    network: null,
  };
  const planTagline = summary ? planTaglines[summary.plan] : planTaglines.free;
  const planPrice = summary ? planPrices[summary.plan] : null;

  // Subscription is "active" when there's a billing record with a non-cancelled status
  const hasActiveSubscription =
    !!billingState &&
    billingState.status !== "cancelled" &&
    billingState.status !== "incomplete_expired";

  // Format billing period end for display
  const periodEndLabel = formatPeriodDate(billingState?.currentPeriodEnd, "en");

  // TUL-828: /pricing -> /start?plan= -> here. Start the chosen checkout once;
  // the component falls back to this page on any failure.
  const autoStart = workspaceAutoStartDecision({
    plan: resolvedSearch.plan,
    interval: resolvedSearch.interval,
    canManageBilling,
    hasActiveSubscription,
    stripeEnabled,
  });

  // TUL-831: an existing subscriber with a plan intent gets the in-app plan
  // change confirm instead of a second checkout.
  const rawIntent = parsePlanIntent(resolvedSearch.plan, resolvedSearch.interval);
  const planChangeIntent =
    canManageBilling && stripeEnabled && isWorkspaceIntent(rawIntent) &&
    planIntentAction({
      hasSubscription: hasActiveSubscription,
      currentPlan: summary?.plan ?? null,
      currentInterval: null,
      intent: rawIntent,
    }) === "plan_change"
      ? rawIntent
      : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 28, fontFamily: FONT }}>
      {planChangeIntent ? (
        <WorkspacePlanChangeOpener
          planKey={planChangeIntent.plan}
          interval={planChangeIntent.interval}
          planName={planIntentLabel(planChangeIntent, locale)}
          tenantSlug={tenantSlug}
        />
      ) : null}
      {autoStart.action === "start" && autoStart.intent ? (
        <WorkspaceCheckoutAutoStart plan={autoStart.intent.plan} interval={autoStart.intent.interval} tenantSlug={tenantSlug} />
      ) : null}
      {billingNotice ? (
        <div style={{ border: `1px solid ${C.border}`, background: C.accentSoft, color: C.accent, borderRadius: 10, padding: "10px 12px", fontSize: 12.5 }}>
          {billingNotice}
        </div>
      ) : null}
      {pmsg ? (
        <div style={{ border: `1px solid ${C.border}`, background: C.accentSoft, color: C.accent, borderRadius: 10, padding: "10px 12px", fontSize: 12.5 }}>
          {pmsg}
        </div>
      ) : null}
      {perr ? (
        <div style={{ border: `1px solid ${C.border}`, background: C.amberSoft, color: C.amber, borderRadius: 10, padding: "10px 12px", fontSize: 12.5 }}>
          {perr}
        </div>
      ) : null}

      {/* ── Plan override notice (platform-granted comp / trial) ── */}
      {overrideBanner ? (
        <div
          style={{
            border: `1px solid ${C.border}`,
            background: C.accentSoft,
            borderRadius: 12,
            padding: "13px 15px",
          }}
        >
          <div style={{ fontSize: 13, fontWeight: 600, color: C.accent }}>
            ★ {PLAN_META[overrideBanner.overridePlanTier].label} access — granted
            by Tulala
          </div>
          <div style={{ fontSize: 12.5, color: C.inkMuted, marginTop: 4 }}>
            {overrideExpiryLabel ? (
              <>
                Your workspace has full{" "}
                {PLAN_META[overrideBanner.overridePlanTier].label} features at no
                charge until <strong>{overrideExpiryLabel}</strong>. After that
                it returns to the{" "}
                {PLAN_META[overrideBanner.basePlanTier].label} plan unless a paid
                subscription is in place.
              </>
            ) : (
              <>
                Your workspace has full{" "}
                {PLAN_META[overrideBanner.overridePlanTier].label} features at no
                charge, with no set end date.
              </>
            )}
            {overrideBanner.reason ? ` — ${overrideBanner.reason}` : ""}
          </div>
        </div>
      ) : null}

      {/* ── Header ── */}
      <div
        style={{
          display: "flex",
          alignItems: "flex-end",
          justifyContent: "space-between",
          gap: 16,
          flexWrap: "wrap",
        }}
      >
        <div>
          <div
            style={{
              fontSize: 10.5,
              fontWeight: 700,
              letterSpacing: 0.7,
              textTransform: "uppercase",
              color: C.accent,
              marginBottom: 4,
            }}
          >
            {scope.membership.display_name}
          </div>
          <h1
            style={{
              fontFamily: FONT,
              fontSize: 26,
              fontWeight: 700,
              color: C.ink,
              margin: 0,
              letterSpacing: -0.5,
              lineHeight: 1.1,
            }}
          >
            {t("admin.account.title")}
          </h1>
        </div>

        {canManageBilling && (
          <Link
            href={`/${tenantSlug}/admin/settings`}
            style={{
              display: "inline-flex",
              alignItems: "center",
              height: 34,
              padding: "0 14px",
              borderRadius: 8,
              background: C.cardBg,
              border: `1px solid ${C.border}`,
              color: C.ink,
              fontFamily: FONT,
              fontSize: 12.5,
              fontWeight: 600,
              textDecoration: "none",
              letterSpacing: -0.1,
            }}
          >
            {t("admin.account.workspaceSettings")}
          </Link>
        )}
      </div>

      {summary ? (
        <>
          {/* ── Plan section ── */}
          <section>
            <SectionHead>{t("admin.account.planSection")}</SectionHead>
            <div
              style={{
                background: C.cardBg,
                border: `1px solid ${C.border}`,
                borderRadius: 12,
                overflow: "hidden",
              }}
            >
              {/* Current plan row */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: "11px 16px",
                  fontFamily: FONT,
                }}
              >
                <span style={{ flexShrink: 0, width: 140, fontSize: 12, color: C.inkMuted }}>
                  {t("admin.account.currentPlan")}
                </span>
                <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      padding: "3px 9px",
                      borderRadius: 999,
                      background: planMeta.bg,
                      color: planMeta.color,
                      fontSize: 11.5,
                      fontWeight: 700,
                      letterSpacing: 0.1,
                    }}
                  >
                    {planMeta.label}
                  </span>
                  <span style={{ fontSize: 12, color: C.inkMuted }}>
                    {planTagline}
                  </span>
                </div>
              </div>

              <Divider />
              <RosterUsageBar count={summary.talentCount} limit={summary.talentLimit} t={t} />

              {billingState && (
                <PastDueBanner
                  scope="workspace"
                  tenantSlug={tenantSlug}
                  status={billingState.status}
                  pastDueSince={billingState.pastDueSince}
                  locale={locale}
                />
              )}
              {/* Subscription state rows (only when there's a Stripe record) */}
              {billingState && (
                <>
                  <Divider />
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 12,
                      padding: "11px 16px",
                      fontFamily: FONT,
                    }}
                  >
                    <span style={{ flexShrink: 0, width: 140, fontSize: 12, color: C.inkMuted }}>
                      {t("admin.account.billingStatus")}
                    </span>
                    <div className="flex items-center gap-2.5">
                      <SubscriptionStatusBadge status={billingState.status} locale={locale} />
                      {billingState.cancelAtPeriodEnd && (
                        <span style={{ fontSize: 11.5, color: C.amber, fontFamily: FONT }}>
                          {t("admin.account.cancelsAtPeriodEnd")}
                        </span>
                      )}
                    </div>
                  </div>

                  {planPrice && (
                    <>
                      <Divider />
                      <DetailRow label={t("admin.account.price")} value={planPrice} />
                    </>
                  )}

                  {periodEndLabel && (
                    <>
                      <Divider />
                      <DetailRow
                        label={billingState.cancelAtPeriodEnd ? t("admin.account.accessUntil") : t("admin.account.nextRenewal")}
                        value={periodEndLabel}
                      />
                    </>
                  )}

                  {billingState.trialEnd && billingState.status === "trialing" && (
                    <>
                      <Divider />
                      <DetailRow
                        label={t("admin.account.trialEnds")}
                        value={new Date(billingState.trialEnd).toLocaleDateString("en-US", {
                          year: "numeric",
                          month: "long",
                          day: "numeric",
                        })}
                      />
                    </>
                  )}
                </>
              )}

              <Divider />
              <DetailRow
                label={t("admin.account.workspaceSlug")}
                value={
                  <span style={{ fontFamily: "monospace", fontSize: 12.5 }}>
                    {summary.slug}
                  </span>
                }
              />

              {/* Billing currency preference — only billing managers can change */}
              {canManageBilling && (
                <>
                  <Divider />
                  <CurrencyPicker
                    tenantSlug={tenantSlug}
                    currentValue={summary.preferredCurrency}
                    locale={locale}
                  />
                </>
              )}
            </div>

            {/* Billing CTAs */}
            {canManageBilling && (
              <div style={{ marginTop: 12, display: "flex", gap: 8, flexWrap: "wrap" }}>
                {hasActiveSubscription ? (
                  // Existing subscriber → Billing Portal
                  <ManageSubscriptionButton tenantSlug={tenantSlug} locale={locale} />
                ) : stripeEnabled && summary.plan === "free" ? (
                  // Free tier + Stripe configured → show upgrade options
                  <>
                    <UpgradePlanButton
                      plan="studio"
                      tenantSlug={tenantSlug}
                      label={`Upgrade to Studio — ${planPrices.studio ?? ""}`}
                      locale={locale}
                    />
                    <UpgradePlanButton
                      plan="agency"
                      tenantSlug={tenantSlug}
                      label={`Upgrade to Agency — ${planPrices.agency ?? ""}`}
                      locale={locale}
                    />
                  </>
                ) : !stripeEnabled && summary.plan === "free" ? (
                  // Stripe not configured yet — show a contact note
                  <p style={{ fontSize: 12, color: C.inkMuted, margin: 0, fontFamily: FONT }}>
                    {t("admin.account.billingInactive")}
                  </p>
                ) : null}
              </div>
            )}
          </section>

          {/* ── Agency identity section ── */}
          <section>
            <SectionHead>{t("admin.account.agencyIdentitySection")}</SectionHead>
            <div
              style={{
                background: C.cardBg,
                border: `1px solid ${C.border}`,
                borderRadius: 12,
                overflow: "hidden",
              }}
            >
              <DetailRow label={t("admin.account.displayNameLabel")} value={summary.displayName} />

              {/* Contact email is the Reply-To on every customer-facing email,
                  so it is shown ALWAYS (even blank) with a nudge — a hidden
                  empty field is why most workspaces never set it. */}
              <Divider />
              <div
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 12,
                  padding: "11px 16px",
                  fontFamily: FONT,
                }}
              >
                <span style={{ flexShrink: 0, width: 140, fontSize: 12, color: C.inkMuted }}>
                  {t("admin.account.contactEmail")}
                </span>
                <span style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 2 }}>
                  <span
                    style={{
                      fontSize: 13,
                      fontWeight: 500,
                      color: summary.contactEmail ? C.ink : C.accent,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {summary.contactEmail || t("admin.account.contactEmailEmpty")}
                  </span>
                  <span style={{ fontSize: 12, color: C.inkMuted }}>
                    {t("admin.account.contactEmailReplyHint")}
                  </span>
                </span>
              </div>

              {summary.contactPhone && (
                <>
                  <Divider />
                  <DetailRow label={t("admin.account.phoneLabel")} value={summary.contactPhone} />
                </>
              )}

              {summary.addressCity && (
                <>
                  <Divider />
                  <DetailRow
                    label={t("admin.account.locationLabel")}
                    value={
                      [summary.addressCity, summary.addressCountry]
                        .filter(Boolean)
                        .join(", ")
                    }
                  />
                </>
              )}
            </div>

            {canManageBilling && (
              <p
                style={{
                  marginTop: 8,
                  paddingLeft: 2,
                  fontSize: 12,
                  color: C.inkMuted,
                  fontFamily: FONT,
                }}
              >
                {t("admin.account.updateAtIdentity")}{" "}
                <Link
                  href={`/${tenantSlug}/admin/settings`}
                  style={{ color: C.accent, textDecoration: "underline" }}
                >
                  {t("admin.account.siteIdentityLink")}
                </Link>
              </p>
            )}
          </section>
        </>
      ) : (
        <div
          style={{
            background: C.surface,
            border: `1px dashed ${C.border}`,
            borderRadius: 14,
            padding: "48px 24px",
            textAlign: "center",
          }}
        >
          <p style={{ fontSize: 13, color: C.inkMuted }}>{t("admin.account.unavailable")}</p>
        </div>
      )}

      {/* ── Payout accounts (Phase 8.4) ── */}
      <section>
        <SectionHead>{t("admin.account.payoutSection")}</SectionHead>
        <div
          style={{
            background: C.cardBg,
            border: `1px solid ${C.border}`,
            borderRadius: 12,
            overflow: "hidden",
          }}
        >
          <DetailRow
            label={t("admin.account.workspaceAccount")}
            value={
              payout.workspaceAccount
                ? `${payout.workspaceAccount.displayName} · ${payout.workspaceAccount.status}`
                : t("admin.account.notConnected")
            }
          />
          <Divider />
          <DetailRow
            label={t("admin.account.staffAccount")}
            value={
              payout.selfStaffAccount
                ? `${payout.selfStaffAccount.displayName} · ${payout.selfStaffAccount.status}`
                : t("admin.account.notConnected")
            }
          />
          <Divider />
          <DetailRow
            label={t("admin.account.connectedReceivers")}
            value={`${payout.connectedCount}`}
          />
        </div>

        {(canManagePayout || canCreateSelfPayout) ? (
          <div style={{ marginTop: 12, display: "flex", gap: 8, flexWrap: "wrap" }}>
            {canManagePayout && !payout.workspaceAccount ? (
              <form action={createWorkspacePayoutAccountAction}>
                <input type="hidden" name="tenantSlug" value={tenantSlug} />
                <button
                  type="submit"
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    height: 34,
                    padding: "0 14px",
                    borderRadius: 8,
                    background: C.cardBg,
                    border: `1px solid ${C.border}`,
                    color: C.ink,
                    fontFamily: FONT,
                    fontSize: 12.5,
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  {t("admin.account.createWorkspacePayout")}
                </button>
              </form>
            ) : null}

            {canCreateSelfPayout && !payout.selfStaffAccount ? (
              <form action={createStaffPayoutAccountAction}>
                <input type="hidden" name="tenantSlug" value={tenantSlug} />
                <button
                  type="submit"
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    height: 34,
                    padding: "0 14px",
                    borderRadius: 8,
                    background: C.cardBg,
                    border: `1px solid ${C.border}`,
                    color: C.ink,
                    fontFamily: FONT,
                    fontSize: 12.5,
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  {t("admin.account.connectMyPayout")}
                </button>
              </form>
            ) : null}
          </div>
        ) : null}
      </section>

      {canManageWorkspacePayout ? <PendingPayoutAccounts accounts={pendingPayouts} tenantSlug={tenantSlug} t={t} /> : null}

      <section>
        <SectionHead>{t("admin.account.briefSection")}</SectionHead>
        <BriefCard
          blurb={t("admin.account.briefBlurb")}
          linkLabel={t("admin.account.briefLink")}
        />
      </section>
    </div>
  );
}
