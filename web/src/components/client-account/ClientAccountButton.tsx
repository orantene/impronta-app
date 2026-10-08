"use client";

/**
 * Client account button + sign-in popover for talent sites.
 *
 * `variant="dock"` floats above the chat launcher; `variant="header"` sits in
 * the site header. Both open the same popover (bottom sheet under 640 px, focus
 * trapped, Esc closes). Colours come only from the `<html>` token vars
 * (`--token-color-*`), so it wears the site's look. Sign-in is email code only:
 * Google and password are intentionally absent on talent hosts (see PR notes).
 */

import { useCallback, useEffect, useRef, useState } from "react";

import { requestEmailCode } from "@/app/auth/otp-actions";
import { createTranslator } from "@/i18n/messages";
import { interpolate } from "@/i18n/interpolate";
import { getSiteUrl } from "@/lib/auth-flow";
import {
  saveClientMarketingConsent,
  signOutClientAccount,
  verifyClientAccountCode,
} from "@/lib/client-account/actions";
import { resendSecondsLeft, type AccountSummary } from "@/lib/client-account/pure";

type Me = { signedIn: false; signedInAs?: "business" } | { signedIn: true; email: string | null; initials: string; summary: AccountSummary };
type Step = "email" | "code" | "consent";

const INK = "var(--token-color-ink, #111)";
const BG = "var(--token-color-surface-raised, var(--token-color-background, #fff))";
const ACCENT = "var(--token-color-primary, #111)";
const LINE = "var(--token-color-line, rgba(0,0,0,.14))";

function PersonIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 20c1.5-3.5 4.5-5 8-5s6.5 1.5 8 5" />
    </svg>
  );
}

function money(cents: number, currency: string, locale: string): string {
  try {
    return new Intl.NumberFormat(locale === "es" ? "es-MX" : "en-US", { style: "currency", currency }).format(cents / 100);
  } catch {
    return `${(cents / 100).toFixed(2)} ${currency}`;
  }
}

