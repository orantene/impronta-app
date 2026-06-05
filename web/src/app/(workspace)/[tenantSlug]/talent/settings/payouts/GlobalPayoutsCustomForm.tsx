"use client";

import { useEffect, useState, type CSSProperties } from "react";
import type { TalentGpMethod, TalentGpStatusKind } from "@/lib/payments/talent-global-payouts";
import { loadTalentGpPrefillAction, setupTalentGpBankAction } from "./actions";

const C = {
  ink: "#0B0B0D",
  inkMuted: "rgba(11,11,13,0.55)",
  inkDim: "rgba(11,11,13,0.4)",
  borderSoft: "rgba(24,24,27,0.08)",
  border: "rgba(24,24,27,0.12)",
  surface: "#ffffff",
  surfaceAlt: "rgba(11,11,13,0.02)",
  field: "#ffffff",
  fieldLocked: "rgba(11,11,13,0.04)",
  accent: "#1f4a3a",
  green: "#1A7348",
  greenSoft: "rgba(26,115,72,0.10)",
  coral: "#A33A3A",
} as const;
const FONT = '"Inter", system-ui, sans-serif';

const label: CSSProperties = {
  display: "block",
  fontSize: 11.5,
  fontWeight: 700,
  color: C.ink,
  letterSpacing: 0.1,
  marginBottom: 5,
};
const fieldBase: CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: 10,
  border: `1px solid ${C.border}`,
  fontFamily: FONT,
  fontSize: 13,
  color: C.ink,
  background: C.field,
  boxSizing: "border-box",
};
const helper: CSSProperties = {
  margin: "5px 0 0",
  fontSize: 11,
  lineHeight: 1.5,
  color: C.inkDim,
};
const primaryBtn = (busy: boolean): CSSProperties => ({
  padding: "11px 18px",
  borderRadius: 10,
  background: busy ? "rgba(31,74,58,0.6)" : C.accent,
  color: "#fff",
  border: "none",
  fontFamily: FONT,
  fontSize: 13,
  fontWeight: 700,
  cursor: busy ? "wait" : "pointer",
  minHeight: 44,
});
const ghostBtn: CSSProperties = {
  padding: "11px 16px",
  borderRadius: 10,
  background: "transparent",
  color: C.inkMuted,
  border: `1px solid ${C.border}`,
  fontFamily: FONT,
  fontSize: 12.5,
  fontWeight: 600,
  cursor: "pointer",
  minHeight: 44,
};

function Field({
  id,
  labelText,
  value,
  onChange,
  helperText,
  locked = false,
  type = "text",
  placeholder,
  inputMode,
  maxLength,
}: {
  id: string;
  labelText: string;
  value: string;
  onChange?: (v: string) => void;
  helperText?: string;
  locked?: boolean;
  type?: string;
  placeholder?: string;
  inputMode?: "text" | "numeric" | "tel" | "email";
  maxLength?: number;
}) {
  return (
    <div style={{ marginBottom: 13 }}>
      <label htmlFor={id} style={label}>
        {labelText}
      </label>
      <input
        id={id}
        data-testid={`gp-field-${id}`}
        type={type}
        value={value}
        readOnly={locked}
        disabled={locked}
        placeholder={placeholder}
        inputMode={inputMode}
        maxLength={maxLength}
        onChange={onChange ? (e) => onChange(e.target.value) : undefined}
        style={{
          ...fieldBase,
          background: locked ? C.fieldLocked : C.field,
          color: locked ? C.inkMuted : C.ink,
          cursor: locked ? "not-allowed" : "text",
        }}
      />
      {helperText && <p style={helper}>{helperText}</p>}
    </div>
  );
}

const stepDot = (active: boolean, done: boolean): CSSProperties => ({
  width: 22,
  height: 22,
  borderRadius: 999,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  fontSize: 11,
  fontWeight: 700,
  flexShrink: 0,
  background: done ? C.green : active ? C.accent : C.surfaceAlt,
  color: done || active ? "#fff" : C.inkDim,
  border: done || active ? "none" : `1px solid ${C.border}`,
});

