"use client";

/**
 * DefaultCurrencySettingsRow — inline `agencies.default_currency` picker
 * for the admin Workspace settings accordion.
 *
 * Pairs with `loadAgencyDefaultCurrency` / `updateAgencyDefaultCurrency`
 * in `lib/server-actions/admin-workspace-default-currency.ts`.
 *
 * Lives OUTSIDE `components/admin/shell/` because the shell's ratchet
 * rule (`ratchet/no-new-inline-style`) freezes new inline styles in
 * that directory while the Phase 3 token codemod pays down the tail.
 * Workspace-settings primitives like this one are a small enough surface
 * to author with inline styles + a couple of admin Tailwind tokens
 * without growing the codemod backlog.
 *
 * UX rules followed:
 *   - Optimistic update with rollback on error (feedback memory:
 *     `admin-edit-ux`).
 *   - Every async state visible — Saving / Saved / Error — no silent
 *     waits.
 *   - One-line "what this does" subtitle (display-only, no FX).
 */

import { useEffect, useState, useTransition } from "react";
import { useT } from "@/i18n/use-t";
import {
  loadAgencyDefaultCurrency,
  updateAgencyDefaultCurrency,
} from "@/lib/server-actions/admin-workspace-default-currency";
import {
  CURRENCY_LABELS,
  DEFAULT_CURRENCY_FALLBACK,
  DEFAULT_CURRENCY_OPTIONS,
  type DefaultCurrencyCode,
} from "@/lib/billing/currencies";

const C = {
  ink:        "#0B0B0D",
  inkMuted:   "rgba(11,11,13,0.62)",
  border:     "rgba(24,24,27,0.16)",
  borderSoft: "rgba(24,24,27,0.08)",
  surface:    "rgba(24,24,27,0.03)",
  error:      "#dc2626",
  errorSoft:  "#FCA5A5",
  success:    "var(--color-admin-green)",
} as const;

const FONT = '"Inter", system-ui, sans-serif';

export function DefaultCurrencySettingsRow() {
  const t = useT();
  const [currency, setCurrency] = useState<DefaultCurrencyCode>(DEFAULT_CURRENCY_FALLBACK);
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [savedOk, setSavedOk] = useState<boolean>(false);
  const [, startTransition] = useTransition();

  useEffect(() => {
    let cancelled = false;
    loadAgencyDefaultCurrency()
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
      const res = await updateAgencyDefaultCurrency({ default_currency: next });
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

  if (loading) return null;

  return (
    <div
      data-testid="agency-default-currency-row"
      style={{
        background: "#fff",
        border: `1px solid ${C.borderSoft}`,
        padding: "14px 16px",
        marginBottom: 8,
        fontFamily: FONT,
        borderRadius: 10,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div style={{ flex: "1 1 220px", minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: C.ink }}>
            {t("admin.account.currency.label")}
          </div>
          <div style={{ fontSize: 12, color: C.inkMuted, marginTop: 2 }}>
            {t("dashboard.adminWorkspace.defaultCurrency.desc")}
          </div>
        </div>
        <select
          aria-label={t("admin.account.currency.label")}
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

      {saving && (
        <div style={{ fontSize: 11, color: C.inkMuted, marginTop: 6 }}>
          {t("admin.account.currency.saving")}
        </div>
      )}
      {savedOk && !saving && (
        <div style={{ fontSize: 11, color: C.success, marginTop: 6 }}>
          {t("admin.account.currency.saved")}
        </div>
      )}
      {error && (
        <div style={{ fontSize: 11, color: C.error, marginTop: 6 }}>{error}</div>
      )}
    </div>
  );
}
