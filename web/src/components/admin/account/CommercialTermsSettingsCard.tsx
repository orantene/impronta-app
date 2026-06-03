"use client";

/**
 * CommercialTermsSettingsCard — per-workspace default booking terms for the
 * admin Workspace settings accordion: default deposit %, refund-policy preset,
 * and instant-book toggle. Persisted in `agencies.settings.commercialTerms`.
 *
 * Pairs with `loadTenantCommercialTerms` / `updateTenantCommercialTerms` in
 * `lib/server-actions/commercial-terms-tenant.ts`.
 *
 * CONFIGURATION LAYER ONLY — these are defaults a later money-flow wave reads.
 * Nothing here charges, refunds, or touches offer/booking math. The deposit %
 * is explicitly a DEFAULT that an individual offer can override.
 *
 * Lives OUTSIDE `components/admin/shell/` (alongside DefaultCurrencySettingsRow)
 * so the shell's `ratchet/no-new-inline-style` freeze doesn't block authoring
 * this small settings primitive with inline styles.
 *
 * UX rules followed (admin-edit-ux memory):
 *   - Optimistic update with rollback on error.
 *   - Every async state visible — Saving / Saved / Error — no silent waits.
 *   - One-line "what this does" subtitles.
 */

import { useEffect, useState, useTransition } from "react";
import {
  loadTenantCommercialTerms,
  updateTenantCommercialTerms,
} from "@/lib/server-actions/commercial-terms-tenant";
import {
  REFUND_POLICY_DESCRIPTIONS,
  REFUND_POLICY_LABELS,
  type RefundPolicyKey,
  type TenantCommercialTerms,
} from "@/lib/billing/commercial-terms-types";

const C = {
  ink:        "#0B0B0D",
  inkMuted:   "rgba(11,11,13,0.62)",
  border:     "rgba(24,24,27,0.16)",
  borderSoft: "rgba(24,24,27,0.08)",
  surface:    "rgba(24,24,27,0.03)",
  error:      "#dc2626",
  errorSoft:  "#FCA5A5",
  success:    "#16a34a",
  accent:     "#0B0B0D",
} as const;

const FONT = '"Inter", system-ui, sans-serif';

const REFUND_POLICY_OPTIONS: RefundPolicyKey[] = [
  "tiered",
  "flexible",
  "strict",
  "manual",
];

const FALLBACK_TERMS: TenantCommercialTerms = {
  depositPct: null,
  refundPolicy: null,
  instantBookEnabled: false,
};

