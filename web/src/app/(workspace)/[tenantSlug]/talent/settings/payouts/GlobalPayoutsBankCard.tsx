"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { PAYOUT_COUNTRIES, defaultPayoutCurrency, payoutCountryLabel } from "@/lib/payments/payout-countries";
import type { TalentGpMethod } from "@/lib/payments/talent-global-payouts";
import {
  loadTalentGpMethods,
  removeTalentGpMethodAction,
  setTalentGpDefaultAction,
  setupTalentGpBankAction,
} from "./actions";

const C = {
  ink: "#0B0B0D",
  inkMuted: "rgba(11,11,13,0.55)",
  borderSoft: "rgba(24,24,27,0.08)",
  border: "rgba(24,24,27,0.12)",
  surface: "#ffffff",
  surfaceAlt: "rgba(11,11,13,0.02)",
  accent: "#1f4a3a",
  green: "#1A7348",
  greenSoft: "rgba(26,115,72,0.10)",
  coral: "#A33A3A",
  coralSoft: "rgba(214,89,89,0.10)",
} as const;
const FONT = '"Inter", system-ui, sans-serif';

/** Per-country bank-field shape: what to label the account field, and whether a
 *  routing/branch number applies. Mexico (CLABE) and Argentina (CBU) and IBAN
 *  countries have NO routing number; US/UK/AU/etc. do. */
type BankFields = { accountLabel: string; accountPlaceholder: string; showRouting: boolean; routingLabel: string };
function bankFields(iso2: string): BankFields {
  const IBAN = ["ES", "PT", "FR", "DE", "IT", "NL"];
  if (iso2 === "MX") return { accountLabel: "CLABE", accountPlaceholder: "18-digit CLABE", showRouting: false, routingLabel: "" };
  if (iso2 === "AR") return { accountLabel: "CBU or CVU", accountPlaceholder: "22-digit CBU", showRouting: false, routingLabel: "" };
  if (IBAN.includes(iso2)) return { accountLabel: "IBAN", accountPlaceholder: "Your IBAN", showRouting: false, routingLabel: "" };
  if (iso2 === "GB") return { accountLabel: "Account number", accountPlaceholder: "00012345", showRouting: true, routingLabel: "Sort code" };
  if (iso2 === "AU") return { accountLabel: "Account number", accountPlaceholder: "12345678", showRouting: true, routingLabel: "BSB" };
  return { accountLabel: "Account number", accountPlaceholder: "000123456789", showRouting: true, routingLabel: "Routing / branch number" };
}

const ghostBtn = (busy = false): CSSProperties => ({
  padding: "8px 12px",
  borderRadius: 9,
  background: "transparent",
  color: C.inkMuted,
  border: `1px solid ${C.border}`,
  fontFamily: FONT,
  fontSize: 12,
  fontWeight: 600,
  cursor: busy ? "wait" : "pointer",
  whiteSpace: "nowrap",
});

/**
 * Talent "get paid globally" manager: one or more local-bank destinations on the
 * Global Payouts (v2 OutboundPayments) rail, with a default. Add / set-default /
 * remove, plus "Sync from profile". Renders inside the payouts drawer.
 */
