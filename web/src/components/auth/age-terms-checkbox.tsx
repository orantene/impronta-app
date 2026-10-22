"use client";

import { ageTermsLinks } from "@/lib/legal/age-terms-links";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { readAuthConsentDraft, writeAuthConsentDraft } from "@/lib/auth/email-draft";

import { createTranslator } from "@/i18n/messages";

/**
 * Legal 2.2: the required 18+ and Terms/Privacy checkbox on every signup
 * form. Posts `age_terms=on`; the server action re-checks it, so the
 * `required` attribute is only a convenience.
 */
export function AgeTermsCheckbox({
  locale = "en",
  marketingOrigin,
  invalid = false,
  errorId,
}: {
  locale?: string;
  /** TUL-1169: the consent is what the form error is about (aria-invalid). */
  invalid?: boolean;
  /** TUL-1169: id of the visible error line, linked with aria-describedby. */
  errorId?: string;
  /** Server-resolved marketing origin for the Terms/Privacy links (TUL-750). */
  marketingOrigin: string;
}) {
  const t = createTranslator(locale);
  const links = ageTermsLinks(marketingOrigin, locale);
  // TUL-1235: controlled + draft-backed. An uncontrolled box was reset to
  // unchecked by the form action after any server error (invalid email).
  const [checked, setChecked] = useState(() => readAuthConsentDraft());
  const inputRef = useRef<HTMLInputElement>(null);
  const checkedRef = useRef(checked);
  useEffect(() => {
    checkedRef.current = checked;
  }, [checked]);
  // TUL-1235 (round 2): React 19 calls requestFormReset after a form action, which
  // sets the DOM box back to its default while the state stays true. Re-apply the
  // state after every reset (the reset event fires BEFORE the reset runs).
  useEffect(() => {
    const form = inputRef.current?.form;
    if (!form) return;
    const reapply = () => {
      setTimeout(() => {
        if (inputRef.current) inputRef.current.checked = checkedRef.current;
      }, 0);
    };
    form.addEventListener("reset", reapply);
    return () => form.removeEventListener("reset", reapply);
  }, []);
  return (
    <label
      className="flex items-start gap-2 text-[0.8125rem] leading-snug"
      style={{ color: "var(--plt-ink-soft)" }}
    >
      <input
        type="checkbox"
        ref={inputRef}
        name="age_terms"
        required
        aria-invalid={invalid ? true : undefined}
        aria-describedby={invalid && errorId ? errorId : undefined}
        checked={checked}
        defaultChecked={checked}
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
