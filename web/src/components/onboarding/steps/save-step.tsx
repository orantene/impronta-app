"use client";

import { getSiteUrl } from "@/lib/auth-flow";

/**
 * Step 3 · Save it. Google, or an email that gets an 8-digit code. The
 * screen is the same whether the address is new or known. Signed-in people
 * skip it (the module never shows it to them).
 */

import { useState } from "react";

import { AuthGoogleButtonSurface } from "@/components/auth/auth-ui";
import type { OnboardingChoice, OnboardingPath } from "@/lib/onboarding/module-state";

import { useGooglePopup } from "../use-google-popup";
import { Notice, PrimaryButton, Sub, Title } from "../ui";

export function SaveStep({
  t,
  path,
  choice = null,
  busy,
  error,
  onEmail,
  onGoogleSuccess,
}: {
  t: (key: string) => string;
  path: OnboardingPath;
  /** The screen-1 choice rides the Google `next` URL so it survives the redirect (TUL-82). */
  choice?: OnboardingChoice | null;
  busy: boolean;
  error: string | null;
  onEmail: (email: string, ageTerms: boolean) => void;
  onGoogleSuccess: () => void;
}) {
  const [email, setEmail] = useState("");
  // Legal 2.2: 18+ and Terms/Privacy, required before a code is sent. The
  // server action re-checks it; `disabled` here is only a convenience.
  const [ageTerms, setAgeTerms] = useState(false);
  // Talent (and both): the callback promotes the fresh profile to talent when
  // `next` is a talent onboarding path. The module ignores the destination.
  const base = path === "business" ? "/" : "/talent/profile/fields";
  const next = choice ? `${base}?choice=${choice}` : base;
  const google = useGooglePopup({ next, onSuccess: onGoogleSuccess });
  const googleError =
    google.error === "blocked" ? t("public.onboarding.save.popupBlocked")
    : google.error === "closed" ? t("public.onboarding.save.popupClosed")
    : google.error === "failed" ? t("public.onboarding.save.googleFailed")
    : null;
  const submit = () => {
    if (email.trim() && ageTerms && !busy) onEmail(email.trim(), true);
  };
  return (
    <div data-testid="onb-save">
      <Title>{path === "talent" ? t("public.onboarding.save.title") : t("public.onboarding.save.titleBusiness")}</Title>
      <Sub>{t("public.onboarding.save.sub")}</Sub>

      <div className="mt-5" data-testid="onb-google">
        <AuthGoogleButtonSurface
          pending={google.pending}
          label={t("public.onboarding.save.google")}
          pendingLabel={t("public.onboarding.save.googleOpening")}
          error={googleError}
          onClick={google.open}
        />
      </div>

      <div className="my-4 flex items-center gap-3 text-[0.75rem] uppercase tracking-[0.08em]" style={{ color: "var(--tl-muted)" }}>
        <span className="h-px flex-1" style={{ background: "var(--tl-hairline)" }} />
        {t("public.onboarding.save.or")}
        <span className="h-px flex-1" style={{ background: "var(--tl-hairline)" }} />
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <label className="block text-[0.75rem] font-semibold uppercase tracking-[0.06em]" style={{ color: "var(--tl-muted)" }} htmlFor="onb-email">
          {t("public.onboarding.save.emailLabel")}
        </label>
        <input
          id="onb-email"
          type="email"
          inputMode="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder={t("public.onboarding.save.emailPlaceholder")}
          data-testid="onb-email"
          className="mt-1 h-12 w-full rounded-[14px] px-3 text-[1rem] outline-none placeholder:text-[var(--tl-muted-soft)]"
          style={{ background: "var(--tl-surface-raised)", border: "1px solid var(--tl-hairline)", color: "var(--tl-ink)" }}
        />
        {email.includes("+") && email.includes("@") ? (
          <p className="mt-2 text-[0.8125rem] leading-snug" style={{ color: "var(--tl-muted)" }} data-testid="onb-plus-email-hint">
            {t("public.onboarding.save.plusEmailHint")}
          </p>
        ) : null}
        <label className="mt-3 flex items-start gap-2 text-[0.8125rem] leading-snug" style={{ color: "var(--tl-muted)" }}>
          <input
            type="checkbox"
            checked={ageTerms}
            onChange={(e) => setAgeTerms(e.target.checked)}
            className="mt-0.5 size-4 shrink-0"
            data-testid="onb-age-terms"
          />
          <span>
            {t("public.auth.register.ageTermsPrefix")}{" "}
            <a href={`${getSiteUrl()}/legal/terms`} target="_blank" rel="noreferrer" className="underline">{t("public.auth.register.ageTermsTerms")}</a>{" "}
            {t("public.auth.register.ageTermsAnd")}{" "}
            <a href={`${getSiteUrl()}/legal/privacy`} target="_blank" rel="noreferrer" className="underline">{t("public.auth.register.ageTermsPrivacy")}</a>
          </span>
        </label>
        {error ? <Notice tone="error" testId="onb-error">{error}</Notice> : null}
        <div className="mt-4">
          <PrimaryButton type="submit" disabled={busy || !email.trim() || !ageTerms} testId="onb-email-cta">
            {busy ? t("public.onboarding.save.emailPending") : t("public.onboarding.save.emailCta")}
          </PrimaryButton>
        </div>
      </form>

      <p className="mt-4 text-center text-[0.75rem]" style={{ color: "var(--tl-muted)" }}>
        {t("public.onboarding.save.terms").split(/(Terms|Términos|Privacy Policy|Política de privacidad)/).map((part, i) =>
          part === "Terms" || part === "Términos" ? (
            <a key={i} href={`${getSiteUrl()}/legal/terms`} target="_blank" rel="noreferrer" className="underline">{part}</a>
          ) : part === "Privacy Policy" || part === "Política de privacidad" ? (
            <a key={i} href={`${getSiteUrl()}/legal/privacy`} target="_blank" rel="noreferrer" className="underline">{part}</a>
          ) : (
            <span key={i}>{part}</span>
          ),
        )}
      </p>
    </div>
  );
}
