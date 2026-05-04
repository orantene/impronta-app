"use client";

/**
 * ContactPrefsShell — per-trust-tier contact toggles in talent settings.
 *
 * Lets talent control which client trust tiers can contact them. All tiers
 * default to ON (open). Framing: access opportunity language, never "pay to
 * contact me."
 *
 * Per docs/client-trust-and-contact-controls.md:
 *   - Talent can independently restrict by tier.
 *   - Disabling a lower tier does NOT implicitly disable higher tiers.
 *   - Labels: Basic / Verified / Silver / Gold (never "subscriber" or "paid").
 */

import { useState, useTransition } from "react";
import type { TalentContactPrefs } from "../../_data-bridge";
import { saveTalentContactPrefs } from "./actions";

const C = {
  ink:        "#0B0B0D",
  inkMuted:   "rgba(11,11,13,0.55)",
  inkDim:     "rgba(11,11,13,0.35)",
  borderSoft: "rgba(24,24,27,0.08)",
  cardBg:     "#ffffff",
  green:      "#2E7D5B",
  greenSoft:  "rgba(46,125,91,0.08)",
  greenDeep:  "#1A5E3C",
} as const;

const FONT = '"Inter", system-ui, sans-serif';

type Tier = "allowBasic" | "allowVerified" | "allowSilver" | "allowGold";

const TIER_META: {
  key: Tier;
  label: string;
  description: string;
  dot: string;
}[] = [
  {
    key: "allowBasic",
    label: "Basic",
    description: "Registered clients with no verified identity",
    dot: "rgba(11,11,13,0.30)",
  },
  {
    key: "allowVerified",
    label: "Verified",
    description: "Clients who have confirmed their identity",
    dot: C.green,
  },
  {
    key: "allowSilver",
    label: "Silver",
    description: "Verified clients with a funded account",
    dot: "#5C7A99",
  },
  {
    key: "allowGold",
    label: "Gold",
    description: "Verified clients with a high funded balance",
    dot: "#B07D2A",
  },
];

export function ContactPrefsShell({
  tenantSlug,
  talentProfileId,
  initialPrefs,
}: {
  tenantSlug: string;
  talentProfileId: string;
  /** null = no record yet → all tiers open by default */
  initialPrefs: TalentContactPrefs | null;
}) {
  const defaults = {
    allowBasic:    initialPrefs?.allowBasic    ?? true,
    allowVerified: initialPrefs?.allowVerified ?? true,
    allowSilver:   initialPrefs?.allowSilver   ?? true,
    allowGold:     initialPrefs?.allowGold     ?? true,
  };

  const [prefs, setPrefs] = useState(defaults);
  const [saved, setSaved] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const toggle = (key: Tier) => {
    setPrefs((p) => ({ ...p, [key]: !p[key] }));
    setSaved(false);
    setErrorMsg(null);
  };

  const save = () => {
    startTransition(async () => {
      const result = await saveTalentContactPrefs(tenantSlug, talentProfileId, prefs);
      if (result.ok) {
        setSaved(true);
        setErrorMsg(null);
        setTimeout(() => setSaved(false), 3000);
      } else {
        setErrorMsg(result.error);
      }
    });
  };

  const isDirty =
    prefs.allowBasic    !== defaults.allowBasic    ||
    prefs.allowVerified !== defaults.allowVerified ||
    prefs.allowSilver   !== defaults.allowSilver   ||
    prefs.allowGold     !== defaults.allowGold;

  return (
    <section style={{ fontFamily: FONT }}>
      {/* Section header */}
      <div
        style={{
          fontSize: 10.5,
          fontWeight: 700,
          letterSpacing: 0.7,
          textTransform: "uppercase" as const,
          color: C.inkDim,
          marginBottom: 10,
        }}
      >
        Contact preferences
      </div>

      <div
        style={{
          background: C.cardBg,
          border: `1px solid ${C.borderSoft}`,
          borderRadius: 14,
          overflow: "hidden",
        }}
      >
        {/* Intro */}
        <div
          style={{
            padding: "14px 16px",
            borderBottom: `1px solid ${C.borderSoft}`,
            fontSize: 12.5,
            color: C.inkMuted,
            lineHeight: 1.5,
          }}
        >
          Choose which client tiers can send you inquiry requests. Higher-trust clients
          have verified their identity or hold a funded account — disabling a tier hides
          you from those clients in their search results.
        </div>

        {/* Tier rows */}
        {TIER_META.map(({ key, label, description, dot }) => (
          <div
            key={key}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 16,
              padding: "14px 16px",
              borderBottom: `1px solid ${C.borderSoft}`,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span
                aria-hidden
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  background: dot,
                  flexShrink: 0,
                }}
              />
              <div>
                <div style={{ fontSize: 13.5, fontWeight: 600, color: C.ink, letterSpacing: -0.1 }}>
                  {label}
                </div>
                <div style={{ fontSize: 12, color: C.inkMuted, marginTop: 2 }}>
                  {description}
                </div>
              </div>
            </div>

            {/* Toggle */}
            <button
              type="button"
              role="switch"
              aria-checked={prefs[key]}
              aria-label={`Allow ${label} clients to contact me`}
              onClick={() => toggle(key)}
              style={{
                flexShrink: 0,
                position: "relative",
                width: 40,
                height: 22,
                borderRadius: 999,
                background: prefs[key] ? C.green : "rgba(11,11,13,0.15)",
                border: "none",
                cursor: "pointer",
                transition: "background 0.15s",
                padding: 0,
              }}
            >
              <span
                style={{
                  position: "absolute",
                  top: 3,
                  left: prefs[key] ? 21 : 3,
                  width: 16,
                  height: 16,
                  borderRadius: "50%",
                  background: "#fff",
                  transition: "left 0.15s",
                  boxShadow: "0 1px 3px rgba(0,0,0,0.18)",
                }}
              />
            </button>
          </div>
        ))}

        {/* Save row */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "flex-end",
            gap: 12,
            padding: "12px 16px",
          }}
        >
          {errorMsg && (
            <span style={{ fontSize: 12, color: "#C0392B" }}>{errorMsg}</span>
          )}
          {saved && (
            <span style={{ fontSize: 12, color: C.green, fontWeight: 600 }}>
              Saved
            </span>
          )}
          <button
            type="button"
            onClick={save}
            disabled={!isDirty || isPending}
            style={{
              height: 32,
              padding: "0 16px",
              borderRadius: 8,
              border: "none",
              background: isDirty && !isPending ? C.green : "rgba(11,11,13,0.10)",
              color: isDirty && !isPending ? "#fff" : C.inkMuted,
              fontFamily: FONT,
              fontSize: 12.5,
              fontWeight: 600,
              cursor: isDirty && !isPending ? "pointer" : "not-allowed",
              transition: "background 0.12s, color 0.12s",
            }}
          >
            {isPending ? "Saving…" : "Save preferences"}
          </button>
        </div>
      </div>
    </section>
  );
}
