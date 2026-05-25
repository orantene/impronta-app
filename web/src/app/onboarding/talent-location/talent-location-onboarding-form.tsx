"use client";

import { useActionState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { OnboardingActionState } from "@/app/onboarding/actions";
import {
  clearFormPersistence,
  useFormPersistence,
} from "@/lib/ui/use-form-persistence";

const GENDER_OPTIONS = [
  { value: "female", label: "Female" },
  { value: "male", label: "Male" },
  { value: "non_binary", label: "Non-binary" },
  { value: "prefer_not_to_say", label: "Prefer not to say" },
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

  return (
    <form ref={formRef} action={formAction} className="space-y-8">
      {nextPath ? <input type="hidden" name="next" value={nextPath} /> : null}

      {/* ── Identity ── */}
      <div className="space-y-4">
        <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          Identity
        </p>

        <div className="space-y-2">
          <Label htmlFor="display_name">
            Display name <span className="text-destructive">*</span>
          </Label>
          <p className="text-xs text-muted-foreground">
            The name shown publicly on your profile and in the directory.
          </p>
          <Input
            id="display_name"
            name="display_name"
            autoComplete="nickname"
            placeholder="e.g. Sofia M."
            required
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="first_name">
              First name <span className="text-destructive">*</span>
            </Label>
            <Input
              id="first_name"
              name="first_name"
              autoComplete="given-name"
              placeholder="First name"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="last_name">
              Last name <span className="text-destructive">*</span>
            </Label>
            <Input
              id="last_name"
              name="last_name"
              autoComplete="family-name"
              placeholder="Last name"
              required
            />
          </div>
        </div>
      </div>

      {/* ── Contact ── */}
      <div className="space-y-4">
        <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          Contact
        </p>

        <div className="space-y-2">
          <Label htmlFor="phone">
            Phone number <span className="text-destructive">*</span>
          </Label>
          <p className="text-xs text-muted-foreground">
            Used internally by the agency. Not shown publicly.
          </p>
          <Input
            id="phone"
            name="phone"
            type="tel"
            autoComplete="tel"
            placeholder="+1 555 000 0000"
            required
          />
        </div>
      </div>

      {/* ── Demographics ── */}
      <div className="space-y-4">
        <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          Demographics
        </p>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="gender">
              Gender <span className="text-destructive">*</span>
            </Label>
            <select
              id="gender"
              name="gender"
              required
              defaultValue=""
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="" disabled>
                Select gender
              </option>
              {GENDER_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="date_of_birth">
              Date of birth <span className="text-destructive">*</span>
            </Label>
            <Input
              id="date_of_birth"
              name="date_of_birth"
              type="date"
              required
              max={new Date(new Date().setFullYear(new Date().getFullYear() - 16))
                .toISOString()
                .slice(0, 10)}
            />
          </div>
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        You can complete your nationality, location, and other profile details from your dashboard after signing up.
      </p>

      {state?.error ? (
        <p className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {state.error}
        </p>
      ) : null}

      <Button type="submit" disabled={pending} className="w-full sm:w-auto">
        {pending ? "Creating your profile…" : "Create my profile"}
      </Button>
    </form>
  );
}
