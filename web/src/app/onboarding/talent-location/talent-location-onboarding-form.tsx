"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import {
  COUNTRY_DIAL_CODES,
  POPULAR_DIAL_ISOS,
  flagEmojiForIso,
} from "@/lib/data/country-dial-codes";
import type { OnboardingActionState } from "@/app/onboarding/actions";
import {
  clearFormPersistence,
  useFormPersistence,
} from "@/lib/ui/use-form-persistence";

// Canonical, inclusive gender option-set (Tier-C-tail, 2026-06-10). value ==
// label == the string stored verbatim in talent_profiles.gender (posted to the
// onboarding RPC `p_gender`). Kept in lockstep with
// profile_field_definitions(identity.gender).options + the directory facet config.
const GENDER_OPTIONS = [
  { value: "Woman", label: "Woman" },
  { value: "Man", label: "Man" },
  { value: "Non-binary", label: "Non-binary" },
  { value: "Trans woman", label: "Trans woman" },
  { value: "Trans man", label: "Trans man" },
  { value: "Transgender", label: "Transgender" },
  { value: "Genderfluid", label: "Genderfluid" },
  { value: "Genderqueer", label: "Genderqueer" },
  { value: "Agender", label: "Agender" },
  { value: "Bigender", label: "Bigender" },
  { value: "Two-Spirit", label: "Two-Spirit" },
  { value: "Intersex", label: "Intersex" },
  { value: "Prefer to self-describe", label: "Prefer to self-describe" },
  { value: "Prefer not to say", label: "Prefer not to say" },
];

