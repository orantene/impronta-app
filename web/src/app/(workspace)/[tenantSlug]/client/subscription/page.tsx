// D6 — Client subscription tier comparison + management.
//
// Standalone client page rendering the Standard / Pro / Enterprise
// comparison from spec §4.2-4.3. Reads the live tier via
// loadClientSubscription. Pricing is PLACEHOLDER per spec §12.1
// ("Pricing TBD before D6 — market research needed") and is clearly
// labelled as such; the upgrade CTA is sales-led until Stripe
// checkout is wired (separate D6-billing slice once prices land).
//
// The gating helper (loadClientSubscription) already drives feature
// access elsewhere (compare view, multi-talent inquiry). This page is
// the missing surface where the client SEES their tier + what each
// tier unlocks.
//
// Trust ladder is ORTHOGONAL to subscription (spec §4.1 critical
// rule): Pro = TOOLS, trust tier = ACCESS. This page only covers the
// subscription axis; trust lives in /client/settings.

import { notFound, redirect } from "next/navigation";
import { CLIENT_PRO_PRICING_LIVE } from "@/lib/client-billing/pricing-flag";
import { getTenantPortalScopeBySlug } from "@/lib/saas/scope";
import { getCachedActorSession } from "@/lib/server/request-cache";
import { loadClientSubscription, type ClientSubscriptionTier }
  from "@/lib/discover/client-subscription";
import { ClientPageHeader } from "../_components/ClientPageHeader";
import { ProUpgradeButton } from "./ProUpgradeButton";
import { getRequestLocale } from "@/i18n/request-locale";
import { createTranslator } from "@/i18n/messages";
import { interpolate } from "@/i18n/interpolate";

export const dynamic = "force-dynamic";
type PageParams = Promise<{ tenantSlug: string }>;

const FONT = '"Inter", system-ui, sans-serif';
const C = {
  ink:        "#0B0B0D",
  inkMuted:   "rgba(11,11,13,0.55)",
  inkDim:     "rgba(11,11,13,0.35)",
  borderSoft: "rgba(24,24,27,0.08)",
  cardBg:     "#ffffff",
  surface:    "rgba(11,11,13,0.02)",
  accent:     "#1D4ED8",
  accentSoft: "rgba(29,78,216,0.08)",
  success:    "#1A7348",
  successSoft: "rgba(26,115,72,0.10)",
  amber:      "#D69E2E",
  amberSoft:  "rgba(214,158,46,0.10)",
} as const;

// Plan NAMES (Standard / Pro / Enterprise) and the money string stay verbatim in
// both locales — they are product proper nouns and a price. Everything else is
// resolved from the catalog at render time.
type TierCard = {
  id: ClientSubscriptionTier;
  name: string;
  /** Money string, or a catalog key when the "price" is a word (Free / Custom). */
  priceLabel?: string;
  priceLabelKey?: string;
  priceNoteKey: string;
  taglineKey: string;
  featureKeys: string[];
  accent: boolean;
};

const TIERS: TierCard[] = [
  {
    id: "standard",
    name: "Standard",
    priceLabelKey: "client.subscription.priceFree",
    priceNoteKey: "client.subscription.standardPriceNote",
    taglineKey: "client.subscription.standardTagline",
    featureKeys: [
      "client.subscription.standardFeature1",
      "client.subscription.standardFeature2",
      "client.subscription.standardFeature3",
      "client.subscription.standardFeature4",
      "client.subscription.standardFeature5",
      "client.subscription.standardFeature6",
    ],
    accent: false,
  },
  {
    id: "pro",
    name: "Pro",
    priceLabel: "$49 / mo",
    priceNoteKey: "client.subscription.proPriceNote",
    taglineKey: "client.subscription.proTagline",
    featureKeys: [
      "client.subscription.proFeature1",
      "client.subscription.proFeature2",
      "client.subscription.proFeature3",
      "client.subscription.proFeature4",
      "client.subscription.proFeature5",
      "client.subscription.proFeature6",
      "client.subscription.proFeature7",
      "client.subscription.proFeature8",
    ],
    accent: true,
  },
  {
    id: "enterprise",
    name: "Enterprise",
    priceLabelKey: "client.subscription.priceCustom",
    priceNoteKey: "client.subscription.enterprisePriceNote",
    taglineKey: "client.subscription.enterpriseTagline",
    featureKeys: [
      "client.subscription.enterpriseFeature1",
      "client.subscription.enterpriseFeature2",
      "client.subscription.enterpriseFeature3",
      "client.subscription.enterpriseFeature4",
      "client.subscription.enterpriseFeature5",
      "client.subscription.enterpriseFeature6",
      "client.subscription.enterpriseFeature7",
      "client.subscription.enterpriseFeature8",
    ],
    accent: false,
  },
];