export function CommercialTermsSettingsCard({ tenantSlug }: { tenantSlug: string }) {
  const [terms, setTerms] = useState<TenantCommercialTerms>(FALLBACK_TERMS);
  // Local string mirror for the deposit input so a half-typed / cleared value
  // doesn't fight the controlled number state.
  const [depositInput, setDepositInput] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [savedOk, setSavedOk] = useState<boolean>(false);
  const [, startTransition] = useTransition();

  useEffect(() => {
    let cancelled = false;
    loadTenantCommercialTerms()
      .then((res) => {
        if (cancelled) return;
        if (res.ok) {
          setTerms(res.data);
          setDepositInput(res.data.depositPct === null ? "" : String(res.data.depositPct));
        }
        setLoading(false);
      })
      .catch(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  function save(next: TenantCommercialTerms) {
    const previous = terms;
    setTerms(next); // optimistic
    setSaving(true);
    setError(null);
    setSavedOk(false);
    startTransition(async () => {
      const res = await updateTenantCommercialTerms(tenantSlug, next);
      setSaving(false);
      if (res.ok) {
        setTerms(res.data);
        setDepositInput(res.data.depositPct === null ? "" : String(res.data.depositPct));
        setSavedOk(true);
        setTimeout(() => setSavedOk(false), 2000);
      } else {
        setTerms(previous); // rollback
        setDepositInput(previous.depositPct === null ? "" : String(previous.depositPct));
        setError(res.error);
      }
    });
  }

  function commitDeposit() {
    const trimmed = depositInput.trim();
    let nextPct: number | null;
    if (trimmed === "") {
      nextPct = null;
    } else {
      const parsed = Number(trimmed);
      if (!Number.isFinite(parsed)) {
        // Reset the field to the last good value; don't save garbage.
        setDepositInput(terms.depositPct === null ? "" : String(terms.depositPct));
        return;
      }
      nextPct = Math.min(100, Math.max(0, Math.round(parsed)));
    }
    if (nextPct === terms.depositPct) {
      // Normalize the visible value even if no save is needed.
      setDepositInput(nextPct === null ? "" : String(nextPct));
      return;
    }
    save({ ...terms, depositPct: nextPct });
  }

  if (loading) return null;

  const inputBoxStyle = {
    fontSize: 13,
    color: C.ink,
    fontFamily: FONT,
    background: saving ? C.surface : "#fff",
    border: `1px solid ${error ? C.errorSoft : C.border}`,
    borderRadius: 8,
    padding: "6px 10px",
    outline: "none",
  } as const;

  return (
    <div
      data-testid="agency-commercial-terms-card"
      style={{
        background: "#fff",
        border: `1px solid ${C.borderSoft}`,
        padding: "14px 16px",
        marginBottom: 8,
        fontFamily: FONT,
        borderRadius: 10,
      }}
    >
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: C.ink }}>Booking terms</div>
        <div style={{ fontSize: 12, color: C.inkMuted, marginTop: 2 }}>
          Workspace defaults for new offers. These set the starting point — an
          individual offer can still override the deposit and policy.
        </div>
      </div>

      {/* Default deposit % */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          flexWrap: "wrap",
          paddingTop: 10,
          borderTop: `1px solid ${C.borderSoft}`,
        }}
      >
        <div style={{ flex: "1 1 220px", minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: C.ink }}>Default deposit</div>
          <div style={{ fontSize: 12, color: C.inkMuted, marginTop: 2 }}>
            Default share of the total taken up front. Leave blank to use the
            platform default.
          </div>
        </div>
        <div style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: 6 }}>
          <input
            type="number"
            inputMode="numeric"
            min={0}
            max={100}
            step={1}
            aria-label="Default deposit percent"
            placeholder="—"
            value={depositInput}
            disabled={saving}
            onChange={(e) => setDepositInput(e.target.value)}
            onBlur={commitDeposit}
            onKeyDown={(e) => {
              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
            }}
            style={{ ...inputBoxStyle, width: 84, textAlign: "right", cursor: saving ? "wait" : "text" }}
          />
          <span style={{ fontSize: 13, color: C.inkMuted }}>%</span>
        </div>
      </div>

      {/* Refund policy */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          flexWrap: "wrap",
          paddingTop: 10,
          marginTop: 10,
          borderTop: `1px solid ${C.borderSoft}`,
        }}
      >
        <div style={{ flex: "1 1 220px", minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: C.ink }}>Refund policy</div>
          <div style={{ fontSize: 12, color: C.inkMuted, marginTop: 2 }}>
            {terms.refundPolicy
              ? REFUND_POLICY_DESCRIPTIONS[terms.refundPolicy]
              : "Use the platform default policy."}
          </div>
        </div>
        <select
          aria-label="Refund policy"
          value={terms.refundPolicy ?? ""}
          disabled={saving}
          onChange={(e) => {
            const v = e.target.value;
            const next = v === "" ? null : (v as RefundPolicyKey);
            if (next !== terms.refundPolicy) save({ ...terms, refundPolicy: next });
          }}
          style={{
            ...inputBoxStyle,
            flexShrink: 0,
            minWidth: 220,
            cursor: saving ? "wait" : "pointer",
          }}
        >
          <option value="">Platform default</option>
          {REFUND_POLICY_OPTIONS.map((key) => (
            <option key={key} value={key}>
              {REFUND_POLICY_LABELS[key]}
            </option>
          ))}
        </select>
      </div>

      {/* Instant book toggle */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          flexWrap: "wrap",
          paddingTop: 10,
          marginTop: 10,
          borderTop: `1px solid ${C.borderSoft}`,
        }}
      >
        <div style={{ flex: "1 1 220px", minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: C.ink }}>Instant book</div>
          <div style={{ fontSize: 12, color: C.inkMuted, marginTop: 2 }}>
            Let clients confirm eligible bookings without waiting for manual
            approval.
          </div>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={terms.instantBookEnabled}
          aria-label="Instant book enabled"
          disabled={saving}
          onClick={() => save({ ...terms, instantBookEnabled: !terms.instantBookEnabled })}
          style={{
            flexShrink: 0,
            width: 44,
            height: 24,
            borderRadius: 999,
            border: `1px solid ${terms.instantBookEnabled ? C.accent : C.border}`,
            background: terms.instantBookEnabled ? C.accent : "#fff",
            position: "relative",
            cursor: saving ? "wait" : "pointer",
            padding: 0,
            transition: "background .15s ease, border-color .15s ease",
          }}
        >
          <span
            style={{
              position: "absolute",
              top: 2,
              left: terms.instantBookEnabled ? 22 : 2,
              width: 18,
              height: 18,
              borderRadius: "50%",
              background: "#fff",
              border: terms.instantBookEnabled ? "none" : `1px solid ${C.border}`,
              transition: "left .15s ease",
            }}
          />
        </button>
      </div>

      {saving && (
        <div style={{ fontSize: 11, color: C.inkMuted, marginTop: 8 }}>Saving…</div>
      )}
      {savedOk && !saving && (
        <div style={{ fontSize: 11, color: C.success, marginTop: 8 }}>Saved</div>
      )}
      {error && (
        <div style={{ fontSize: 11, color: C.error, marginTop: 8 }}>{error}</div>
      )}
    </div>
  );
}