/**
 * Custom, in-app multi-step Global Payouts recipient form. Mirrors the steps of
 * Stripe's co-branded hosted flow (Confirm recipient → Add payout method → Save
 * with Stripe), in Tulala's own UI, saving to the REAL v2 Money Movement API via
 * the talent-global-payouts helpers. Bank credentials never persist locally —
 * the CLABE is sent straight to Stripe; we keep only the returned last4.
 *
 * `mode="full"` runs Step 1 then Step 2 (first-time setup). `mode="add-bank"`
 * skips Step 1 (recipient already exists) and goes straight to the CLABE step
 * for adding another account.
 */
export function GlobalPayoutsCustomForm({
  mode,
  onDone,
  onCancel,
}: {
  mode: "full" | "add-bank";
  onDone: (methods: TalentGpMethod[], status: TalentGpStatusKind) => void;
  onCancel: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [step, setStep] = useState<1 | 2>(mode === "add-bank" ? 2 : 1);
  const [recipientExists, setRecipientExists] = useState(mode === "add-bank");

  // Step 1 — recipient identity (prefilled, reviewable).
  const [email, setEmail] = useState("");
  const [country, setCountry] = useState("MX");
  const [displayName, setDisplayName] = useState("");
  const [phone, setPhone] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");

  // Step 2 — Mexico local bank (CLABE).
  const [clabe, setClabe] = useState("");

  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    loadTalentGpPrefillAction().then((r) => {
      if (cancelled) return;
      setLoading(false);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      const p = r.prefill;
      setEmail(p.email);
      setCountry(p.country ?? "MX");
      setDisplayName(p.displayName);
      setFirstName(p.legalFirstName);
      setLastName(p.legalLastName);
      setPhone(p.phone);
      setRecipientExists(p.recipientExists);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const continueToBank = () => {
    if (!firstName.trim() || !lastName.trim()) {
      setError("Enter your legal first and last name (must match your bank account).");
      return;
    }
    setError(null);
    setStep(2);
  };

  const save = () => {
    const digits = clabe.replace(/\s+/g, "");
    if (!/^\d{18}$/.test(digits)) {
      setError("Enter your 18-digit CLABE.");
      return;
    }
    setError(null);
    setSaving(true);
    setupTalentGpBankAction({
      country: "MX",
      currency: "mxn",
      accountNumber: digits,
      // Mexico CLABE carries no routing/branch number.
      routingNumber: null,
      displayName: displayName.trim() || `${firstName} ${lastName}`.trim(),
      givenName: firstName.trim(),
      surname: lastName.trim(),
      phone: phone.trim() || null,
      recipientType: "individual",
    }).then((r) => {
      setSaving(false);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      onDone(r.methods, r.status);
    });
  };

  if (loading) {
    return (
      <div style={{ fontFamily: FONT, fontSize: 12.5, color: C.inkMuted, padding: "10px 2px" }}>
        Loading your details…
      </div>
    );
  }

  const wrap: CSSProperties = {
    fontFamily: FONT,
    border: `1px solid ${C.borderSoft}`,
    borderRadius: 12,
    padding: "16px 16px 14px",
    background: C.surface,
  };
  const emailCountryLocked = recipientExists;

  return (
    <div data-testid="gp-custom-form" style={wrap}>
      {/* Stepper header */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
        <span style={stepDot(step === 1, step > 1)}>{step > 1 ? "✓" : "1"}</span>
        <span style={{ fontSize: 12, fontWeight: 700, color: step === 1 ? C.ink : C.inkMuted }}>
          Confirm recipient
        </span>
        <span style={{ flex: 1, height: 1, background: C.border }} />
        <span style={stepDot(step === 2, false)}>2</span>
        <span style={{ fontSize: 12, fontWeight: 700, color: step === 2 ? C.ink : C.inkMuted }}>
          Add payout method
        </span>
      </div>

      {step === 1 ? (
        <>
          <Field
            id="email"
            labelText="Email"
            value={email}
            onChange={emailCountryLocked ? undefined : setEmail}
            locked={emailCountryLocked}
            type="email"
            inputMode="email"
          />
          <Field
            id="country"
            labelText="Country"
            value="🇲🇽 Mexico"
            locked
            helperText="The email address and country for a recipient cannot be changed. To use a different email address or country, create a new recipient."
          />

          <div style={{ marginBottom: 13 }}>
            <label htmlFor="recipient-type" style={label}>
              Recipient type
            </label>
            <select
              id="recipient-type"
              data-testid="gp-field-recipient-type"
              value="individual"
              disabled
              style={{ ...fieldBase, background: C.fieldLocked, color: C.inkMuted, cursor: "not-allowed" }}
            >
              <option value="individual">Individual</option>
              <option value="company">Company (coming soon)</option>
            </select>
          </div>

          <Field id="display-name" labelText="Display name" value={displayName} onChange={setDisplayName} />

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <div style={{ flex: "1 1 140px", minWidth: 0 }}>
              <Field id="first-name" labelText="Legal first name" value={firstName} onChange={setFirstName} />
            </div>
            <div style={{ flex: "1 1 140px", minWidth: 0 }}>
              <Field id="last-name" labelText="Legal last name" value={lastName} onChange={setLastName} />
            </div>
          </div>
          <p style={{ ...helper, margin: "-6px 0 13px" }}>
            Must match the name associated with the bank account that you&apos;ll provide next.
          </p>

          <Field
            id="phone"
            labelText="Phone"
            value={phone}
            onChange={setPhone}
            type="tel"
            inputMode="tel"
            placeholder="+52 …"
            helperText="This phone number will only be used when needed to verify your recipient's identity."
          />

          {error && (
            <div role="alert" style={{ margin: "4px 0 12px", fontSize: 12, color: C.coral }}>
              {error}
            </div>
          )}

          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" data-testid="gp-step1-continue" onClick={continueToBank} style={primaryBtn(false)}>
              Continue
            </button>
            <button type="button" onClick={onCancel} style={ghostBtn}>
              Cancel
            </button>
          </div>
        </>
      ) : (
        <>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <div style={{ flex: "1 1 140px", minWidth: 0 }}>
              <Field id="bank-country" labelText="Country" value="🇲🇽 Mexico" locked />
            </div>
            <div style={{ flex: "1 1 100px", minWidth: 0 }}>
              <Field id="bank-currency" labelText="Currency" value="MXN" locked />
            </div>
          </div>

          <div style={{ marginBottom: 13 }}>
            <label htmlFor="method-type" style={label}>
              Method
            </label>
            <select
              id="method-type"
              data-testid="gp-field-method"
              value="local_bank_account"
              disabled
              style={{ ...fieldBase, background: C.fieldLocked, color: C.inkMuted, cursor: "not-allowed" }}
            >
              <option value="local_bank_account">Local bank account</option>
            </select>
          </div>

          <Field
            id="clabe"
            labelText="CLABE"
            value={clabe}
            onChange={(v) => setClabe(v.replace(/[^\d]/g, "").slice(0, 18))}
            inputMode="numeric"
            maxLength={18}
            placeholder="18-digit CLABE"
            helperText="You'll be paid in MXN. The account holder name must match your legal name. Your bank details are sent securely to Stripe."
          />

          {error && (
            <div role="alert" style={{ margin: "4px 0 12px", fontSize: 12, color: C.coral }}>
              {error}
            </div>
          )}

          <div style={{ display: "flex", gap: 8 }}>
            <button
              type="button"
              data-testid="gp-step2-save"
              onClick={save}
              disabled={saving}
              style={primaryBtn(saving)}
            >
              {saving ? "Saving with Stripe…" : "Save with Stripe"}
            </button>
            <button
              type="button"
              onClick={mode === "add-bank" ? onCancel : () => setStep(1)}
              disabled={saving}
              style={ghostBtn}
            >
              {mode === "add-bank" ? "Cancel" : "Back"}
            </button>
          </div>
          <p style={{ ...helper, marginTop: 11 }}>
            Your bank details are never stored on Tulala — only the last 4 digits, for your reference.
          </p>
        </>
      )}
    </div>
  );
}