export default async function ClientSubscriptionPage({ params }: { params: PageParams }) {
  const { tenantSlug } = await params;
  // WP4 — client Pro pricing is still placeholder (see the header note and
  // pricing-flag.ts). Until real prices ship we do not render the tier
  // comparison; existing "Upgrade" CTAs (rail footer, shortlists, hub) land
  // gracefully on the client home instead of a placeholder-price page.
  if (!CLIENT_PRO_PRICING_LIVE) redirect(`/${tenantSlug}/client`);
  const locale = await getRequestLocale();
  const t = createTranslator(locale);
  const session = await getCachedActorSession();
  if (!session.user) notFound();
  const scope = await getTenantPortalScopeBySlug(tenantSlug);
  if (!scope) notFound();

  const sub = await loadClientSubscription(session.user.id);
  const currentTier = sub.tier;

  return (
    <div style={{ fontFamily: FONT }}>
      <ClientPageHeader
        eyebrow={t("dashboard.clientNav.groupAccount")}
        title={t("client.subscription.title")}
        subtitle={t("client.subscription.subtitle")}
      />

      {/* Orthogonality note — spec §4.1 critical rule. */}
      <div style={{
        maxWidth: 920, marginBottom: 18,
        padding: "10px 14px", background: C.accentSoft,
        border: `1px solid ${C.accent}22`, borderRadius: 10,
        fontSize: 12, color: C.ink, lineHeight: 1.5,
      }}>
        <strong>{t("client.subscription.orthogonalTitle")}</strong>{" "}
        {t("client.subscription.orthogonalBody")}{" "}
        <a href={`/${tenantSlug}/client/settings`} style={{ color: C.accent, textDecoration: "underline" }}>
          {t("client.subscription.settingsTrustLink")}
        </a>.
      </div>

      {/* Tier grid */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
        gap: 14, maxWidth: 920, marginBottom: 20,
      }}>
        {TIERS.map((tier) => {
          const isCurrent = tier.id === currentTier;
          const priceLabel = tier.priceLabel ?? t(tier.priceLabelKey ?? "");
          return (
            <div
              key={tier.id}
              style={{
                background: C.cardBg,
                border: `1.5px solid ${isCurrent ? C.success : tier.accent ? C.accent : C.borderSoft}`,
                borderRadius: 14,
                padding: "20px 22px",
                display: "flex",
                flexDirection: "column",
                position: "relative",
              }}
            >
              {isCurrent && (
                <span style={{
                  position: "absolute", top: 14, right: 14,
                  fontSize: 10, fontWeight: 700, letterSpacing: 0.4,
                  textTransform: "uppercase",
                  padding: "3px 8px", borderRadius: 999,
                  background: C.successSoft, color: C.success,
                }}>
                  {t("client.subscription.currentBadge")}
                </span>
              )}
              <div style={{ fontSize: 17, fontWeight: 700, color: C.ink }}>
                {tier.name}
              </div>
              <div style={{ marginTop: 8, display: "flex", alignItems: "baseline", gap: 6 }}>
                <span style={{ fontSize: 24, fontWeight: 700, color: C.ink }}>
                  {priceLabel}
                </span>
              </div>
              <div style={{
                fontSize: 10.5, color: C.inkDim, marginTop: 2,
                fontStyle: tier.id === "standard" ? "normal" : "italic",
              }}>
                {t(tier.priceNoteKey)}
              </div>
              <div style={{ fontSize: 12.5, color: C.inkMuted, marginTop: 10, lineHeight: 1.5 }}>
                {t(tier.taglineKey)}
              </div>
              <ul style={{
                margin: "14px 0 18px", padding: 0, listStyle: "none",
                display: "flex", flexDirection: "column", gap: 7,
              }}>
                {tier.featureKeys.map((key) => (
                  <li key={key} style={{
                    fontSize: 12.5, color: C.ink, lineHeight: 1.45,
                    display: "flex", gap: 7,
                  }}>
                    <span style={{ color: C.success, flexShrink: 0 }}>✓</span>
                    <span>{t(key)}</span>
                  </li>
                ))}
              </ul>
              <div style={{ marginTop: "auto" }}>
                {isCurrent ? (
                  <div style={{
                    padding: "9px 0", textAlign: "center",
                    fontSize: 12.5, fontWeight: 600, color: C.inkMuted,
                    background: C.surface, borderRadius: 8,
                  }}>
                    {t("client.subscription.yourCurrentPlan")}
                  </div>
                ) : tier.id === "standard" ? (
                  <div style={{
                    padding: "9px 0", textAlign: "center",
                    fontSize: 12.5, fontWeight: 600, color: C.inkDim,
                  }}>
                    {t("client.subscription.alwaysAvailable")}
                  </div>
                ) : tier.id === "pro" ? (
                  // Phase D — real Stripe Checkout (subscription mode). Falls
                  // back to a sales message if checkout isn't configured.
                  <ProUpgradeButton
                    tenantSlug={tenantSlug}
                    label={t("client.subscription.upgradeToPro")}
                    background={C.accent}
                    color="#fff"
                    border="none"
                  />
                ) : (
                  <a
                    href={`mailto:sales@tulala.digital?subject=${encodeURIComponent(`Upgrade to ${tier.name}`)}`}
                    style={{
                      display: "block", padding: "10px 0", textAlign: "center",
                      background: tier.accent ? C.accent : "transparent",
                      color: tier.accent ? "#fff" : C.ink,
                      border: tier.accent ? "none" : `1px solid ${C.borderSoft}`,
                      borderRadius: 8, fontSize: 12.5, fontWeight: 600,
                      textDecoration: "none",
                    }}
                  >
                    {t("client.subscription.contactSales")}
                  </a>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Sales-led note — Stripe checkout deferred per spec §12.1. */}
      <div style={{
        maxWidth: 920,
        padding: "12px 16px", background: C.amberSoft,
        border: `1px solid ${C.amber}33`, borderRadius: 10,
        fontSize: 12, color: C.ink, lineHeight: 1.55,
      }}>
        <strong>{t("client.subscription.pricingNoteTitle")}</strong>{" "}
        {t("client.subscription.pricingNoteBody")}{" "}
        <a href="mailto:sales@tulala.digital" style={{ color: C.accent, textDecoration: "underline" }}>
          sales@tulala.digital
        </a>{" "}
        {sub.currentPeriodEnd
          ? interpolate(t("client.subscription.planRenews"), {
              date: new Date(sub.currentPeriodEnd).toLocaleDateString(),
            })
          : t("client.subscription.planFreeNoRenewal")}
      </div>
    </div>
  );
}
