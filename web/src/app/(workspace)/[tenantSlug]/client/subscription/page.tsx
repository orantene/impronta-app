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

import { notFound } from "next/navigation";
import { getTenantPortalScopeBySlug } from "@/lib/saas/scope";
import { getCachedActorSession } from "@/lib/server/request-cache";
import { loadClientSubscription, type ClientSubscriptionTier }
  from "@/lib/discover/client-subscription";
import { ClientPageHeader } from "../_components/ClientPageHeader";
import { ProUpgradeButton } from "./ProUpgradeButton";

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

type TierCard = {
  id: ClientSubscriptionTier;
  name: string;
  priceLabel: string;
  priceNote: string;
  tagline: string;
  features: string[];
  accent: boolean;
};

const TIERS: TierCard[] = [
  {
    id: "standard",
    name: "Standard",
    priceLabel: "Free",
    priceNote: "Always free",
    tagline: "Browse the catalog + send single inquiries.",
    features: [
      "Browse the full Discover catalog",
      "View any talent profile",
      "Favorite talents",
      "1 saved shortlist (max 5 talents)",
      "Single-talent inquiries",
      "14-day availability per talent",
    ],
    accent: false,
  },
  {
    id: "pro",
    name: "Pro",
    priceLabel: "$49 / mo",
    priceNote: "Placeholder — pricing TBD",
    tagline: "Power tools for teams booking at volume.",
    features: [
      "Everything in Standard",
      "Unlimited shortlists",
      "Side-by-side compare view (up to 6)",
      "Multi-talent inquiry send",
      "Rate band visibility",
      "30-day availability calendar",
      "Send-to-client shareable shortlists",
      "Advanced filters (rate, language, response-time sort)",
    ],
    accent: true,
  },
  {
    id: "enterprise",
    name: "Enterprise",
    priceLabel: "Custom",
    priceNote: "Placeholder — contact sales",
    tagline: "Scale, API, and white-label.",
    features: [
      "Everything in Pro",
      "API access",
      "Dedicated account rep",
      "Bulk RFPs",
      "White-label shortlist sharing (own domain)",
      "Saved-search alerts + market reports",
      "Multi-seat",
      "Priority support",
    ],
    accent: false,
  },
];

export default async function ClientSubscriptionPage({ params }: { params: PageParams }) {
  const { tenantSlug } = await params;
  const session = await getCachedActorSession();
  if (!session.user) notFound();
  const scope = await getTenantPortalScopeBySlug(tenantSlug);
  if (!scope) notFound();

  const sub = await loadClientSubscription(session.user.id);
  const currentTier = sub.tier;

  return (
    <div style={{ fontFamily: FONT }}>
      <ClientPageHeader
        eyebrow="Account"
        title="Subscription"
        subtitle="Power tools for Discover. Browsing is always free — upgrade unlocks shortlists, compare, and multi-inquiry."
      />

      {/* Orthogonality note — spec §4.1 critical rule. */}
      <div style={{
        maxWidth: 920, marginBottom: 18,
        padding: "10px 14px", background: C.accentSoft,
        border: `1px solid ${C.accent}22`, borderRadius: 10,
        fontSize: 12, color: C.ink, lineHeight: 1.5,
      }}>
        <strong>Subscription unlocks tools, not access.</strong> Talent
        contact controls + trust tier are a separate axis — a Pro plan
        never lets you bypass a talent&apos;s contact preferences.
        Verification lives in{" "}
        <a href={`/${tenantSlug}/client/settings`} style={{ color: C.accent, textDecoration: "underline" }}>
          Settings → Trust
        </a>.
      </div>

      {/* Tier grid */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
        gap: 14, maxWidth: 920, marginBottom: 20,
      }}>
        {TIERS.map((t) => {
          const isCurrent = t.id === currentTier;
          return (
            <div
              key={t.id}
              style={{
                background: C.cardBg,
                border: `1.5px solid ${isCurrent ? C.success : t.accent ? C.accent : C.borderSoft}`,
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
                  Current
                </span>
              )}
              <div style={{ fontSize: 17, fontWeight: 700, color: C.ink }}>
                {t.name}
              </div>
              <div style={{ marginTop: 8, display: "flex", alignItems: "baseline", gap: 6 }}>
                <span style={{ fontSize: 24, fontWeight: 700, color: C.ink }}>
                  {t.priceLabel}
                </span>
              </div>
              <div style={{
                fontSize: 10.5, color: C.inkDim, marginTop: 2,
                fontStyle: t.id === "standard" ? "normal" : "italic",
              }}>
                {t.priceNote}
              </div>
              <div style={{ fontSize: 12.5, color: C.inkMuted, marginTop: 10, lineHeight: 1.5 }}>
                {t.tagline}
              </div>
              <ul style={{
                margin: "14px 0 18px", padding: 0, listStyle: "none",
                display: "flex", flexDirection: "column", gap: 7,
              }}>
                {t.features.map((f, i) => (
                  <li key={i} style={{
                    fontSize: 12.5, color: C.ink, lineHeight: 1.45,
                    display: "flex", gap: 7,
                  }}>
                    <span style={{ color: C.success, flexShrink: 0 }}>✓</span>
                    <span>{f}</span>
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
                    Your current plan
                  </div>
                ) : t.id === "standard" ? (
                  <div style={{
                    padding: "9px 0", textAlign: "center",
                    fontSize: 12.5, fontWeight: 600, color: C.inkDim,
                  }}>
                    Always available
                  </div>
                ) : t.id === "pro" ? (
                  // Phase D — real Stripe Checkout (subscription mode). Falls
                  // back to a sales message if checkout isn't configured.
                  <ProUpgradeButton
                    tenantSlug={tenantSlug}
                    label="Upgrade to Pro"
                    background={C.accent}
                    color="#fff"
                    border="none"
                  />
                ) : (
                  <a
                    href={`mailto:sales@tulala.digital?subject=${encodeURIComponent(`Upgrade to ${t.name}`)}`}
                    style={{
                      display: "block", padding: "10px 0", textAlign: "center",
                      background: t.accent ? C.accent : "transparent",
                      color: t.accent ? "#fff" : C.ink,
                      border: t.accent ? "none" : `1px solid ${C.borderSoft}`,
                      borderRadius: 8, fontSize: 12.5, fontWeight: 600,
                      textDecoration: "none",
                    }}
                  >
                    Contact sales
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
        <strong>Pricing is being finalized.</strong> The numbers above
        are placeholders. Self-serve checkout lands once pricing is set
        — until then, upgrades are sales-assisted. Email{" "}
        <a href="mailto:sales@tulala.digital" style={{ color: C.accent, textDecoration: "underline" }}>
          sales@tulala.digital
        </a>{" "}
        and we&apos;ll set you up. Your current plan
        {sub.currentPeriodEnd
          ? ` renews ${new Date(sub.currentPeriodEnd).toLocaleDateString()}.`
          : " is free with no renewal."}
      </div>
    </div>
  );
}
