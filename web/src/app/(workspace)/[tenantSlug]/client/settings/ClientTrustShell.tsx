"use client";

/**
 * ClientTrustShell — trust badge + verification + balance top-up section
 * in client settings (Phase 8.3).
 *
 * Tiers:
 *   Basic      — free signup. Some talents may block Basic contact.
 *   Verified   — $5 one-time fee. Default-allowed by most talents.
 *   Silver     — Verified + $100+ funded balance.
 *   Gold       — Verified + $500+ funded balance.
 */

import * as React from "react";
import { useT } from "@/i18n/use-t";
import { interpolate } from "@/i18n/interpolate";
import { startClientVerification, startClientBalanceTopup } from "./stripe-client-trust-actions";
import type { ClientTrustLevel } from "@/lib/client-trust/evaluator";
import { SettingsSectionIcon } from "@/components/admin/settings/settings-section-icons";

// ─── Design tokens ────────────────────────────────────────────────────────────

const C = {
  ink:        "#0B0B0D",
  inkMuted:   "rgba(11,11,13,0.55)",
  inkDim:     "rgba(11,11,13,0.35)",
  border:     "rgba(24,24,27,0.08)",
  borderSoft: "rgba(24,24,27,0.06)",
  cardBg:     "#ffffff",
  accent:     "#1D4ED8",
  green:      "#2E7D5B",
  greenSoft:  "rgba(46,125,91,0.08)",
  blue:       "#2563EB",
  blueSoft:   "rgba(37,99,235,0.08)",
  silver:     "#64748B",
  silverSoft: "rgba(100,116,139,0.08)",
  gold:       "#92400E",
  goldSoft:   "rgba(180,130,20,0.08)",
  amber:      "#D97706",
} as const;

const FONT = '"Inter", system-ui, sans-serif';

// ─── Tier metadata ────────────────────────────────────────────────────────────

// Tier NAMES stay as the spec's proper nouns (Basic / Verified / Silver / Gold)
// in both locales, matching how es.json already renders them elsewhere. Only the
// description + perk copy is localized; the English strings below remain the
// non-UI fallback.
const TIER_META: Record<ClientTrustLevel, {
  label: string;
  color: string;
  bg: string;
  description: string;
  descriptionKey: string;
  perks: string[];
  perkKeys: string[];
}> = {
  basic: {
    label: "Basic",
    color: C.inkMuted,
    bg: "rgba(11,11,13,0.06)",
    description: "Free account, standard access.",
    descriptionKey: "client.settings.trust.basicDescription",
    perks: [
      "Browse talent profiles",
      "Send inquiries to talents that accept Basic",
      "View booking history",
    ],
    perkKeys: [
      "client.settings.trust.basicPerk1",
      "client.settings.trust.basicPerk2",
      "client.settings.trust.basicPerk3",
    ],
  },
  verified: {
    label: "Verified",
    color: C.blue,
    bg: C.blueSoft,
    description: "Identity verified, trusted by most talents.",
    descriptionKey: "client.settings.trust.verifiedDescription",
    perks: [
      "Everything in Basic",
      "Default-allowed by most talents",
      "Verified badge visible on your inquiries",
    ],
    perkKeys: [
      "client.settings.trust.verifiedPerk1",
      "client.settings.trust.verifiedPerk2",
      "client.settings.trust.verifiedPerk3",
    ],
  },
  silver: {
    label: "Silver",
    color: C.silver,
    bg: C.silverSoft,
    description: "Verified + funded account.",
    descriptionKey: "client.settings.trust.silverDescription",
    perks: [
      "Everything in Verified",
      "Silver badge surfaced in talent inboxes",
      "Access to talents that require Silver+",
    ],
    perkKeys: [
      "client.settings.trust.silverPerk1",
      "client.settings.trust.silverPerk2",
      "client.settings.trust.silverPerk3",
    ],
  },
  gold: {
    label: "Gold",
    color: C.gold,
    bg: C.goldSoft,
    description: "Highest trust, maximum talent access.",
    descriptionKey: "client.settings.trust.goldDescription",
    perks: [
      "Everything in Silver",
      "Gold badge, highest inbox priority",
      "Access to talents that require Gold only",
    ],
    perkKeys: [
      "client.settings.trust.goldPerk1",
      "client.settings.trust.goldPerk2",
      "client.settings.trust.goldPerk3",
    ],
  },
};

// Top-up presets aligned with tier thresholds ($100 = Silver, $500 = Gold)
const TOPUP_PRESETS = [
  { label: "$100", amountCents: 10_000 },
  { label: "$250", amountCents: 25_000 },
  { label: "$500", amountCents: 50_000 },
] as const;