export function TalentLocationOnboardingForm({
  action,
  nextPath,
}: {
  action: (
    prev: OnboardingActionState,
    formData: FormData,
  ) => Promise<OnboardingActionState>;
  nextPath?: string;
}) {
  const [state, formAction, pending] = useActionState(action, undefined);
  const formRef = useRef<HTMLFormElement>(null);

  // E.7 — persist field values across reloads / validation failures.
  useFormPersistence(formRef, { step: "talent-location" });

  // Clear the draft once the server reports a successful submit. The
  // OnboardingActionState convention: no error + non-pending after a
  // submit attempt = success.
  useEffect(() => {
    if (state && !state.error && !pending) {
      clearFormPersistence("talent-location");
    }
  }, [state, pending]);

  const maxDob = new Date(
    new Date().setFullYear(new Date().getFullYear() - 16),
  )
    .toISOString()
    .slice(0, 10);

  return (
    <form ref={formRef} action={formAction} className="space-y-7">
      {nextPath ? <input type="hidden" name="next" value={nextPath} /> : null}

      {/* ── Identity ── */}
      <Section eyebrow="Identity">
        <Field
          label="Display name"
          required
          hint="The name shown publicly on your profile and in the directory."
        >
          <Input
            id="display_name"
            name="display_name"
            autoComplete="nickname"
            placeholder="e.g. Sofia M."
            required
          />
        </Field>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="First name" required>
            <Input
              id="first_name"
              name="first_name"
              autoComplete="given-name"
              placeholder="First name"
              required
            />
          </Field>
          <Field label="Last name" required>
            <Input
              id="last_name"
              name="last_name"
              autoComplete="family-name"
              placeholder="Last name"
              required
            />
          </Field>
        </div>
      </Section>

      {/* ── Contact ── */}
      <Section eyebrow="Contact">
        <Field
          label="Phone number"
          required
          hint="Only people you accept a booking from can see it. Never shown on your page."
        >
          <PhoneField />
        </Field>
      </Section>

      {/* ── Demographics ── */}
      <Section eyebrow="Demographics">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Gender" required>
            <SelectInput
              id="gender"
              name="gender"
              required
              defaultValue=""
            >
              <option value="" disabled>
                Select gender
              </option>
              {GENDER_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </SelectInput>
          </Field>

          <Field label="Date of birth" required>
            <Input
              id="date_of_birth"
              name="date_of_birth"
              type="date"
              required
              max={maxDob}
            />
          </Field>
        </div>
      </Section>

      <p
        className="text-[0.75rem] leading-[1.5]"
        style={{ color: "var(--plt-muted)" }}
      >
        You can complete your nationality, location, and other profile details from your dashboard after signing up.
      </p>

      {state?.error ? (
        <p
          className="rounded-xl px-3 py-2.5 text-[0.8125rem]"
          style={{
            background: "rgba(180, 35, 24, 0.08)",
            color: "#9b1c14",
            border: "1px solid rgba(180, 35, 24, 0.18)",
          }}
        >
          {state.error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="group inline-flex w-full items-center justify-center gap-2 rounded-full px-6 py-3 text-[0.9375rem] font-medium leading-none tracking-[-0.005em] transition-[background,transform,box-shadow] duration-200 disabled:cursor-wait disabled:opacity-80 sm:w-auto"
        style={{
          background: "var(--plt-forest)",
          color: "var(--plt-forest-on)",
          boxShadow: "var(--plt-shadow-forest)",
        }}
      >
        <span>{pending ? "Creating your profile…" : "Create my profile"}</span>
        {!pending ? <ArrowGlyph /> : <Spinner />}
      </button>
    </form>
  );
}

/* ─────── Building blocks (match the talent-register modal aesthetic) ─────── */

/**
 * Country code + national number, posted as ONE `phone` value in E.164 shape
 * ("+972 543979670"). The previous single free-text box stored whatever was
 * typed; a number typed with its own "+972" then met a profile drawer that
 * assumed "+1", which is how "+1 +972543979670" reached production
 * (2026-09-10). The select defaults to Mexico (the largest signup market) and
 * lists the popular countries first, the rest alphabetically.
 */
function PhoneField() {
  const [dial, setDial] = useState("+52");
  const [national, setNational] = useState("");
  const popular = POPULAR_DIAL_ISOS
    .map((iso) => COUNTRY_DIAL_CODES.find((c) => c.iso === iso))
    .filter((c): c is (typeof COUNTRY_DIAL_CODES)[number] => Boolean(c));
  const rest = COUNTRY_DIAL_CODES
    .filter((c) => !POPULAR_DIAL_ISOS.includes(c.iso))
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name));
  // A dial code can belong to several countries (+1, +7, +44…); the select
  // is keyed by iso so each option stays unique, the posted value is the dial.
  const [iso, setIso] = useState("MX");
  const onIso = (nextIso: string) => {
    setIso(nextIso);
    const c = COUNTRY_DIAL_CODES.find((x) => x.iso === nextIso);
    if (c) setDial(c.dial);
  };
  const digits = national.replace(/[^\d\s-]/g, "");
  return (
    <div className="flex gap-2">
      <input type="hidden" name="phone" value={digits.trim() ? `${dial} ${digits.trim()}` : ""} />
      <select
        aria-label="Country code"
        value={iso}
        onChange={(e) => onIso(e.target.value)}
        className={`${INPUT_CLASSES} w-[7.5rem] shrink-0 appearance-none pr-2`}
        style={INPUT_STYLE}
      >
        {popular.map((c) => (
          <option key={c.iso} value={c.iso}>
            {flagEmojiForIso(c.iso)} {c.dial}
          </option>
        ))}
        <option disabled>──────</option>
        {rest.map((c) => (
          <option key={c.iso} value={c.iso}>
            {flagEmojiForIso(c.iso)} {c.dial} {c.name}
          </option>
        ))}
      </select>
      <Input
        id="phone_national"
        type="tel"
        inputMode="tel"
        autoComplete="tel-national"
        placeholder="55 1234 5678"
        required
        value={national}
        onChange={(e) => setNational(e.target.value)}
      />
    </div>
  );
}

function Section({
  eyebrow,
  children,
}: {
  eyebrow: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-3.5">
      <p
        className="plt-mono text-[0.625rem] font-semibold uppercase tracking-[0.22em]"
        style={{ color: "var(--plt-muted)" }}
      >
        {eyebrow}
      </p>
      <div className="space-y-3.5">{children}</div>
    </div>
  );
}

function Field({
  label,
  required,
  hint,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span
        className="plt-mono mb-1.5 block text-[0.6875rem] font-semibold uppercase tracking-[0.16em]"
        style={{ color: "var(--plt-muted)" }}
      >
        {label}
        {required ? (
          <span style={{ color: "var(--plt-forest)" }}> *</span>
        ) : null}
      </span>
      {hint ? (
        <span
          className="mb-1.5 block text-[0.75rem]"
          style={{ color: "var(--plt-muted)" }}
        >
          {hint}
        </span>
      ) : null}
      {children}
    </label>
  );
}

const INPUT_CLASSES =
  "flex h-12 w-full rounded-2xl px-4 text-[0.9375rem] leading-none outline-none transition-[border-color,box-shadow] placeholder:text-[var(--plt-muted-soft)] focus:shadow-[0_0_0_3px_color-mix(in_srgb,var(--plt-forest)_18%,transparent)]";

const INPUT_STYLE: React.CSSProperties = {
  backgroundColor: "var(--plt-bg)",
  border: "1px solid var(--plt-hairline-strong)",
  color: "var(--plt-ink)",
};

function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={INPUT_CLASSES}
      style={{ ...INPUT_STYLE, ...(props.style ?? {}) }}
    />
  );
}

function SelectInput(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={`${INPUT_CLASSES} appearance-none bg-[length:14px_14px] bg-[right_1rem_center] bg-no-repeat pr-10`}
      style={{
        ...INPUT_STYLE,
        backgroundImage:
          "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 12 8' fill='none' stroke='%236b7065' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'><path d='M1 1.5L6 6.5L11 1.5'/></svg>\")",
        ...(props.style ?? {}),
      }}
    />
  );
}

function ArrowGlyph() {
  return (
    <svg
      aria-hidden
      width="14"
      height="10"
      viewBox="0 0 14 10"
      fill="none"
      className="transition-transform duration-200 group-hover:translate-x-0.5"
    >
      <path
        d="M1 5H13M13 5L9 1M13 5L9 9"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function Spinner() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
      className="animate-spin"
    >
      <circle
        cx="12"
        cy="12"
        r="9"
        stroke="currentColor"
        strokeOpacity="0.25"
        strokeWidth="2"
      />
      <path
        d="M21 12a9 9 0 0 0-9-9"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}
