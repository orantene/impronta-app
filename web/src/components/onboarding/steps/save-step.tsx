"use client";

import { getSiteUrl } from "@/lib/auth-flow";
import { ageTermsLinks } from "@/lib/legal/age-terms-links";

/**
 * Step 3 · Save it. Google, or an email that gets an 8-digit code. The
 * screen is the same whether the address is new or known. Signed-in people
 * skip it (the module never shows it to them).
 *
 * onb1-11: email + ageTerms draft live on the module (props below). Local
 * useState here remounted with the step body and kept only the first character.
 * onb1-10: one 18+/Terms tick for the whole screen (covers Google + email).
 * Guests no longer also tick 18+ on readyToBuild.
 */

import { AuthGoogleButtonSurface } from "@/components/auth/auth-ui";
import type { OnboardingChoice, OnboardingPath } from "@/lib/onboarding/module-state";

import { useGooglePopup } from "../use-google-popup";
import { Notice, PrimaryButton, Sub, Title } from "../ui";

export function SaveStep({
  t,
  path,
  locale = "en",
  choice = null,
  busy,
  error,
  email,
  onEmailChange,
  ageTerms,
  onAgeTermsChange,
  onEmail,
  onGoogleSuccess,
}: {
  t: (key: string) => string;
  path: OnboardingPath;
  /** Page language: the legal links open the matching Terms/Privacy pages (TUL-614). */
  locale?: "en" | "es";
  /** The screen-1 choice rides the Google `next` URL so it survives the redirect (TUL-82). */
  choice?: OnboardingChoice | null;
  busy: boolean;
  error: string | null;
  /** Draft owned by OnboardingModule so a step-body remount cannot wipe typing (onb1-11). */
  email: string;
  onEmailChange: (email: string) => void;
  ageTerms: boolean;
  onAgeTermsChange: (checked: boolean) => void;
  onEmail: (email: string, ageTerms: boolean) => void;
  onGoogleSuccess: (ageTerms: boolean) => void;
}) {
  const legal = ageTermsLinks(getSiteUrl(), locale);
  // Talent (and both): the callback promotes the fresh profile to talent when
  // `next` is a talent onboarding path. The module ignores the destination.
  const base = path === "business" ? "/" : "/talent/profile/fields";
  const next = choice ? `${base}?choice=${choice}` : base;
  const google = useGooglePopup({ next, onSuccess: () => onGoogleSuccess(ageTerms) });
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

      <label className="mt-5 flex items-start gap-2 text-[0.8125rem] leading-snug" style={{ color: "var(--tl-muted)" }}>
        <input
          type="checkbox"
          checked={ageTerms}
          onChange={(e) => onAgeTermsChange(e.target.checked)}
          className="mt-0.5 size-4 shrink-0"
          data-testid="onb-age-terms"
        />
        <span>
          {t("public.auth.register.ageTermsPrefix")}{" "}
          <a href={legal.terms} target="_blank" rel="noreferrer" className="underline">{t("public.auth.register.ageTermsTerms")}</a>{" "}
          {t("public.auth.register.ageTermsAnd")}{" "}
          <a href={legal.privacy} target="_blank" rel="noreferrer" className="underline">{t("public.auth.register.ageTermsPrivacy")}</a>
        </span>
      </label>

      <div className="mt-4" data-testid="onb-google">
        <AuthGoogleButtonSurface
          pending={google.pending}
          label={t("public.onboarding.save.google")}
          pendingLabel={t("public.onboarding.save.googleOpening")}
          error={googleError}
          onClick={() => {
            if (ageTerms && !busy) google.open();
          }}
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
          // text + inputMode: avoids mobile email-input engines that rewrite
          // mid-keystroke and fight a controlled value (onb1-11).
          type="text"
          inputMode="email"
          autoComplete="email"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          value={email}
          onChange={(e) => onEmailChange(e.target.value)}
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
        {error ? <Notice tone="error" testId="onb-error">{error}</Notice> : null}
        <div className="mt-4">
          <PrimaryButton type="submit" disabled={busy || !email.trim() || !ageTerms} testId="onb-email-cta">
            {busy ? t("public.onboarding.save.emailPending") : t("public.onboarding.save.emailCta")}
          </PrimaryButton>
        </div>
      </form>
    </div>
  );
}
