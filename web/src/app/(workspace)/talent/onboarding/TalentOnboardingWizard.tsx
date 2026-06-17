"use client";

/**
 * TalentOnboardingWizard — guided, stepped profile setup (MVP).
 *
 * One step visible at a time, Back/Next, a live progress card. Every step
 * writes through an EXISTING talent self-* server action; the progress card
 * and the final "Go live" gate are driven by the SERVER-canonical checklist
 * passed in from the page (`buildTalentChecklist` via loadTalentDashboardData).
 *
 * The component re-reads completeness via router.refresh() after each save so
 * the progress card reflects the canonical model, not a local re-derivation.
 *
 * Styling mirrors the talent settings cards (PreferredLanguageCard): inline
 * styles, a single color/font const, async state always visible
 * (loading/saving/saved/error) per the project's "async state visible" bar.
 *
 * The step components + shared tokens/styles live in sibling modules
 * (`onboarding-steps`, `onboarding-shared`) so each file stays under the
 * 800-line lint ceiling.
 */

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { TalentChecklistItem } from "@/lib/talent-dashboard";
import {
  C,
  FONT,
  DISPLAY,
  primaryBtn,
  secondaryBtn,
  type OnboardingPrefill,
  type ParentCategory,
} from "./onboarding-shared";
import {
  BasicsStep,
  BioStep,
  PhotoStep,
  DisciplineStep,
  LanguagesStep,
  LocationStep,
  RatesStep,
  PayoutStep,
  ReviewStep,
} from "./onboarding-steps";

// Re-exported so existing importers (page.tsx) keep importing the prefill type
// from the wizard module even though it now lives in onboarding-shared.
export type { OnboardingPrefill } from "./onboarding-shared";

type StepKey =
  | "basics"
  | "bio"
  | "photo"
  | "discipline"
  | "languages"
  | "location"
  | "rates"
  | "payout"
  | "review";

/**
 * Each wizard step declares which canonical checklist keys it can move. The
 * progress card + the step's "done" badge read off the checklist passed from
 * the server — we never re-derive completeness here.
 */
const STEP_CHECKLIST_KEYS: Record<StepKey, string[]> = {
  // Basics writes the columns updateSelfIdentity owns: name + phone + gender +
  // date of birth. first_name/last_name + the structured origin/residence
  // city pickers have NO talent self action, so they're handled in the full
  // editor and flagged in the review checklist (not the wizard's job to fake).
  basics: ["display_name", "phone", "gender", "date_of_birth"],
  bio: ["short_bio"],
  photo: ["media"],
  discipline: ["taxonomy"],
  languages: [], // languages aren't a checklist gate; included as a useful step
  location: [], // home_base text only; the "location"/"origin" gates need the
  // structured city pickers (no self action) — see review checklist.
  rates: [],
  payout: [],
  review: [],
};

