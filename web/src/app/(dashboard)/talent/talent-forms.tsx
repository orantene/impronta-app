"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  submitTalentForReview,
  submitProfileRevision,
  updateTalentProfile,
} from "@/app/(dashboard)/talent/actions";
import {
  dispatchTalentWorkspaceState,
  TALENT_PROFILE_SAVED,
} from "@/lib/talent-workspace-events";
import { TALENT_SHORT_BIO_RECOMMENDED_MIN_CHARS } from "@/lib/talent-dashboard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CanonicalLocationFieldset } from "@/components/location/canonical-location-fieldset";
import { cn } from "@/lib/utils";
import type { CitySuggestion, CountrySuggestion } from "@/lib/location-autocomplete";

/** Matches talent account / status cards — used for workflow forms embedded in dashboard cards. */
const workflowTextarea =
  "min-h-[100px] rounded-2xl border-border/60 bg-background/80 px-3.5 py-3 text-[15px] leading-relaxed shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:border-[var(--impronta-gold)]/50 focus-visible:ring-[var(--impronta-gold)]/25";

const workflowPrimaryButton =
  "h-11 rounded-2xl bg-[var(--impronta-gold)] px-5 text-[15px] font-semibold text-white shadow-md shadow-black/10 hover:bg-[var(--impronta-gold)]/92 disabled:opacity-60";

const workflowInset =
  "rounded-2xl border border-border/40 bg-muted/20 px-3.5 py-3 text-sm lg:px-4";

/** Public identity sheet — aligned with Account / Status inputs */
const panelInput =
  "h-11 rounded-xl border-border/60 bg-background/90 px-3.5 text-[15px] shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:border-[var(--impronta-gold)]/50 focus-visible:ring-[var(--impronta-gold)]/25";

const panelTextarea =
  "min-h-[100px] rounded-2xl border-border/60 bg-background/90 px-3.5 py-3 text-[15px] leading-relaxed shadow-sm placeholder:text-muted-foreground focus-visible:border-[var(--impronta-gold)]/50 focus-visible:ring-[var(--impronta-gold)]/25";

const panelSelect =
  "flex h-11 w-full rounded-xl border border-border/60 bg-background/90 px-3.5 text-[15px] shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--impronta-gold)]/25";

const panelCard =
  "rounded-2xl border border-border/40 bg-card/70 p-4 shadow-sm ring-1 ring-black/[0.03] dark:ring-white/[0.05]";

const panelSectionLabel =
  "text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground";

const DRAFT_STORAGE_KEY = "impronta_talent_profile_draft_v3";
export const TALENT_PUBLIC_PROFILE_FORM_ID = "talent-public-profile-form";
export const TALENT_SUBMIT_FOR_REVIEW_FORM_ID = "talent-submit-for-review-form";

const GENDER_OPTIONS = [
  { value: "", label: "Select gender" },
  { value: "female", label: "Female" },
  { value: "male", label: "Male" },
  { value: "non_binary", label: "Non-binary" },
  { value: "prefer_not_to_say", label: "Prefer not to say" },
];

type ProfileFields = {
  display_name: string;
  first_name: string;
  last_name: string;
  short_bio: string;
  phone: string;
  gender: string;
  date_of_birth: string;
  residence_city_id: string;
  origin_city_id: string;
};

function fieldsFromInitial(initial: {
  display_name: string | null;
  first_name: string | null;
  last_name: string | null;
  short_bio: string | null;
  phone: string | null;
  gender: string | null;
  date_of_birth: string | null;
  residence_city_id: string | null;
  origin_city_id: string | null;
}): ProfileFields {
  return {
    display_name: initial.display_name ?? "",
    first_name: initial.first_name ?? "",
    last_name: initial.last_name ?? "",
    short_bio: initial.short_bio ?? "",
    phone: initial.phone ?? "",
    gender: initial.gender ?? "",
    date_of_birth: initial.date_of_birth ?? "",
    residence_city_id: initial.residence_city_id ?? "",
    origin_city_id: initial.origin_city_id ?? "",
  };
}