// ─── Sub-components ───────────────────────────────────────────────────────────

function TierChip({ tier }: { tier: ClientTrustLevel }) {
  const meta = TIER_META[tier];
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "3px 10px",
        borderRadius: 999,
        background: meta.bg,
        color: meta.color,
        fontSize: 11.5,
        fontWeight: 700,
        letterSpacing: 0.1,
        fontFamily: FONT,
        flexShrink: 0,
      }}
    >
      {meta.label}
    </span>
  );
}

function ActionButton({
  label,
  onClick,
  pending,
  variant = "primary",
}: {
  label: string;
  onClick: () => void;
  pending: boolean;
  variant?: "primary" | "secondary";
}) {
  const t = useT();
  const isPrimary = variant === "primary";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending}
      style={{
        display: "inline-flex",
        alignItems: "center",
        height: 34,
        padding: "0 16px",
        borderRadius: 8,
        background: isPrimary
          ? pending ? "rgba(37,99,235,0.5)" : C.accent
          : C.cardBg,
        color: isPrimary ? "#fff" : C.ink,
        fontFamily: FONT,
        fontSize: 12.5,
        fontWeight: 600,
        border: isPrimary ? "none" : `1px solid ${C.border}`,
        cursor: pending ? "not-allowed" : "pointer",
        opacity: !isPrimary && pending ? 0.6 : 1,
        letterSpacing: -0.1,
        transition: "background 0.1s, opacity 0.1s",
        whiteSpace: "nowrap",
      }}
    >
      {pending ? t("client.settings.trust.redirecting") : label}
    </button>
  );
}

// ─── Verify button ────────────────────────────────────────────────────────────

function VerifyButton({ tenantSlug }: { tenantSlug: string }) {
  const t = useT();
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);

  function handleClick() {
    if (pending) return;
    setError(null);
    startTransition(async () => {
      const result = await startClientVerification(tenantSlug);
      if (result.ok) {
        window.location.href = result.redirectUrl;
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 5, alignItems: "flex-start" }}>
      <ActionButton label={t("client.settings.trust.verifyCta")} onClick={handleClick} pending={pending} />
      {error && <span style={{ fontSize: 11, color: "#c0392b", fontFamily: FONT }}>{error}</span>}
    </div>
  );
}

// ─── Top-up buttons ───────────────────────────────────────────────────────────