export function TalentOnboardingWizard(props: {
  talentProfileId: string;
  checklist: TalentChecklistItem[];
  completionScore: number;
  canSubmit: boolean;
  workflowStatus: string;
  mediaCount: number;
  previewHref: string;
  tenantSlug: string | null;
  parentCategories: ParentCategory[];
  payoutStatus: "none" | "pending" | "enabled" | "restricted" | "disabled";
  prefill: OnboardingPrefill;
}) {
  const router = useRouter();
  const {
    talentProfileId,
    checklist,
    completionScore,
    canSubmit,
    workflowStatus,
    mediaCount,
    previewHref,
    tenantSlug,
    parentCategories,
    payoutStatus,
    prefill,
  } = props;

  const steps: { key: StepKey; title: string; subtitle: string }[] = [
    { key: "basics", title: "Basics", subtitle: "Your name and a few identity details." },
    { key: "bio", title: "Short bio", subtitle: "A sentence or two on what you do." },
    { key: "photo", title: "Profile photo", subtitle: "At least one image so review can begin." },
    { key: "discipline", title: "What you do", subtitle: "Pick your primary talent type." },
    { key: "languages", title: "Languages", subtitle: "Languages you work in." },
    { key: "location", title: "Where you're based", subtitle: "Your home base for travel + matching." },
    { key: "rates", title: "Rates", subtitle: "A starting rate so clients can plan." },
    { key: "payout", title: "Get paid", subtitle: "Connect a payout account to receive bookings." },
    { key: "review", title: "Go live", subtitle: "Review and publish your profile." },
  ];

  const [stepIndex, setStepIndex] = useState(0);
  const step = steps[stepIndex]!;
  const isLast = stepIndex === steps.length - 1;

  const checklistByKey = useMemo(() => {
    const m = new Map<string, TalentChecklistItem>();
    for (const item of checklist) m.set(item.key, item);
    return m;
  }, [checklist]);

  const completedCount = checklist.filter((i) => i.complete).length;
  const totalCount = checklist.length;

  const stepComplete = (key: StepKey): boolean | null => {
    const keys = STEP_CHECKLIST_KEYS[key];
    if (keys.length === 0) {
      if (key === "payout") return payoutStatus === "enabled";
      return null;
    }
    return keys.every((k) => checklistByKey.get(k)?.complete ?? false);
  };

  const goNext = () => setStepIndex((i) => Math.min(i + 1, steps.length - 1));
  const goBack = () => setStepIndex((i) => Math.max(i - 1, 0));

  // After any save, ask the server for fresh canonical completeness.
  const refresh = () => router.refresh();

  return (
    <div style={{ minHeight: "100dvh", background: C.surface, fontFamily: FONT, color: C.ink }}>
      <div style={{ maxWidth: 720, margin: "0 auto", padding: "28px 18px 64px" }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, marginBottom: 6 }}>
          <h1 style={{ fontFamily: DISPLAY, fontSize: 22, fontWeight: 600, letterSpacing: "0.01em", margin: 0 }}>
            Set up your profile
          </h1>
          <Link
            href="/talent/today"
            style={{ fontSize: 12.5, color: C.inkMuted, textDecoration: "underline", textUnderlineOffset: 3 }}
          >
            Skip to dashboard
          </Link>
        </div>
        <p style={{ fontSize: 13, color: C.inkMuted, marginTop: 0, marginBottom: 18, lineHeight: 1.5 }}>
          A few quick steps and you&apos;ll be ready to take bookings. You can leave and come back any time;
          everything saves as you go.
        </p>

        {/* Progress card — driven by the SERVER-canonical checklist. */}
        <ProgressCard
          completedCount={completedCount}
          totalCount={totalCount}
          percent={completionScore}
        />

        {/* Step rail */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, margin: "16px 0 14px" }}>
          {steps.map((s, i) => {
            const done = stepComplete(s.key);
            const active = i === stepIndex;
            return (
              <button
                key={s.key}
                type="button"
                onClick={() => setStepIndex(i)}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "5px 11px",
                  borderRadius: 999,
                  border: `1px solid ${active ? C.accent : C.borderSoft}`,
                  background: active ? C.accentSoft : "#fff",
                  color: active ? C.accentDeep : C.inkMuted,
                  fontSize: 11.5,
                  fontWeight: 600,
                  cursor: "pointer",
                  fontFamily: FONT,
                }}
              >
                <span
                  aria-hidden
                  style={{
                    width: 7,
                    height: 7,
                    borderRadius: "50%",
                    background: done === true ? C.success : done === false ? C.amber : C.border,
                  }}
                />
                {s.title}
              </button>
            );
          })}
        </div>

        {/* Step card */}
        <div
          style={{
            background: "#fff",
            border: `1px solid ${C.borderSoft}`,
            borderRadius: 16,
            padding: "22px 22px 18px",
          }}
        >
          <div style={{ marginBottom: 4 }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: C.inkMuted }}>
              Step {stepIndex + 1} of {steps.length}
            </div>
            <h2 style={{ fontFamily: DISPLAY, fontSize: 19, fontWeight: 600, margin: "4px 0 2px" }}>{step.title}</h2>
            <p style={{ fontSize: 12.5, color: C.inkMuted, margin: 0 }}>{step.subtitle}</p>
          </div>

          <div style={{ marginTop: 18 }}>
            {step.key === "basics" && (
              <BasicsStep
                talentProfileId={talentProfileId}
                initialName={prefill.displayName}
                initialPhone={prefill.phone}
                initialGender={prefill.gender}
                initialDob={prefill.dateOfBirth}
                onSaved={refresh}
              />
            )}
            {step.key === "bio" && (
              <BioStep talentProfileId={talentProfileId} initialBio={prefill.shortBio} onSaved={refresh} />
            )}
            {step.key === "photo" && (
              <PhotoStep mediaCount={mediaCount} />
            )}
            {step.key === "discipline" && (
              <DisciplineStep
                talentProfileId={talentProfileId}
                parentCategories={parentCategories}
                initialPrimarySlug={prefill.primaryTalentSlug}
                initialSecondarySlugs={prefill.secondaryTalentSlugs}
                onSaved={refresh}
              />
            )}
            {step.key === "languages" && (
              <LanguagesStep talentProfileId={talentProfileId} onSaved={refresh} />
            )}
            {step.key === "location" && (
              <LocationStep
                talentProfileId={talentProfileId}
                initialHomeBase={prefill.homeBase}
                onSaved={refresh}
              />
            )}
            {step.key === "rates" && (
              <RatesStep talentProfileId={talentProfileId} initialRates={prefill.ratesData} onSaved={refresh} />
            )}
            {step.key === "payout" && (
              <PayoutStep tenantSlug={tenantSlug} payoutStatus={payoutStatus} />
            )}
            {step.key === "review" && (
              <ReviewStep
                talentProfileId={talentProfileId}
                checklist={checklist}
                canSubmit={canSubmit}
                workflowStatus={workflowStatus}
                previewHref={previewHref}
                onSubmitted={refresh}
              />
            )}
          </div>
        </div>

        {/* Footer nav */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 16 }}>
          <button
            type="button"
            onClick={goBack}
            disabled={stepIndex === 0}
            style={{
              ...secondaryBtn,
              opacity: stepIndex === 0 ? 0.4 : 1,
              cursor: stepIndex === 0 ? "default" : "pointer",
            }}
          >
            ← Back
          </button>
          {!isLast ? (
            <button type="button" onClick={goNext} style={primaryBtn}>
              Next →
            </button>
          ) : (
            <Link href="/talent/today" style={{ ...primaryBtn, textDecoration: "none", display: "inline-flex", alignItems: "center" }}>
              Done
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Progress card ──────────────────────────────────────────────────────────

function ProgressCard({ completedCount, totalCount, percent }: { completedCount: number; totalCount: number; percent: number }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 14,
        padding: "14px 16px",
        borderRadius: 14,
        background: "linear-gradient(135deg, rgba(15,79,62,0.07), rgba(91,107,160,0.06))",
        border: `1px solid rgba(15,79,62,0.16)`,
      }}
    >
      <div
        aria-hidden
        style={{
          flexShrink: 0,
          width: 52,
          height: 52,
          borderRadius: "50%",
          background: "#fff",
          border: `2px solid ${C.accent}`,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: DISPLAY,
          fontSize: 16,
          fontWeight: 600,
          color: C.accentDeep,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {percent}%
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: C.ink }}>
          {completedCount} of {totalCount} essentials complete
        </div>
        <div
          role="progressbar"
          aria-valuenow={completedCount}
          aria-valuemin={0}
          aria-valuemax={totalCount}
          style={{ marginTop: 8, height: 6, borderRadius: 999, background: "rgba(24,24,27,0.08)", overflow: "hidden" }}
        >
          <div
            style={{
              height: "100%",
              width: `${totalCount === 0 ? 0 : Math.round((completedCount / totalCount) * 100)}%`,
              background: C.accent,
              borderRadius: 999,
              transition: "width 240ms ease",
            }}
          />
        </div>
      </div>
    </div>
  );
}
