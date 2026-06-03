"use client";

/**
 * CommercialTermsEditor — talent commercial booking *preferences* inside the
 * profile-editor drawer (a registered profile section).
 *
 * Self-contained + self-saving: it loads and persists
 * `talent_profiles.booking_terms` (TalentBookingTerms) through the focused
 * load/update server actions, with the drawer's standard explicit async-state
 * chrome (loading / saving / saved / error). It deliberately does NOT thread
 * through the big profile reducer / saveAll pipeline — booking_terms is a
 * small, independent jsonb preference object, mirroring how the talent
 * Settings card persists it. This keeps the giant drawer save path untouched.
 *
 * CONFIGURATION ONLY: these are defaults that inform offers + the public page.
 * The binding deposit/terms for a booking are set per-offer in the booking
 * flow. No money is charged here.
 *
 * Visual language matches the surrounding drawer editors (FONTS/COLORS tokens,
 * pill selects, FieldRow-like stacked labels).
 */

import React from "react";
import {
  loadTalentBookingTerms,
  updateTalentBookingTerms,
} from "@/lib/talent/talent-booking-terms-actions";
import {
  REFUND_POLICY_DESCRIPTIONS,
  REFUND_POLICY_LABELS,
  type RefundPolicyKey,
  type TalentBookingTerms,
} from "@/lib/billing/commercial-terms-types";
import { COLORS, FONTS } from "../../drawer-shared";

const REFUND_KEYS: RefundPolicyKey[] = ["tiered", "flexible", "strict", "manual"];

const EMPTY: TalentBookingTerms = {
  depositPct: null,
  refundPolicy: null,
  instantBookOptIn: false,
  fixedRateCents: null,
};

function centsToInput(cents: number | null): string {
  return cents === null ? "" : (cents / 100).toString();
}

function inputToCents(raw: string): number | null {
  const t = raw.trim();
  if (!t) return null;
  const n = Number(t);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100);
}

type SaveState = "idle" | "saving" | "saved" | "error";

