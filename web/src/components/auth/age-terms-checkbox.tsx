"use client";

import { getSiteUrl } from "@/lib/auth-flow";
import { ageTermsLinks } from "@/lib/legal/age-terms-links";

import Link from "next/link";
import { useState } from "react";

import { readAuthConsentDraft, writeAuthConsentDraft } from "@/lib/auth/email-draft";

import { createTranslator } from "@/i18n/messages";

/**
 * Legal 2.2: the required 18+ and Terms/Privacy checkbox on every signup
 * form. Posts `age_terms=on`; the server action re-checks it, so the
 * `required` attribute is only a convenience.
 */
export function AgeTermsCheckbox({ locale = "en" }: { locale?: string }) {
  const t = createTranslator(locale);
  const links = ageTermsLinks(getSiteUrl(), locale);
  // TUL-1235: controlled + draft-backed. An uncontrolled box was reset to
  // unchecked by the form action after any server error (invalid email).
  const [checked, setChecked] = useState(() => readAuthConsentDraft());
  return (
    <label
      className="flex items-start gap-2 text-[0.8125rem] leading-snug"
      style={{ color: "var(--plt-ink-soft)" }}
    >
      <input
        type="checkbox"
        name="age_terms"
        required
        checked={checked}
        onChange={(e) => {
          setChecked(e.target.checked);
          writeAuthConsentDraft(e.target.checked);
        }}
        className="mt-0.5 size-4 shrink-0"
        data-testid="signup-age-terms"
      />
      <span>
        {t("public.auth.register.ageTermsPrefix")}{" "}
        <Link href={links.terms} target="_blank" className="underline underline-offset-4">
          {t("public.auth.register.ageTermsTerms")}
        </Link>{" "}
        {t("public.auth.register.ageTermsAnd")}{" "}
        <Link href={links.privacy} target="_blank" className="underline underline-offset-4">
          {t("public.auth.register.ageTermsPrivacy")}
        </Link>
      </span>
    </label>
  );
}