export function GlobalPayoutsBankCard() {
  const [loading, setLoading] = useState(true);
  const [methods, setMethods] = useState<TalentGpMethod[]>([]);

  const [open, setOpen] = useState(false);
  const [country, setCountry] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [routingNumber, setRoutingNumber] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rowError, setRowError] = useState<string | null>(null);
  const [profileCountry, setProfileCountry] = useState<string | null>(null);

  const refresh = () => {
    loadTalentGpMethods().then((r) => {
      setLoading(false);
      if (r.ok) {
        setMethods(r.methods);
        setProfileCountry(r.profileCountry);
      }
    });
  };
  useEffect(() => {
    refresh();
  }, []);

  // Open the add-account form, prefilling the country from the talent's profile
  // (the "take data from profile" bit; the bank number is always entered by hand).
  const openAdd = () => {
    setError(null);
    setCountry(profileCountry ?? "");
    setAccountNumber("");
    setRoutingNumber("");
    setOpen(true);
  };

  const setDefault = (id: string) => {
    setRowError(null);
    setBusyId(id);
    setTalentGpDefaultAction(id).then((r) => {
      setBusyId(null);
      if (!r.ok) setRowError(r.error);
      else refresh();
    });
  };

  const remove = (id: string) => {
    setRowError(null);
    setBusyId(id);
    removeTalentGpMethodAction(id).then((r) => {
      setBusyId(null);
      if (!r.ok) setRowError(r.error);
      else refresh();
    });
  };

  const submit = () => {
    if (!country) {
      setError("Choose the country where you bank.");
      return;
    }
    const fields = bankFields(country);
    if (!accountNumber.trim()) {
      setError(`Enter your ${fields.accountLabel}.`);
      return;
    }
    if (fields.showRouting && !routingNumber.trim()) {
      setError(`Enter your ${fields.routingLabel}.`);
      return;
    }
    setError(null);
    setSubmitting(true);
    setupTalentGpBankAction({
      country,
      currency: defaultPayoutCurrency(country),
      accountNumber,
      routingNumber,
    }).then((r) => {
      setSubmitting(false);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setOpen(false);
      setCountry("");
      setAccountNumber("");
      setRoutingNumber("");
      refresh();
    });
  };

  if (loading) return null;

  const card: CSSProperties = {
    padding: "16px 18px",
    background: C.surface,
    border: `1px solid ${C.borderSoft}`,
    borderRadius: 14,
    marginBottom: 16,
    fontFamily: FONT,
  };

  const hasMethods = methods.length > 0;

  return (
    <div data-testid="talent-gp-bank-card" style={card}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
        <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.4, color: C.accent, textTransform: "uppercase" }}>
          Global payouts · Bank
        </span>
        <span style={{ fontSize: 10.5, fontWeight: 700, color: C.green, background: C.greenSoft, padding: "2px 7px", borderRadius: 999 }}>
          Get paid to your local bank, anywhere
        </span>
      </div>

      {open ? (
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: C.ink, marginBottom: 8 }}>
            {hasMethods ? "Add another account" : "Add your bank"}
          </div>
          <label htmlFor="gp-country" style={{ display: "block", fontSize: 12.5, fontWeight: 600, color: C.ink, marginBottom: 6 }}>
            Where do you bank?
          </label>
          <select
            id="gp-country"
            data-testid="talent-gp-country"
            value={country}
            onChange={(e) => setCountry(e.target.value)}
            style={{
              width: "100%", maxWidth: 360, padding: "10px 12px", borderRadius: 10, border: `1px solid ${C.border}`,
              fontFamily: FONT, fontSize: 13, color: C.ink, background: "#fff", marginBottom: 10,
            }}
          >
            <option value="">Select your country…</option>
            {PAYOUT_COUNTRIES.map((c) => (
              <option key={c.iso2} value={c.iso2}>
                {c.flag} {c.label}
              </option>
            ))}
          </select>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 4 }}>
            <div style={{ flex: "1 1 200px", minWidth: 0 }}>
              <label htmlFor="gp-account" style={{ display: "block", fontSize: 12, fontWeight: 600, color: C.ink, marginBottom: 4 }}>
                {bankFields(country).accountLabel}
              </label>
              <input
                id="gp-account"
                data-testid="talent-gp-account"
                value={accountNumber}
                onChange={(e) => setAccountNumber(e.target.value)}
                inputMode="numeric"
                placeholder={bankFields(country).accountPlaceholder}
                style={{ width: "100%", padding: "10px 12px", borderRadius: 10, border: `1px solid ${C.border}`, fontFamily: FONT, fontSize: 13, color: C.ink }}
              />
            </div>
            {bankFields(country).showRouting && (
              <div style={{ flex: "1 1 160px", minWidth: 0 }}>
                <label htmlFor="gp-routing" style={{ display: "block", fontSize: 12, fontWeight: 600, color: C.ink, marginBottom: 4 }}>
                  {bankFields(country).routingLabel}
                </label>
                <input
                  id="gp-routing"
                  data-testid="talent-gp-routing"
                  value={routingNumber}
                  onChange={(e) => setRoutingNumber(e.target.value)}
                  inputMode="numeric"
                  placeholder="110000000"
                  style={{ width: "100%", padding: "10px 12px", borderRadius: 10, border: `1px solid ${C.border}`, fontFamily: FONT, fontSize: 13, color: C.ink }}
                />
              </div>
            )}
          </div>
          {country && (
            <p style={{ margin: "6px 0 12px", fontSize: 11.5, color: C.inkMuted }}>
              You&apos;ll be paid in {defaultPayoutCurrency(country).toUpperCase()}. The account holder name must match your
              legal name. Your bank details are sent securely to Stripe.
            </p>
          )}

          {error && (
            <div role="alert" style={{ padding: "8px 10px", marginBottom: 10, background: C.coralSoft, color: C.coral, borderRadius: 8, fontSize: 12 }}>
              {error}
            </div>
          )}

          <div style={{ display: "flex", gap: 8 }}>
            <button
              type="button"
              data-testid="talent-gp-save"
              onClick={submit}
              disabled={submitting}
              style={{
                padding: "11px 18px", borderRadius: 10,
                background: submitting ? "rgba(31,74,58,0.6)" : C.accent, color: "#fff", border: "none",
                fontFamily: FONT, fontSize: 13, fontWeight: 700, cursor: submitting ? "wait" : "pointer", minHeight: 44,
              }}
            >
              {submitting ? "Saving…" : "Save bank"}
            </button>
            <button
              type="button"
              onClick={() => { setOpen(false); setError(null); }}
              style={{
                padding: "11px 14px", borderRadius: 10, background: "transparent", color: C.inkMuted,
                border: `1px solid ${C.border}`, fontFamily: FONT, fontSize: 12.5, fontWeight: 600, cursor: "pointer",
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : hasMethods ? (
        <div>
          <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 8 }}>
            {methods.map((m) => (
              <li
                key={m.id}
                style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap",
                  padding: "10px 12px", background: C.surfaceAlt, border: `1px solid ${C.borderSoft}`, borderRadius: 10,
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: C.ink, display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" }}>
                    <span>{m.bankName ?? "Bank account"} ····{m.last4 ?? "----"}</span>
                    {m.isDefault && (
                      <span style={{ fontSize: 10, fontWeight: 700, color: C.green, background: C.greenSoft, padding: "1px 6px", borderRadius: 999, textTransform: "uppercase", letterSpacing: 0.3 }}>
                        Default
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 12, color: C.inkMuted, marginTop: 1 }}>
                    {payoutCountryLabel(m.country)}{m.currency ? ` · ${m.currency.toUpperCase()}` : ""}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                  {!m.isDefault && (
                    <button type="button" data-testid="talent-gp-set-default" onClick={() => setDefault(m.id)} disabled={busyId === m.id} style={ghostBtn(busyId === m.id)}>
                      {busyId === m.id ? "…" : "Set default"}
                    </button>
                  )}
                  {!m.isDefault && (
                    <button type="button" data-testid="talent-gp-remove" onClick={() => remove(m.id)} disabled={busyId === m.id} style={ghostBtn(busyId === m.id)}>
                      Remove
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>

          {rowError && (
            <div role="alert" style={{ marginTop: 8, fontSize: 11.5, color: C.coral }}>{rowError}</div>
          )}

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
            <button type="button" data-testid="talent-gp-add" onClick={openAdd} style={ghostBtn()}>
              + Add account
            </button>
          </div>
        </div>
      ) : (
        <>
          <p style={{ margin: "0 0 12px", fontSize: 12.5, lineHeight: 1.55, color: C.inkMuted }}>
            Receive your booking payouts straight to your <strong style={{ color: C.ink }}>local bank account</strong>,
            in your own currency. No Stripe account or app required, and it works across 50+ countries.
          </p>
          <button
            type="button"
            data-testid="talent-gp-cta"
            onClick={openAdd}
            style={{
              padding: "11px 18px", borderRadius: 10, background: C.accent, color: "#fff", border: "none",
              fontFamily: FONT, fontSize: 13, fontWeight: 700, cursor: "pointer", minHeight: 44,
            }}
          >
            Set up bank payouts
          </button>
        </>
      )}
    </div>
  );
}