function TopupButtons({ tenantSlug }: { tenantSlug: string }) {
  const t = useT();
  const [pendingAmount, setPendingAmount] = React.useState<number | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [, startTransition] = React.useTransition();

  function handleTopup(amountCents: number) {
    if (pendingAmount !== null) return;
    setError(null);
    setPendingAmount(amountCents);
    startTransition(async () => {
      const result = await startClientBalanceTopup(amountCents, tenantSlug);
      if (result.ok) {
        window.location.href = result.redirectUrl;
      } else {
        setError(result.error);
        setPendingAmount(null);
      }
    });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: "flex-start" }}>
      <div style={{ fontSize: 11.5, fontWeight: 600, color: C.inkDim, fontFamily: FONT, letterSpacing: 0.2 }}>
        {t("client.settings.trust.addBalance")}
      </div>
      <div className="flex gap-2 flex-wrap">
        {TOPUP_PRESETS.map((p) => (
          <ActionButton
            key={p.amountCents}
            label={pendingAmount === p.amountCents ? t("client.settings.trust.redirecting") : p.label}
            onClick={() => handleTopup(p.amountCents)}
            pending={pendingAmount !== null}
            variant="secondary"
          />
        ))}
      </div>
      <p style={{ fontSize: 11.5, color: C.inkMuted, margin: 0, fontFamily: FONT, lineHeight: 1.4 }}>
        {t("client.settings.trust.thresholdNote")}
      </p>
      {error && <span style={{ fontSize: 11, color: "#c0392b", fontFamily: FONT }}>{error}</span>}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function ClientTrustShell({
  tenantSlug,
  trustLevel,
  verifiedAt,
  fundedBalanceCents,
  stripeEnabled,
}: {
  tenantSlug: string;
  trustLevel: ClientTrustLevel;
  verifiedAt: string | null;
  fundedBalanceCents: number;
  stripeEnabled: boolean;
}) {
  const t = useT();
  const meta = TIER_META[trustLevel];
  const isVerified = !!verifiedAt;
  const balanceDollars = (fundedBalanceCents / 100).toFixed(0);

  return (
    <section className="flex flex-col gap-3">
      {/* Section header */}
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <SettingsSectionIcon sectionId="compliance" />
        <div
          style={{
            fontSize: 10.5,
            fontWeight: 700,
            letterSpacing: 0.7,
            textTransform: "uppercase",
            color: C.inkDim,
            fontFamily: FONT,
          }}
        >
          {t("client.settings.trust.sectionTitle")}
        </div>
      </div>

      {/* Current tier card */}
      <div
        style={{
          background: C.cardBg,
          border: `1px solid ${C.border}`,
          borderRadius: 14,
          overflow: "hidden",
        }}
      >
        {/* Tier header row */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: "14px 16px",
            fontFamily: FONT,
            borderBottom: `1px solid ${C.borderSoft}`,
          }}
        >
          <TierChip tier={trustLevel} />
          <div className="flex-1">
            <div style={{ fontSize: 13, fontWeight: 600, color: C.ink, letterSpacing: -0.1 }}>
              {interpolate(t("client.settings.trust.tierHeading"), { tier: meta.label })}
            </div>
            <div style={{ fontSize: 12, color: C.inkMuted, marginTop: 2 }}>{t(meta.descriptionKey)}</div>
          </div>
        </div>

        {/* What's included */}
        <div style={{ padding: "12px 16px" }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: C.inkDim, letterSpacing: 0.5, textTransform: "uppercase", marginBottom: 8, fontFamily: FONT }}>
            {t("client.settings.trust.accessLabel")}
          </div>
          <ul style={{ margin: 0, padding: "0 0 0 16px", display: "flex", flexDirection: "column", gap: 4 }}>
            {meta.perkKeys.map((key, i) => (
              <li key={key} style={{ fontSize: 12.5, color: C.inkMuted, fontFamily: FONT }}>
                {t(key) === key ? meta.perks[i] : t(key)}
              </li>
            ))}
          </ul>
        </div>

        {/* Balance row (verified clients) */}
        {isVerified && (
          <div
            style={{
              padding: "10px 16px",
              borderTop: `1px solid ${C.borderSoft}`,
              display: "flex",
              alignItems: "center",
              gap: 10,
              fontFamily: FONT,
            }}
          >
            <span style={{ fontSize: 12.5, color: C.inkMuted }}>
              {t("client.settings.trust.accountBalance")}
            </span>
            <span style={{ fontSize: 13, fontWeight: 700, color: C.ink }}>
              ${balanceDollars}
            </span>
            {trustLevel === "silver" && (
              <span style={{ fontSize: 11, color: C.silver, fontWeight: 600 }}>
                {t("client.settings.trust.silverActive")}
              </span>
            )}
            {trustLevel === "gold" && (
              <span style={{ fontSize: 11, color: C.amber, fontWeight: 600 }}>
                {t("client.settings.trust.goldActive")}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Upgrade actions */}
      {stripeEnabled && (
        <div className="flex flex-col gap-2.5">
          {/* Verify CTA (unverified only) */}
          {!isVerified && (
            <div
              style={{
                background: C.cardBg,
                border: `1px solid ${C.border}`,
                borderRadius: 12,
                padding: "14px 16px",
                display: "flex",
                flexDirection: "column",
                gap: 8,
              }}
            >
              <div style={{ fontSize: 13, fontWeight: 600, color: C.ink, fontFamily: FONT }}>
                {t("client.settings.trust.verifyTitle")}
              </div>
              <p style={{ fontSize: 12.5, color: C.inkMuted, margin: 0, fontFamily: FONT, lineHeight: 1.4 }}>
                {t("client.settings.trust.verifyBody")}
              </p>
              <VerifyButton tenantSlug={tenantSlug} />
            </div>
          )}

          {/* Balance top-up (verified clients) */}
          {isVerified && (
            <div
              style={{
                background: C.cardBg,
                border: `1px solid ${C.border}`,
                borderRadius: 12,
                padding: "14px 16px",
                display: "flex",
                flexDirection: "column",
                gap: 10,
              }}
            >
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: C.ink, fontFamily: FONT }}>
                  {t("client.settings.trust.fundTitle")}
                </div>
                <p style={{ fontSize: 12, color: C.inkMuted, margin: "4px 0 0", fontFamily: FONT, lineHeight: 1.4 }}>
                  {t("client.settings.trust.fundBody")}
                </p>
              </div>
              <TopupButtons tenantSlug={tenantSlug} />
            </div>
          )}
        </div>
      )}

      {/* When Stripe isn't configured the verify/fund actions above are hidden.
          We intentionally render no "coming soon" placeholder — the tier display
          stays useful on its own, and a dangling teaser reads as unfinished. */}
    </section>
  );
}
