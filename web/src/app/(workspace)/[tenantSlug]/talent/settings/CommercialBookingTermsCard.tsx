"use client";

import { SettingsCardLoading } from "./SettingsCardLoading";

/**
 * CommercialBookingTermsCard — the talent's commercial booking *preferences*.
 *
 * Mirrors DefaultCurrencyCard's layout + explicit async-state idiom (loading /
 * saving / saved / error, optimistic write with rollback). Edits
 * `talent_profiles.booking_terms` (TalentBookingTerms) via the focused
 * load/update server actions.
 *
 * IMPORTANT framing for the talent: these are DEFAULTS / preferences that
 * inform offers and show on their public page. They are NOT binding — the
 * actual deposit + terms for any booking are set per-offer in the booking
 * flow. The copy says so explicitly. No money is charged here.
 */

import { useEffect, useState, useTransition } from "react";
import { useT } from "@/i18n/use-t";
import {
  loadTalentBookingTerms,
  updateTalentBookingTerms,
} from "@/lib/talent/talent-booking-terms-actions";
import {
  REFUND_POLICY_DESCRIPTION_KEYS,
  REFUND_POLICY_LABEL_KEYS,
  type RefundPolicyKey,
  type TalentBookingTerms,
} from "@/lib/billing/commercial-terms-types";

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

const REFUND_KEYS: RefundPolicyKey[] = ["tiered", "flexible", "strict", "manual"];

const EMPTY: TalentBookingTerms = {
  depositPct: null,
  refundPolicy: null,
  instantBookOptIn: false,
  directBookingOptIn: false,
  fixedRateCents: null,
};

/** cents → display string (units, 2 decimals trimmed). "" when null. */
function centsToInput(cents: number | null): string {
  if (cents === null) return "";
  return (cents / 100).toString();
}

/** display string → cents, or null when blank/invalid. */
function inputToCents(raw: string): number | null {
  const t = raw.trim();
  if (!t) return null;
  const n = Number(t);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100);
}

