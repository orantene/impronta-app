"use client";

import { SettingsCardLoading } from "./SettingsCardLoading";

/**
 * DefaultCurrencyCard — talent's preferred display currency on Money.
 *
 * Mirrors the agency-side `DefaultCurrencySettingsRow` but laid out as a
 * card (Talent settings doesn't use accordion sections). Loads
 * `talent_profiles.default_currency` on mount and writes through
 * `updateTalentDefaultCurrency`, which gates with
 * `requireTalentSelf()` and elevates to the service role for the write.
 *
 * State pattern follows `ProfileVisibilityCard`: optimistic update with
 * rollback on error, never silently swallow a failure. Same idiom for
 * pending / error chrome so the two cards feel coherent.
 *
 * Display-only at v1 — the underlying snapshot rows are EUR; the picker
 * just decides which currency tab the Money surface opens to first once
 * multi-currency data starts flowing.
 */

import { useEffect, useState, useTransition } from "react";
import {
  loadTalentDefaultCurrency,
  updateTalentDefaultCurrency,
} from "./actions";
import {
  CURRENCY_LABELS,
  DEFAULT_CURRENCY_FALLBACK,
  DEFAULT_CURRENCY_OPTIONS,
  type DefaultCurrencyCode,
} from "@/lib/billing/currencies";

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
  success:    "var(--color-admin-green)",
} as const;

const FONT = '"Inter", system-ui, sans-serif';

export function DefaultCurrencyCard() {
  const [currency, setCurrency] = useState<DefaultCurrencyCode>(DEFAULT_CURRENCY_FALLBACK);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedOk, setSavedOk] = useState(false);
  const [, startTransition] = useTransition();

  useEffect(() => {
    let cancelled = false;
    loadTalentDefaultCurrency()
      .then((res) => {
        if (cancelled) return;
        if (res.ok) setCurrency(res.data.defaultCurrency);
        setLoading(false);
      })
      .catch(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  function save(next: DefaultCurrencyCode) {
    const previous = currency;
    setCurrency(next); // optimistic
    setSaving(true);
    setError(null);
    setSavedOk(false);
    startTransition(async () => {
      const res = await updateTalentDefaultCurrency(next);
      setSaving(false);
      if (res.ok) {
        setSavedOk(true);
        setTimeout(() => setSavedOk(false), 2000);
      } else {
        setCurrency(previous); // rollback
        setError(res.error);
      }
    });
  }

  if (loading) return <SettingsCardLoading label="Loading currency preference…" />;

  return (
    <div
      data-testid="talent-default-currency-card"
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
        {currency}
      </span>
      <div style={{ flex: "1 1 220px", minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: C.ink }}>Default currency</div>
        <div style={{ fontSize: 11.5, color: C.inkMuted, marginTop: 2, lineHeight: 1.45 }}>
          Which currency tab opens first on Money when multiple are present. Display-only — no FX conversion.
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
        aria-label="Default currency"
        value={currency}
        disabled={saving}
        onChange={(e) => {
          const next = e.target.value as DefaultCurrencyCode;
          if (next !== currency) save(next);
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
        {DEFAULT_CURRENCY_OPTIONS.map((code) => (
          <option key={code} value={code}>
            {CURRENCY_LABELS[code]}
          </option>
        ))}
      </select>
    </div>
  );
}
