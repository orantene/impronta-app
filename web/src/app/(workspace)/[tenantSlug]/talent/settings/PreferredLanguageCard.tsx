"use client";

import { SettingsCardLoading } from "./SettingsCardLoading";

/**
 * PreferredLanguageCard — the talent's preferred dashboard / public-page language.
 *
 * WS2 / R1 (web/docs/multi-language-platform-execution-plan-2026-06-15.md):
 * a talent may override their agency's default language for THEIR OWN surfaces
 * (back-end dashboard + the default language of their public talent page),
 * constrained to the agency's supported set. "Inherit" (the default) clears the
 * preference so the talent follows the agency default.
 *
 * Options come from the talent's primary agency's `supported_locales`. Mirrors
 * DefaultCurrencyCard's layout + async-state idiom (loading / saving / saved /
 * error, optimistic update with rollback). Loads on mount via
 * loadTalentPreferredLanguage; writes through updateTalentPreferredLanguage,
 * which gates with ownership + elevates to the service role.
 *
 * Single-language agency (only one option) → the picker still renders but only
 * offers "Inherit" + that one language; there's nothing to switch to, matching
 * the "single language → no switcher" principle.
 */

import { useEffect, useState, useTransition } from "react";
import {
  loadTalentPreferredLanguage,
  updateTalentPreferredLanguage,
  type TalentLanguageOption,
} from "@/lib/server-actions/talent-self";

const C = {
  ink:        "#0B0B0D",
  inkMuted:   "rgba(11,11,13,0.62)",
  borderSoft: "rgba(24,24,27,0.08)",
  border:     "rgba(24,24,27,0.16)",
  surface:    "rgba(24,24,27,0.03)",
  accentDeep: "#093328",
  accentSoft: "rgba(15,79,62,0.10)",
  error:      "#dc2626",
  errorSoft:  "#FCA5A5",
  success:    "#16a34a",
} as const;

const FONT = '"Inter", system-ui, sans-serif';

const INHERIT = "inherit";

export function PreferredLanguageCard() {
  // The select value: "inherit" or a locale code.
  const [value, setValue] = useState<string>(INHERIT);
  const [options, setOptions] = useState<TalentLanguageOption[]>([]);
  const [agencyDefault, setAgencyDefault] = useState<string>("en");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedOk, setSavedOk] = useState(false);
  const [, startTransition] = useTransition();

  useEffect(() => {
    let cancelled = false;
    loadTalentPreferredLanguage()
      .then((res) => {
        if (cancelled) return;
        if (res.ok) {
          setOptions(res.data.options);
          setAgencyDefault(res.data.agencyDefaultLocale);
          setValue(res.data.preferredLocale ?? INHERIT);
        }
        setLoading(false);
      })
      .catch(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  function save(next: string) {
    const previous = value;
    setValue(next); // optimistic
    setSaving(true);
    setError(null);
    setSavedOk(false);
    startTransition(async () => {
      const res = await updateTalentPreferredLanguage(next === INHERIT ? null : next);
      setSaving(false);
      if (res.ok) {
        setSavedOk(true);
        setTimeout(() => setSavedOk(false), 2000);
      } else {
        setValue(previous); // rollback
        setError(res.error);
      }
    });
  }

  if (loading) return <SettingsCardLoading label="Loading language preference…" />;

  const labelFor = (o: TalentLanguageOption) =>
    o.labelNative === o.labelEn ? o.labelNative : `${o.labelNative} (${o.labelEn})`;
  const agencyDefaultLabel =
    options.find((o) => o.code === agencyDefault)?.labelNative ?? agencyDefault.toUpperCase();

  return (
    <div
      data-testid="talent-preferred-language-card"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        width: "100%",
        padding: "14px 16px",
        marginBottom: 16,
        borderRadius: 12,
        background: "#fff",
        border: `1px solid ${C.borderSoft}`,
        fontFamily: FONT,
        flexWrap: "wrap",
      }}
    >
      <span
        aria-hidden
        style={{
          width: 32,
          height: 32,
          borderRadius: 8,
          flexShrink: 0,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          background: C.accentSoft,
          color: C.accentDeep,
          fontSize: 13,
          fontWeight: 700,
          letterSpacing: 0.3,
        }}
      >
        {value === INHERIT ? agencyDefault.toUpperCase() : value.toUpperCase()}
      </span>
      <div style={{ flex: "1 1 220px", minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: C.ink }}>Preferred language</div>
        <div style={{ fontSize: 11.5, color: C.inkMuted, marginTop: 2, lineHeight: 1.45 }}>
          Your dashboard and the default language of your public page. Limited to the
          languages your agency offers.
        </div>
        {saving && (
          <div style={{ fontSize: 11, color: C.inkMuted, marginTop: 4 }}>Saving…</div>
        )}
        {savedOk && !saving && (
          <div style={{ fontSize: 11, color: C.success, marginTop: 4 }}>Saved</div>
        )}
        {error && (
          <div style={{ fontSize: 11, color: C.error, marginTop: 4 }}>{error}</div>
        )}
      </div>
      <select
        aria-label="Preferred language"
        value={value}
        disabled={saving}
        onChange={(e) => {
          const next = e.target.value;
          if (next !== value) save(next);
        }}
        style={{
          flexShrink: 0,
          fontSize: 13,
          color: C.ink,
          fontFamily: FONT,
          background: saving ? C.surface : "#fff",
          border: `1px solid ${error ? C.errorSoft : C.border}`,
          borderRadius: 8,
          padding: "6px 10px",
          minWidth: 220,
          cursor: saving ? "wait" : "pointer",
          outline: "none",
        }}
      >
        <option value={INHERIT}>{`Inherit from agency (${agencyDefaultLabel})`}</option>
        {options.map((o) => (
          <option key={o.code} value={o.code}>
            {labelFor(o)}
          </option>
        ))}
      </select>
    </div>
  );
}
