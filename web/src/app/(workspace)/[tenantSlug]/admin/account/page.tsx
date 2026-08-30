// Phase 3 — canonical workspace Account & Billing page.
// Server Component — no "use client".
//
// Shows plan tier, roster usage, subscription state, and agency identity.
// Upgrade CTAs wire through Stripe Checkout (paid plans) or direct DB write (free).
// Manage subscription CTA opens Stripe Billing Portal for active subscribers.
// Capability gate: agency.workspace.view (viewer+). Billing CTAs: manage_billing (admin+).

import { notFound } from "next/navigation";
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
import { BriefCard } from "./BriefCard";
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
type SearchParams = Promise<{
  pmsg?: string;
  perr?: string;
  billing?: string;
}>;

// ─── Design tokens ────────────────────────────────────────────────────────────

// Design tokens — values resolve to the canonical admin token set
// (src/styles/admin-color-bridge.css) instead of page-local hex, so this
// page can never drift from the shell palette again. Note: the old local
// amber was a warm gold (#8A6F1A) — the token amber is the de-golded slate.
const C = {
  ink:        "var(--color-admin-ink)",
  inkMuted:   "var(--color-admin-ink-muted)",
  inkDim:     "var(--color-admin-ink-dim)",
  border:     "var(--color-admin-border)",
  borderSoft: "var(--color-admin-border-soft)",
  cardBg:     "var(--color-admin-card)",
  surface:    "var(--color-admin-surface)",
  accent:     "var(--color-admin-brand)",
  accentSoft: "var(--color-admin-brand-soft)",
  green:      "var(--color-admin-green)",
  amber:      "var(--color-admin-amber)",
  amberSoft:  "var(--color-admin-amber-soft)",
} as const;

const FONT = 'var(--font-admin-body, "Inter", system-ui, sans-serif)';

// ─── Plan meta ────────────────────────────────────────────────────────────────

const PLAN_META: Record<WorkspacePlan, { label: string; bg: string; color: string }> = {
  free:    { label: "Free",    bg: "rgba(11,11,13,0.07)",    color: "rgba(11,11,13,0.55)" },
  website: { label: "Website", bg: "rgba(20,120,110,0.10)",  color: "#166F65" },
  studio:  { label: "Studio",  bg: "rgba(180,130,20,0.10)",  color: "#8A6F1A" },
  agency:  { label: "Agency",  bg: "rgba(30,80,160,0.10)",   color: "#2B5F8A" },
  network: { label: "Network", bg: "rgba(100,50,200,0.10)",  color: "#6B3EC2" },
};

// ─── Sub-components ───────────────────────────────────────────────────────────

function SectionHead({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontFamily: FONT,
        fontSize: 10.5,
        fontWeight: 700,
        letterSpacing: 0.7,
        textTransform: "uppercase" as const,
        color: C.inkDim,
        marginBottom: 8,
      }}
    >
      {children}
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "11px 16px",
        fontFamily: FONT,
      }}
    >
      <span
        style={{
          flexShrink: 0,
          width: 140,
          fontSize: 12,
          color: C.inkMuted,
        }}
      >
        {label}
      </span>
      <span
        style={{
          flex: 1,
          minWidth: 0,
          fontSize: 13,
          fontWeight: 500,
          color: C.ink,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {value}
      </span>
    </div>
  );
}

function RosterUsageBar({ count, limit, t }: { count: number; limit: number | null; t: (k: string) => string }) {
  if (limit === null) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "11px 16px",
          fontFamily: FONT,
        }}
      >
        <span style={{ flexShrink: 0, width: 140, fontSize: 12, color: C.inkMuted }}>{t("admin.account.rosterLabel")}</span>
        <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: C.ink, fontVariantNumeric: "tabular-nums" }}>
            {count}
          </span>
          <span style={{ fontSize: 12, color: C.inkMuted }}>{t("admin.account.ofUnlimited")}</span>
        </div>
      </div>
    );
  }

  const pct = limit > 0 ? Math.min((count / limit) * 100, 100) : 0;
  const nearLimit = pct >= 80;
  const barColor = nearLimit ? "#D4A017" : C.accent;
  const countColor = nearLimit ? "#8A6F1A" : C.ink;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "11px 16px",
        fontFamily: FONT,
      }}
    >
      <span style={{ flexShrink: 0, width: 140, fontSize: 12, color: C.inkMuted }}>{t("admin.account.rosterLabel")}</span>
      <div className="flex-1 min-w-0">
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 5 }}>
          <span
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: countColor,
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {count}
          </span>
          <span style={{ fontSize: 12, color: C.inkMuted }}>{t("admin.account.of")} {limit}</span>
        </div>
        <div
          style={{
            height: 4,
            borderRadius: 999,
            background: "rgba(11,11,13,0.08)",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              height: "100%",
              width: `${pct}%`,
              background: barColor,
              borderRadius: 999,
              transition: "width 0.4s ease",
            }}
          />
        </div>
      </div>
    </div>
  );
}

function Divider() {
  return <div style={{ height: 1, background: C.borderSoft, margin: "0 16px" }} />;
}

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
  const billingNotice =
    billing === "success"
      ? "Your subscription is active. Plan features and seat limits update within a minute."
      : billing === "cancelled"
        ? "Checkout was cancelled. Your workspace is still on the Free plan."
        : billing === "checkout_failed"
          ? "We couldn't open checkout. Upgrade from this page when you're ready."
          : null;

  const scope = await getTenantScopeBySlug(tenantSlug);
  if (!scope) notFound();

  const canView = await userHasCapability("agency.workspace.view", scope.tenantId);
  if (!canView) notFound();

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
  const periodEndLabel = billingState?.currentPeriodEnd
    ? new Date(billingState.currentPeriodEnd).toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 28, fontFamily: FONT }}>
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

              {summary.contactEmail && (
                <>
                  <Divider />
                  <DetailRow label={t("admin.account.contactEmail")} value={summary.contactEmail} />
                </>
              )}

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