export function CommercialBookingTermsCard({ talentId }: { talentId: string }) {
  const t = useT();
  const [terms, setTerms] = useState<TalentBookingTerms>(EMPTY);
  const [rateInput, setRateInput] = useState("");
  const [depositInput, setDepositInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<{ field: "rate" | "deposit" | "refund" | "instantBook"; message: string } | null>(null);
  const [savedOk, setSavedOk] = useState(false);
  const [, startTransition] = useTransition();

  useEffect(() => {
    let cancelled = false;
    loadTalentBookingTerms(talentId)
      .then((res) => {
        if (cancelled) return;
        if (res.ok) {
          setTerms(res.terms);
          setRateInput(centsToInput(res.terms.fixedRateCents));
          setDepositInput(res.terms.depositPct === null ? "" : String(res.terms.depositPct));
        }
        setLoading(false);
      })
      .catch(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [talentId]);

  function persist(next: TalentBookingTerms, field: "rate" | "deposit" | "refund" | "instantBook") {
    const previous = terms;
    setTerms(next); // optimistic
    setSaving(true);
    setError(null);
    setSavedOk(false);
    startTransition(async () => {
      const res = await updateTalentBookingTerms(talentId, next);
      setSaving(false);
      if (res.ok) {
        setTerms(res.terms);
        setRateInput(centsToInput(res.terms.fixedRateCents));
        setDepositInput(res.terms.depositPct === null ? "" : String(res.terms.depositPct));
        setSavedOk(true);
        setTimeout(() => setSavedOk(false), 2000);
      } else {
        setTerms(previous); // rollback
        setRateInput(centsToInput(previous.fixedRateCents));
        setDepositInput(previous.depositPct === null ? "" : String(previous.depositPct));
        setError({ field, message: res.error });
      }
    });
  }

  if (loading) {
    return <SettingsCardLoading label="Loading booking terms…" />;
  }

  const fieldStyle = (field: "rate" | "deposit" | "refund" | "instantBook") =>
    ({
      fontSize: 13,
      color: C.ink,
      fontFamily: FONT,
      background: saving ? C.surface : "#fff",
      border: `1px solid ${error?.field === field ? C.errorSoft : C.border}`,
      borderRadius: 8,
      padding: "6px 10px",
      outline: "none",
    }) as const;

  const labelStyle = {
    fontSize: 11,
    fontWeight: 600 as const,
    color: C.inkMuted,
    letterSpacing: 0.3,
  };

  return (
    <div
      data-testid="talent-commercial-terms-card"
      style={{
        width: "100%",
        padding: "16px 16px 18px",
        marginBottom: 16,
        borderRadius: 12,
        background: "#fff",
        border: `1px solid ${C.borderSoft}`,
        fontFamily: FONT,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
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
            fontSize: 15,
          }}
        >
          ◷
        </span>
        <div style={{ flex: "1 1 220px", minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: C.ink }}>{t("dashboard.talentBookingTerms.cardTitle")}</div>
          <div style={{ fontSize: 11.5, color: C.inkMuted, marginTop: 2, lineHeight: 1.45 }}>
            {t("dashboard.talentBookingTerms.cardDescription")}
          </div>
        </div>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 14, marginTop: 16 }}>
        {/* Fixed rate */}
        <label style={{ display: "flex", flexDirection: "column", gap: 5, flex: "1 1 180px", minWidth: 0 }}>
          <span style={labelStyle}>{t("dashboard.talentBookingTerms.fixedRateLabel")}</span>
          <input
            type="number"
            inputMode="decimal"
            min={0}
            step="0.01"
            placeholder={t("dashboard.talentBookingTerms.fixedRatePlaceholder")}
            value={rateInput}
            disabled={saving}
            onChange={(e) => setRateInput(e.target.value)}
            onBlur={() => {
              const cents = inputToCents(rateInput);
              if (cents !== terms.fixedRateCents) persist({ ...terms, fixedRateCents: cents }, "rate");
            }}
            style={{ ...fieldStyle("rate"), width: "100%" }}
          />
          <span style={{ fontSize: 10.5, color: C.inkMuted }}>
            {t("dashboard.talentBookingTerms.fixedRateHint")}
          </span>
        </label>

        {/* Preferred deposit % */}
        <label style={{ display: "flex", flexDirection: "column", gap: 5, flex: "1 1 160px", minWidth: 0 }}>
          <span style={labelStyle}>{t("dashboard.talentBookingTerms.depositLabel")}</span>
          <input
            type="number"
            inputMode="numeric"
            min={0}
            max={100}
            step="1"
            placeholder={t("dashboard.talentBookingTerms.depositPlaceholder")}
            value={depositInput}
            disabled={saving}
            onChange={(e) => setDepositInput(e.target.value)}
            onBlur={() => {
              const t = depositInput.trim();
              const next = t === "" ? null : Math.min(100, Math.max(0, Math.round(Number(t))));
              const normalized = next !== null && Number.isFinite(next) ? next : null;
              if (normalized !== terms.depositPct) persist({ ...terms, depositPct: normalized }, "deposit");
            }}
            style={{ ...fieldStyle("deposit"), width: "100%" }}
          />
          <span style={{ fontSize: 10.5, color: C.inkMuted }}>
            {t("dashboard.talentBookingTerms.depositHint")}
          </span>
        </label>

        {/* Refund policy preset */}
        <label style={{ display: "flex", flexDirection: "column", gap: 5, flex: "1 1 200px", minWidth: 0 }}>
          <span style={labelStyle}>{t("dashboard.talentBookingTerms.refundLabel")}</span>
          <select
            value={terms.refundPolicy ?? ""}
            disabled={saving}
            onChange={(e) => {
              const v = e.target.value;
              const next = (REFUND_KEYS as string[]).includes(v) ? (v as RefundPolicyKey) : null;
              persist({ ...terms, refundPolicy: next }, "refund");
            }}
            style={{ ...fieldStyle("refund"), width: "100%", cursor: saving ? "wait" : "pointer" }}
          >
            <option value="">{t("dashboard.talentBookingTerms.refundNoPreference")}</option>
            {REFUND_KEYS.map((k) => (
              <option key={k} value={k}>{t(REFUND_POLICY_LABEL_KEYS[k])}</option>
            ))}
          </select>
          {terms.refundPolicy ? (
            <span style={{ fontSize: 10.5, color: C.inkMuted }}>
              {t(REFUND_POLICY_DESCRIPTION_KEYS[terms.refundPolicy])}
            </span>
          ) : (
            <span style={{ fontSize: 10.5, color: C.inkMuted }}>
              {t("dashboard.talentBookingTerms.refundFallback")}
            </span>
          )}
        </label>
      </div>

      {/* Instant-book opt-in */}
      <label
        style={{
          display: "flex",
          alignItems: "flex-start",
          gap: 10,
          marginTop: 16,
          cursor: saving ? "wait" : "pointer",
        }}
      >
        <input
          type="checkbox"
          checked={terms.instantBookOptIn}
          disabled={saving}
          onChange={(e) => persist({ ...terms, instantBookOptIn: e.target.checked }, "instantBook")}
          style={{ marginTop: 2, accentColor: C.accentDeep, width: 16, height: 16, flexShrink: 0 }}
        />
        <span>
          <span style={{ fontSize: 12.5, fontWeight: 600, color: C.ink }}>{t("dashboard.talentBookingTerms.instantBookTitle")}</span>
          <span style={{ display: "block", fontSize: 10.5, color: C.inkMuted, marginTop: 1, lineHeight: 1.45 }}>
            {t("dashboard.talentBookingTerms.instantBookHint")}
          </span>
        </span>
      </label>

      {/* Async state */}
      <div style={{ minHeight: 16, marginTop: 10 }}>
        {saving && <span style={{ fontSize: 11, color: C.inkMuted }}>{t("dashboard.talentBookingTerms.saving")}</span>}
        {savedOk && !saving && <span style={{ fontSize: 11, color: C.success }}>{t("dashboard.talentBookingTerms.saved")}</span>}
        {error && <span style={{ fontSize: 11, color: C.error }}>{error.message}</span>}
      </div>
    </div>
  );
}