export function TalentProfileForm({
  profileCode,
  initial,
  initialResidence,
  initialOrigin,
  onDirtyChange,
  onPendingChange,
}: {
  profileCode: string;
  initial: {
    display_name: string | null;
    first_name: string | null;
    last_name: string | null;
    short_bio: string | null;
    phone: string | null;
    gender: string | null;
    date_of_birth: string | null;
    residence_city_id: string | null;
    origin_city_id: string | null;
  };
  initialResidence: { country: CountrySuggestion | null; city: CitySuggestion | null };
  initialOrigin: { country: CountrySuggestion | null; city: CitySuggestion | null };
  onDirtyChange?: (dirty: boolean) => void;
  onPendingChange?: (pending: boolean) => void;
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(updateTalentProfile, undefined);
  const [fields, setFields] = useState(() => fieldsFromInitial(initial));
  const [draftHydrated, setDraftHydrated] = useState(false);
  const lastDirtyRef = useRef<boolean | null>(null);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(DRAFT_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as {
        v: number;
        profileCode: string;
        fields: ProfileFields;
      };
      if (parsed.v !== 2 || parsed.profileCode !== profileCode) return;
      setFields((prev) => ({ ...prev, ...parsed.fields }));
    } catch {
      /* ignore corrupt draft */
    } finally {
      setDraftHydrated(true);
    }
  }, [profileCode]);

  useEffect(() => {
    if (!draftHydrated) return;
    try {
      sessionStorage.setItem(
        DRAFT_STORAGE_KEY,
        JSON.stringify({ v: 2, profileCode, fields }),
      );
    } catch {
      /* quota / private mode */
    }
  }, [fields, profileCode, draftHydrated]);

  useEffect(() => {
    if (!state) return;
    if (state.success) {
      try {
        sessionStorage.removeItem(DRAFT_STORAGE_KEY);
      } catch {
        /* ignore */
      }
      document.dispatchEvent(new CustomEvent(TALENT_PROFILE_SAVED));
      dispatchTalentWorkspaceState({ profileDirty: false, profileSaving: false });
      toast.success(state.message ?? "Profile saved.");
      router.refresh();
    } else if (state.error) {
      toast.error(state.error);
    }
  }, [state, router]);

  const savedBaseline = useMemo(() => fieldsFromInitial(initial), [initial]);

  const isDirty = useMemo(() => {
    return (
      fields.display_name !== savedBaseline.display_name ||
      fields.first_name !== savedBaseline.first_name ||
      fields.last_name !== savedBaseline.last_name ||
      fields.short_bio !== savedBaseline.short_bio ||
      fields.phone !== savedBaseline.phone ||
      fields.gender !== savedBaseline.gender ||
      fields.date_of_birth !== savedBaseline.date_of_birth ||
      fields.residence_city_id !== savedBaseline.residence_city_id ||
      fields.origin_city_id !== savedBaseline.origin_city_id
    );
  }, [fields, savedBaseline]);

  useEffect(() => {
    if (!isDirty || pending) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [isDirty, pending]);

  useEffect(() => {
    dispatchTalentWorkspaceState({
      profileDirty: !!(isDirty && draftHydrated),
    });
  }, [isDirty, draftHydrated]);

  useEffect(() => {
    const dirty = !!(isDirty && draftHydrated && !pending);
    // Prevent parent render loops when callback identity changes.
    // Only notify when the derived dirty value changes.
    if (lastDirtyRef.current === dirty) return;
    lastDirtyRef.current = dirty;
    onDirtyChange?.(dirty);
  }, [isDirty, draftHydrated, pending, onDirtyChange]);

  useEffect(() => {
    dispatchTalentWorkspaceState({ profileSaving: pending });
  }, [pending]);

  useEffect(() => {
    onPendingChange?.(pending);
  }, [pending, onPendingChange]);

  return (
    <form id={TALENT_PUBLIC_PROFILE_FORM_ID} action={formAction} className="space-y-5">
      <input type="hidden" name="edited_locale" value="en" />
      <div className={panelCard}>
        <p className={panelSectionLabel}>Identity</p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="display_name" className="text-sm font-medium">
              Display name (public)
            </Label>
            <Input
              id="display_name"
              name="display_name"
              value={fields.display_name}
              className={panelInput}
              onChange={(e) =>
                setFields((f) => ({ ...f, display_name: e.target.value }))
              }
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="first_name" className="text-sm font-medium">
              First name
            </Label>
            <Input
              id="first_name"
              name="first_name"
              value={fields.first_name}
              className={panelInput}
              onChange={(e) =>
                setFields((f) => ({ ...f, first_name: e.target.value }))
              }
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="last_name" className="text-sm font-medium">
              Last name
            </Label>
            <Input
              id="last_name"
              name="last_name"
              value={fields.last_name}
              className={panelInput}
              onChange={(e) =>
                setFields((f) => ({ ...f, last_name: e.target.value }))
              }
            />
          </div>
        </div>
      </div>

      <div className={panelCard}>
        <p className={panelSectionLabel}>Contact</p>
        <div className="mt-4 space-y-2">
          <Label htmlFor="phone" className="text-sm font-medium">
            Phone number
          </Label>
          <p className="text-xs leading-relaxed text-muted-foreground">
            Agency-private. Not shown publicly.
          </p>
          <Input
            id="phone"
            name="phone"
            type="tel"
            value={fields.phone}
            className={panelInput}
            onChange={(e) => setFields((f) => ({ ...f, phone: e.target.value }))}
          />
        </div>
      </div>

      <div className={panelCard}>
        <p className={panelSectionLabel}>Demographics</p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="gender" className="text-sm font-medium">
              Gender
            </Label>
            <select
              id="gender"
              name="gender"
              value={fields.gender}
              onChange={(e) => setFields((f) => ({ ...f, gender: e.target.value }))}
              className={panelSelect}
            >
              {GENDER_OPTIONS.map((o) => (
                <option key={o.value} value={o.value} disabled={o.value === "" && fields.gender !== ""}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="date_of_birth" className="text-sm font-medium">
              Date of birth
            </Label>
            <Input
              id="date_of_birth"
              name="date_of_birth"
              type="date"
              value={fields.date_of_birth}
              className={panelInput}
              onChange={(e) => setFields((f) => ({ ...f, date_of_birth: e.target.value }))}
            />
          </div>
        </div>
      </div>

      <div
        className={panelCard}
        onBlurCapture={(e) => {
          const form = e.currentTarget.closest("form");
          if (!form) return;
          const nextResidence = String(
            (form.querySelector('input[name="residence_city_id"]') as HTMLInputElement | null)?.value ?? "",
          );
          setFields((f) => ({ ...f, residence_city_id: nextResidence }));
        }}
      >
        <CanonicalLocationFieldset
          prefix="residence"
          title="Lives in"
          countryLabel="Residence country"
          cityLabel="Residence city"
          required
          noCard
          inputClassName={panelInput}
          helperText="Your canonical base location — used for the directory and public profile."
          initial={initialResidence}
        />
      </div>

      <div
        className={panelCard}
        onBlurCapture={(e) => {
          const form = e.currentTarget.closest("form");
          if (!form) return;
          const nextOrigin = String(
            (form.querySelector('input[name="origin_city_id"]') as HTMLInputElement | null)?.value ?? "",
          );
          setFields((f) => ({ ...f, origin_city_id: nextOrigin }));
        }}
      >
        <CanonicalLocationFieldset
          prefix="origin"
          title="Originally from"
          countryLabel="Origin country"
          cityLabel="Origin city"
          required={false}
          noCard
          inputClassName={panelInput}
          helperText="Optional. Shown as “Originally from” on your public profile when set."
          initial={initialOrigin}
        />
      </div>

      <div className={panelCard}>
        <Label htmlFor="short_bio" className="text-sm font-medium">
          Short bio
        </Label>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
          Public. A few sentences (often {TALENT_SHORT_BIO_RECOMMENDED_MIN_CHARS}+ characters) help the agency
          review your positioning.
        </p>
        <Textarea
          id="short_bio"
          name="short_bio"
          rows={4}
          value={fields.short_bio}
          className={cn(panelTextarea, "mt-2")}
          onChange={(e) =>
            setFields((f) => ({ ...f, short_bio: e.target.value }))
          }
        />
        <p className="mt-2 text-xs text-muted-foreground">
          {fields.short_bio.trim().length} characters
        </p>
      </div>
    </form>
  );
}

export function RevisionForm() {
  const [state, formAction, pending] = useActionState(submitProfileRevision, undefined);

  useEffect(() => {
    dispatchTalentWorkspaceState({ workflowSaving: pending });
  }, [pending]);

  useEffect(() => {
    if (!state) return;
    if (state.error) toast.error(state.error);
    else if (state.success) toast.success("Revision note sent.");
  }, [state]);

  return (
    <form action={formAction} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="revision_note" className="text-sm font-medium">
          Change request
        </Label>
        <Textarea
          id="revision_note"
          name="revision_note"
          rows={3}
          className={workflowTextarea}
          placeholder="Describe what you’d like updated — agency will review."
          required
        />
      </div>
      <Button type="submit" className={workflowPrimaryButton} disabled={pending}>
        {pending ? "Sending…" : "Send revision note"}
      </Button>
    </form>
  );
}

export function TalentSubmitForReviewForm({
  canSubmit,
  threshold,
  completionScore,
  termsVersion,
  latestAcceptedTermsVersion,
  statusAllowsSubmit,
  onPendingChange,
  onReadyToSubmitChange,
  onSuccess,
}: {
  canSubmit: boolean;
  threshold: number;
  completionScore: number;
  termsVersion: string;
  latestAcceptedTermsVersion: string | null;
  statusAllowsSubmit: boolean;
  onPendingChange?: (pending: boolean) => void;
  /** True when checkboxes are checked and submit isn't blocked. */
  onReadyToSubmitChange?: (ready: boolean) => void;
  onSuccess?: () => void;
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(
    submitTalentForReview,
    undefined,
  );
  const [confirmed, setConfirmed] = useState(false);
  const [accepted, setAccepted] = useState(false);

  useEffect(() => {
    dispatchTalentWorkspaceState({ workflowSaving: pending });
  }, [pending]);

  useEffect(() => {
    onPendingChange?.(pending);
  }, [pending, onPendingChange]);

  const readyToSubmit = canSubmit && statusAllowsSubmit && confirmed && accepted && !pending;

  useEffect(() => {
    onReadyToSubmitChange?.(readyToSubmit);
  }, [readyToSubmit, onReadyToSubmitChange]);

  useEffect(() => {
    if (!state) return;
    if (state.success) {
      toast.success(state.message ?? "Submitted for review.");
      setConfirmed(false);
      setAccepted(false);
      onPendingChange?.(false);
      onReadyToSubmitChange?.(false);
      onSuccess?.();
      router.refresh();
    } else if (state.error) {
      toast.error(state.error);
    }
  }, [state, router, onPendingChange, onReadyToSubmitChange, onSuccess]);

  return (
    <form id={TALENT_SUBMIT_FOR_REVIEW_FORM_ID} action={formAction} className="space-y-4">
      <div className={cn(workflowInset, "space-y-2")}>
        <div className="flex items-center justify-between text-xs font-medium text-muted-foreground">
          <span>Profile completion</span>
          <span className="font-mono tabular-nums text-foreground">
            {completionScore}%
            {completionScore < threshold ? (
              <span className="text-muted-foreground"> / {threshold}%</span>
            ) : null}
          </span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-muted/80">
          <div
            className="h-full rounded-full bg-[var(--impronta-gold)] transition-[width] duration-500 ease-out"
            style={{ width: `${Math.min(100, completionScore)}%` }}
          />
        </div>
        {!canSubmit && completionScore < threshold ? (
          <p className="text-xs leading-relaxed text-muted-foreground">
            Complete your checklist to {threshold}% — see My Profile for missing items.
          </p>
        ) : null}
        {!statusAllowsSubmit ? (
          <p className="text-xs leading-relaxed text-muted-foreground">
            Submission becomes available again when the profile returns to Draft or Hidden.
          </p>
        ) : null}
      </div>
      <div className={workflowInset}>
        <p className="font-semibold text-foreground">Terms acceptance</p>
        <p className="mt-1.5 leading-relaxed text-muted-foreground">
          Submission is recorded against terms version{" "}
          <span className="font-medium text-foreground">{termsVersion}</span>.
          {latestAcceptedTermsVersion ? (
            <>
              {" "}
              Last accepted:{" "}
              <span className="font-medium text-foreground">{latestAcceptedTermsVersion}</span>.
            </>
          ) : (
            <> This will be your first recorded acceptance.</>
          )}
        </p>
      </div>
      <label className="flex items-start gap-3 rounded-2xl border border-border/40 bg-muted/10 px-3.5 py-3 text-sm text-muted-foreground">
        <input
          type="checkbox"
          name="submission_confirmation"
          value="confirmed"
          className="mt-1"
          disabled={!canSubmit || !statusAllowsSubmit || pending}
          checked={confirmed}
          onChange={(e) => setConfirmed(e.target.checked)}
        />
        <span className="leading-relaxed">
          I confirm the profile is ready for agency review and I have checked the submission details
          shown in this dashboard.
        </span>
      </label>
      <label className="flex items-start gap-3 rounded-2xl border border-border/40 bg-muted/10 px-3.5 py-3 text-sm text-muted-foreground">
        <input
          type="checkbox"
          name="terms_acceptance"
          value="accepted"
          className="mt-1"
          disabled={!canSubmit || !statusAllowsSubmit || pending}
          checked={accepted}
          onChange={(e) => setAccepted(e.target.checked)}
        />
        <span className="leading-relaxed">
          I accept the current submission terms and acknowledge that this submission will be stored
          with terms version {termsVersion}.
        </span>
      </label>
    </form>
  );
}

export { StateBadges } from "@/app/(dashboard)/talent/talent-state-badges";
