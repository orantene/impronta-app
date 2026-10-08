"use client";

/**
 * TUL-280 · inline email-code for accepting an offer from the guest dock.
 *
 * Accepting an offer requires a signed-in client (payment, receipt, history).
 * Guests must never hit the dead-end `not_allowed` refusal — they get this
 * form in place, then the pending accept runs after verify (same as
 * `ClientAccountButton`, without leaving the talent host).
 */

import { useEffect, useState, type CSSProperties } from "react";

import { requestEmailCode } from "@/app/auth/otp-actions";
import type { Translator } from "@/i18n/interpolate";
import { interpolate } from "@/i18n/interpolate";
import { getSiteUrl } from "@/lib/auth-flow";
import { verifyClientAccountCode } from "@/lib/client-account/actions";
import { resendSecondsLeft } from "@/lib/client-account/pure";

import { FONT } from "./mini-chat-styles";

type Step = "email" | "code";

export function GuestOfferSignIn({
  locale,
  t,
  accent,
  accentInk,
  emailPrefill,
  onSignedIn,
  onCancel,
}: {
  locale: string;
  t: Translator;
  accent: string;
  accentInk: string;
  emailPrefill?: string | null;
  onSignedIn: () => void | Promise<void>;
  onCancel: () => void;
}) {
  const loc = locale.startsWith("es") ? "es" : "en";
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState(emailPrefill?.trim() ?? "");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sentAt, setSentAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const left = resendSecondsLeft(now, sentAt);
  const site = getSiteUrl();

  useEffect(() => {
    if (step !== "code") return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [step]);

  async function send(resend: boolean) {
    setBusy(true);
    setError(null);
    const fd = new FormData();
    fd.set("email", email);
    fd.set("locale", loc);
    fd.set("create", "1");
    fd.set("terms_form", "1");
    fd.set("age_terms", "on");
    fd.set("next", "/");
    if (resend) fd.set("resend", "1");
    const res = await requestEmailCode(undefined, fd);
    setBusy(false);
    if (res && (res.step === "email" || res.step === "code") && "error" in res) {
      setError(res.error);
      return;
    }
    setSentAt(Date.now());
    setNow(Date.now());
    setStep("code");
  }

  async function verify() {
    setBusy(true);
    setError(null);
    const res = await verifyClientAccountCode({ email, code, locale: loc, ageTerms: true });
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    await onSignedIn();
  }

  const field: CSSProperties = {
    width: "100%",
    boxSizing: "border-box",
    padding: "10px 12px",
    borderRadius: 10,
    border: "1px solid rgba(0,0,0,.14)",
    background: "transparent",
    fontSize: 16,
    fontFamily: FONT,
  };
  const primary: CSSProperties = {
    width: "100%",
    border: "none",
    borderRadius: 12,
    padding: "12px 14px",
    background: accent,
    color: accentInk,
    fontSize: 14,
    fontWeight: 700,
    cursor: busy ? "default" : "pointer",
    opacity: busy ? 0.7 : 1,
    fontFamily: FONT,
  };
  const linkBtn: CSSProperties = {
    background: "none",
    border: 0,
    textDecoration: "underline",
    cursor: "pointer",
    padding: 4,
    fontSize: 13,
    fontFamily: FONT,
    color: "inherit",
  };

  return (
    <form
      data-guest-offer-sign-in=""
      onSubmit={(e) => {
        e.preventDefault();
        if (!busy) void (step === "email" ? send(false) : verify());
      }}
      style={{ display: "grid", gap: 10, marginTop: 8, fontFamily: FONT }}
    >
      <div style={{ fontSize: 14, fontWeight: 700 }}>{t("public.guestChat.signInToAcceptTitle")}</div>
      <div style={{ fontSize: 12.5, opacity: 0.8 }}>
        {step === "code"
          ? interpolate(t("public.clientAccount.sentTo"), { email })
          : t("public.guestChat.signInToAcceptSub")}
      </div>
      {step === "email" ? (
        <label style={{ display: "grid", gap: 4, fontSize: 12.5 }}>
          {t("public.clientAccount.emailLabel")}
          <input
            type="email"
            required
            autoComplete="email"
            inputMode="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={field}
            data-guest-offer-sign-in-email=""
          />
        </label>
      ) : (
        <label style={{ display: "grid", gap: 4, fontSize: 12.5 }}>
          {t("public.clientAccount.codeLabel")}
          <input
            type="text"
            required
            autoComplete="one-time-code"
            inputMode="numeric"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            style={field}
            data-guest-offer-sign-in-code=""
          />
        </label>
      )}
      {error ? (
        <p role="alert" style={{ margin: 0, fontSize: 13, color: "var(--token-color-danger, #b00020)" }}>
          {error}
        </p>
      ) : null}
      <button type="submit" disabled={busy} style={primary} data-guest-offer-sign-in-submit="">
        {step === "email" ? t("public.clientAccount.sendCode") : t("public.clientAccount.verify")}
      </button>
      {step === "code" ? (
        <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
          <button
            type="button"
            disabled={busy || left > 0}
            onClick={() => {
              setNow(Date.now());
              void send(true);
            }}
            style={{ ...linkBtn, opacity: left > 0 ? 0.6 : 1 }}
          >
            {left > 0 ? interpolate(t("public.clientAccount.resendIn"), { s: String(left) }) : t("public.clientAccount.resend")}
          </button>
          <button
            type="button"
            onClick={() => {
              setStep("email");
              setCode("");
              setError(null);
            }}
            style={linkBtn}
          >
            {t("public.clientAccount.changeEmail")}
          </button>
        </div>
      ) : null}
      <button type="button" onClick={onCancel} style={{ ...linkBtn, justifySelf: "start" }} data-guest-offer-sign-in-cancel="">
        {t("public.guestChat.signInToAcceptCancel")}
      </button>
      <p style={{ margin: 0, fontSize: 11, opacity: 0.7 }}>
        {t("public.clientAccount.legalPrefix")}{" "}
        <a href={`${site}/legal/terms`} target="_blank" rel="noopener noreferrer" style={{ color: "inherit" }}>
          {t("public.clientAccount.legalTerms")}
        </a>{" "}
        {t("public.clientAccount.legalAnd")}{" "}
        <a href={`${site}/legal/privacy`} target="_blank" rel="noopener noreferrer" style={{ color: "inherit" }}>
          {t("public.clientAccount.legalPrivacy")}
        </a>
        .
      </p>
    </form>
  );
}