export function CommercialTermsEditor({
  talentId,
  readOnly = false,
}: {
  talentId: string;
  readOnly?: boolean;
}) {
  const [terms, setTerms] = React.useState<TalentBookingTerms>(EMPTY);
  const [rateInput, setRateInput] = React.useState("");
  const [depositInput, setDepositInput] = React.useState("");
  const [loading, setLoading] = React.useState(true);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [saveState, setSaveState] = React.useState<SaveState>("idle");
  const [saveError, setSaveError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    loadTalentBookingTerms(talentId)
      .then((res) => {
        if (cancelled) return;
        if (res.ok) {
          setTerms(res.terms);
          setRateInput(centsToInput(res.terms.fixedRateCents));
          setDepositInput(res.terms.depositPct === null ? "" : String(res.terms.depositPct));
        } else {
          setLoadError(res.error);
        }
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setLoadError("Could not load booking terms.");
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, [talentId]);

  function persist(next: TalentBookingTerms) {
    if (readOnly) return;
    const previous = terms;
    setTerms(next); // optimistic
    setSaveState("saving");
    setSaveError(null);
    void updateTalentBookingTerms(talentId, next)
      .then((res) => {
        if (res.ok) {
          setTerms(res.terms);
          setRateInput(centsToInput(res.terms.fixedRateCents));
          setDepositInput(res.terms.depositPct === null ? "" : String(res.terms.depositPct));
          setSaveState("saved");
          setTimeout(() => setSaveState((s) => (s === "saved" ? "idle" : s)), 2000);
        } else {
          setTerms(previous); // rollback
          setRateInput(centsToInput(previous.fixedRateCents));
          setDepositInput(previous.depositPct === null ? "" : String(previous.depositPct));
          setSaveState("error");
          setSaveError(res.error);
        }
      })
      .catch(() => {
        setTerms(previous);
        setSaveState("error");
        setSaveError("Unexpected error.");
      });
  }

  if (loading) {
    return (
      <div style={{ padding: 14, fontSize: 12, fontFamily: FONTS.body }} className="text-admin-ink-muted">
        Loading booking terms…
      </div>
    );
  }

  if (loadError) {
    return (
      <div style={{ padding: 14, borderRadius: 10, border: `1px solid ${COLORS.borderSoft}`, fontSize: 12, fontFamily: FONTS.body }} className="text-admin-ink-muted">
        {loadError}
      </div>
    );
  }

  const saving = saveState === "saving";
  const inputStyle = {
    width: "100%",
    padding: "9px 10px",
    borderRadius: 8,
    border: `1px solid ${saveState === "error" ? "#FCA5A5" : COLORS.borderSoft}`,
    background: saving ? COLORS.surface : "#fff",
    color: COLORS.ink,
    fontSize: 13,
    fontFamily: FONTS.body,
    outline: "none",
  } as const;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14, fontFamily: FONTS.body }}>
      <div style={{ fontSize: 12, lineHeight: 1.5 }} className="text-admin-ink-muted">
        These are the talent&apos;s default preferences — they inform offers and
        show on the public page. The binding deposit and terms for each booking
        are set per-offer in the booking flow.
      </div>

      {/* Fixed rate */}
      <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
        <span className="text-admin-ink text-admin-12 font-semibold">Fixed rate (optional)</span>
        <input
          type="number"
          inputMode="decimal"
          min={0}
          step="0.01"
          placeholder="e.g. 1500"
          value={rateInput}
          disabled={saving || readOnly}
          onChange={(e) => setRateInput(e.target.value)}
          onBlur={() => {
            const cents = inputToCents(rateInput);
            if (cents !== terms.fixedRateCents) persist({ ...terms, fixedRateCents: cents });
          }}
          style={inputStyle}
        />
        <span style={{ fontSize: 11 }} className="text-admin-ink-muted">
          A starting price shown as &ldquo;From …&rdquo;. Leave blank for quote-only.
        </span>
      </label>

      {/* Preferred deposit % */}
      <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
        <span className="text-admin-ink text-admin-12 font-semibold">Preferred deposit %</span>
        <input
          type="number"
          inputMode="numeric"
          min={0}
          max={100}
          step="1"
          placeholder="e.g. 25"
          value={depositInput}
          disabled={saving || readOnly}
          onChange={(e) => setDepositInput(e.target.value)}
          onBlur={() => {
            const t = depositInput.trim();
            const parsed = t === "" ? null : Math.min(100, Math.max(0, Math.round(Number(t))));
            const next = parsed !== null && Number.isFinite(parsed) ? parsed : null;
            if (next !== terms.depositPct) persist({ ...terms, depositPct: next });
          }}
          style={inputStyle}
        />
        <span style={{ fontSize: 11 }} className="text-admin-ink-muted">
          Suggested upfront share. Not binding.
        </span>
      </label>

      {/* Refund policy preset */}
      <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
        <span className="text-admin-ink text-admin-12 font-semibold">Preferred refund policy</span>
        <select
          value={terms.refundPolicy ?? ""}
          disabled={saving || readOnly}
          onChange={(e) => {
            const v = e.target.value;
            const next = (REFUND_KEYS as string[]).includes(v) ? (v as RefundPolicyKey) : null;
            persist({ ...terms, refundPolicy: next });
          }}
          style={{ ...inputStyle, cursor: saving ? "wait" : "pointer" }}
        >
          <option value="">No preference</option>
          {REFUND_KEYS.map((k) => (
            <option key={k} value={k}>{REFUND_POLICY_LABELS[k]}</option>
          ))}
        </select>
        <span style={{ fontSize: 11 }} className="text-admin-ink-muted">
          {terms.refundPolicy
            ? REFUND_POLICY_DESCRIPTIONS[terms.refundPolicy]
            : "Falls back to the agency's policy."}
        </span>
      </label>

      {/* Instant-book opt-in */}
      <label style={{ display: "flex", alignItems: "flex-start", gap: 10, cursor: readOnly ? "default" : "pointer" }}>
        <input
          type="checkbox"
          checked={terms.instantBookOptIn}
          disabled={saving || readOnly}
          onChange={(e) => persist({ ...terms, instantBookOptIn: e.target.checked })}
          style={{ marginTop: 2, accentColor: COLORS.accentDeep, width: 16, height: 16, flexShrink: 0 }}
        />
        <span>
          <span className="text-admin-ink text-admin-12 font-semibold">Open to instant booking</span>
          <span style={{ display: "block", fontSize: 11, marginTop: 1, lineHeight: 1.45 }} className="text-admin-ink-muted">
            Signals the talent is happy to be booked without a back-and-forth.
            Whether instant-book is offered still depends on the agency and project.
          </span>
        </span>
      </label>

      {/* Async state */}
      <div style={{ minHeight: 16 }}>
        {saving && <span style={{ fontSize: 11 }} className="text-admin-ink-muted">Saving…</span>}
        {saveState === "saved" && <span style={{ fontSize: 11, color: "#16a34a" }}>Saved</span>}
        {saveState === "error" && saveError && <span style={{ fontSize: 11, color: "#dc2626" }}>{saveError}</span>}
      </div>
    </div>
  );
}