export function ClientAccountButton({
  variant,
  locale,
  accountHref = "/account",
}: {
  variant: "dock" | "header";
  locale: string;
  /** Where "My account" goes; absolute on the marketing apex (see `accountHrefFor`). */
  accountHref?: string;
}) {
  const loc = locale === "es" ? "es" : "en";
  const t = createTranslator(loc);
  const [open, setOpen] = useState(false);
  const [me, setMe] = useState<Me>({ signedIn: false });
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sentAt, setSentAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [optIn, setOptIn] = useState(false);
  const sheetRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  const refresh = useCallback(async () => {
    try {
      const qs = new URLSearchParams({ locale: loc });
      const res = await fetch(`/api/client/account?${qs.toString()}`, { credentials: "same-origin" });
      if (!res.ok) return;
      setMe((await res.json()) as Me);
    } catch {
      /* stays signed out */
    }
  }, [loc]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!open) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [open]);

  const close = useCallback(() => {
    setOpen(false);
    triggerRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!open) return;
    const root = sheetRef.current;
    root?.querySelector<HTMLElement>("input,button")?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        close();
        return;
      }
      if (e.key !== "Tab" || !root) return;
      const items = Array.from(root.querySelectorAll<HTMLElement>("a[href],button:not([disabled]),input:not([disabled])"));
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, close, step, me.signedIn]);

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
    await refresh();
    if (res.firstSignIn) setStep("consent");
    else close();
  }

  async function finishConsent(save: boolean) {
    if (save) await saveClientMarketingConsent(optIn);
    close();
  }

  async function logOut() {
    setBusy(true);
    await signOutClientAccount();
    setBusy(false);
    setMe({ signedIn: false });
    setStep("email");
    setCode("");
    close();
  }

  const left = resendSecondsLeft(now, sentAt);
  const label = me.signedIn ? t("public.clientAccount.account") : t("public.clientAccount.signIn");
  const site = getSiteUrl();

  const trigger = (
    <button
      ref={triggerRef}
      type="button"
      onClick={() => setOpen(true)}
      aria-haspopup="dialog"
      aria-expanded={open}
      aria-label={`${t("public.clientAccount.openLabel")}: ${label}`}
      data-client-account-trigger={variant}
      style={{
        width: 44,
        height: 44,
        borderRadius: 999,
        border: `1px solid ${LINE}`,
        background: BG,
        color: INK,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: 14,
        fontWeight: 600,
        cursor: "pointer",
        boxShadow: variant === "dock" ? "0 4px 14px rgba(0,0,0,.18)" : "none",
        ...(variant === "dock"
          ? { position: "fixed", right: "max(16px, env(safe-area-inset-right))", bottom: "var(--client-account-dock-bottom, 194px)", zIndex: 95 }
          : {}),
      }}
    >
      {me.signedIn ? me.initials : <PersonIcon />}
    </button>
  );

  const field = { width: "100%", padding: "10px 12px", borderRadius: 8, border: `1px solid ${LINE}`, background: "transparent", color: INK, fontSize: 16 } as const;
  const primary = { width: "100%", padding: "11px 14px", borderRadius: 999, border: 0, background: ACCENT, color: "var(--token-color-on-primary, #fff)", fontWeight: 600, cursor: "pointer" } as const;
  const linkBtn = { background: "none", border: 0, color: INK, textDecoration: "underline", cursor: "pointer", padding: 4, fontSize: 14 } as const;

  return (
    <>
      <style>{`[data-client-account-dock]{--client-account-dock-bottom:194px}@media (max-width:480px){[data-client-account-dock]{--client-account-dock-bottom:calc(88px + env(safe-area-inset-bottom))}}[data-client-account-sheet]{position:fixed;z-index:120;background:${BG};color:${INK};border:1px solid ${LINE};box-shadow:0 12px 40px rgba(0,0,0,.25);padding:20px;display:flex;flex-direction:column;gap:12px;font-family:var(--site-body-font,inherit)}@media (min-width:640px){[data-client-account-sheet]{width:340px;border-radius:14px;right:16px;${variant === "dock" ? "bottom:250px" : "top:64px"}}}@media (max-width:639px){[data-client-account-sheet]{left:0;right:0;bottom:0;border-radius:16px 16px 0 0;padding-bottom:calc(20px + env(safe-area-inset-bottom));max-height:85vh;overflow:auto}}`}</style>
      <span data-client-account-dock={variant === "dock" ? "" : undefined}>{trigger}</span>
      {open ? (
        <>
          <div onClick={close} aria-hidden style={{ position: "fixed", inset: 0, zIndex: 119, background: "rgba(0,0,0,.25)" }} />
          <div ref={sheetRef} role="dialog" aria-modal="true" aria-label={me.signedIn ? t("public.clientAccount.account") : t("public.clientAccount.title")} data-client-account-sheet="">
            <button type="button" onClick={close} aria-label={t("public.clientAccount.closeLabel")} style={{ ...linkBtn, alignSelf: "flex-end", textDecoration: "none", fontSize: 20, lineHeight: 1 }}>
              ×
            </button>
            {!me.signedIn && me.signedInAs === "business" ? (
              <p role="alert" style={{ margin: 0, fontSize: 14 }}>
                {t("public.clientAccount.signedInAsTalent")}
              </p>
            ) : me.signedIn && step !== "consent" ? (
              <>
                <p style={{ margin: 0, fontSize: 13, opacity: 0.7 }}>{interpolate(t("public.clientAccount.signedInAs"), { email: me.email ?? "" })}</p>
                <dl style={{ margin: 0, display: "grid", gap: 10 }}>
                  <div>
                    <dt style={{ fontSize: 12, opacity: 0.7 }}>{t("public.clientAccount.nextVisit")}</dt>
                    <dd style={{ margin: 0, fontWeight: 600 }}>
                      {me.summary.nextVisit
                        ? `${me.summary.nextVisit.service ? `${me.summary.nextVisit.service}, ` : ""}${me.summary.nextVisit.dateLabel}, ${me.summary.nextVisit.timeLabel}`
                        : t("public.clientAccount.noVisit")}
                    </dd>
                  </div>
                  <div>
                    <dt style={{ fontSize: 12, opacity: 0.7 }}>{t("public.clientAccount.unread")}</dt>
                    <dd style={{ margin: 0, fontWeight: 600 }}>{me.summary.unread}</dd>
                  </div>
                  {me.summary.balanceDue ? (
                    <div>
                      <dt style={{ fontSize: 12, opacity: 0.7 }}>{t("public.clientAccount.balanceDue")}</dt>
                      <dd style={{ margin: 0, fontWeight: 600 }}>{money(me.summary.balanceDue.amountCents, me.summary.balanceDue.currencyCode, loc)}</dd>
                    </div>
                  ) : null}
                </dl>
                <a href={accountHref} style={{ ...primary, textAlign: "center", textDecoration: "none", boxSizing: "border-box" }}>
                  {t("public.clientAccount.myAccount")}
                </a>
                <button type="button" onClick={logOut} disabled={busy} style={linkBtn}>
                  {t("public.clientAccount.logOut")}
                </button>
              </>
            ) : step === "consent" ? (
              <>
                <h2 style={{ margin: 0, fontSize: 17 }}>{t("public.clientAccount.consentTitle")}</h2>
                <label style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 14 }}>
                  <input type="checkbox" checked={optIn} onChange={(e) => setOptIn(e.target.checked)} style={{ marginTop: 3 }} />
                  <span>{t("public.clientAccount.consentLabel")}</span>
                </label>
                <button type="button" onClick={() => void finishConsent(true)} style={primary}>
                  {t("public.clientAccount.consentSave")}
                </button>
                <button type="button" onClick={() => void finishConsent(false)} style={linkBtn}>
                  {t("public.clientAccount.consentSkip")}
                </button>
              </>
            ) : (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!busy) void (step === "email" ? send(false) : verify());
                }}
                style={{ display: "grid", gap: 12 }}
              >
                <h2 style={{ margin: 0, fontSize: 17 }}>{t("public.clientAccount.title")}</h2>
                <p style={{ margin: 0, fontSize: 14, opacity: 0.8 }}>
                  {step === "code" ? interpolate(t("public.clientAccount.sentTo"), { email }) : t("public.clientAccount.subtitle")}
                </p>
                {step === "email" ? (
                  <label style={{ display: "grid", gap: 4, fontSize: 13 }}>
                    {t("public.clientAccount.emailLabel")}
                    <input type="email" required autoComplete="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} style={field} />
                  </label>
                ) : (
                  <label style={{ display: "grid", gap: 4, fontSize: 13 }}>
                    {t("public.clientAccount.codeLabel")}
                    <input type="text" required autoComplete="one-time-code" inputMode="numeric" value={code} onChange={(e) => setCode(e.target.value)} style={field} />
                  </label>
                )}
                {error ? (
                  <p role="alert" style={{ margin: 0, fontSize: 13, color: "var(--token-color-danger, #b00020)" }}>
                    {error}
                  </p>
                ) : null}
                <button type="submit" disabled={busy} style={primary}>
                  {step === "email" ? t("public.clientAccount.sendCode") : t("public.clientAccount.verify")}
                </button>
                {step === "code" ? (
                  <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap" }}>
                    <button type="button" disabled={busy || left > 0} onClick={() => void send(true)} style={{ ...linkBtn, opacity: left > 0 ? 0.6 : 1 }}>
                      {left > 0 ? interpolate(t("public.clientAccount.resendIn"), { s: String(left) }) : t("public.clientAccount.resend")}
                    </button>
                    <button type="button" onClick={() => { setStep("email"); setCode(""); setError(null); }} style={linkBtn}>
                      {t("public.clientAccount.changeEmail")}
                    </button>
                  </div>
                ) : null}
                <p style={{ margin: 0, fontSize: 12, opacity: 0.75 }}>
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
            )}
          </div>
        </>
      ) : null}
    </>
  );
}
