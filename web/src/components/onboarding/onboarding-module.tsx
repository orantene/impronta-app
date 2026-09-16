"use client";

/**
 * The shared onboarding module: one overlay on the marketing host that takes a
 * person from "tell us what you do" to a working page. A 640 px card on
 * desktop, the full screen under 720 px; every step lives inside it and the
 * only navigation out is the arrival button (later phases).
 *
 * State is a pure reducer (`lib/onboarding/machine.ts`); persistence is the
 * brief's `module_state` through the server actions, written after every step
 * so closing the phone loses nothing and reopening offers "Continue".
 */

import { useCallback, useEffect, useMemo, useReducer, useRef } from "react";

import { translatorFor } from "@/i18n/use-t";
import { initialMachineState, reduceMachine, type MachineErrorCode } from "@/lib/onboarding/machine";
import type { ModuleStep, OnboardingIntent } from "@/lib/onboarding/module-state";
import {
  acceptUnderstoodCard,
  answerModuleQuestion,
  chooseOnboardingPath,
  editUnderstoodFact,
  loadOnboardingCard,
  loadOnboardingResume,
  resetOnboardingDraft,
  saveOnboardingStep,
  setOnboardingLink,
  submitOnboardingInput,
  understandOnboardingInput,
  type CardResult,
  type QuestionAnswer,
} from "@/lib/server-actions/onboarding-module";
import type { OnboardingPath } from "@/lib/onboarding/module-state";

import { ConfirmWordsStep } from "./steps/confirm-words-step";
import { EntryStep } from "./steps/entry-step";
import { ForkStep } from "./steps/fork-step";
import { QuestionStep, questionsAfterFork } from "./steps/question-steps";
import { ReadingStep } from "./steps/reading-step";
import { ReadyStep } from "./steps/ready-step";
import { ResumeCard } from "./steps/resume-card";
import { TooLittleStep } from "./steps/too-little-step";
import { UnderstoodStep } from "./steps/understood-step";

// Full keys, not composed at runtime, so the dead-key guard can see them.
const STEP_LABEL: Record<ModuleStep, string> = {
  entry: "public.onboarding.chrome.step1",
  listening: "public.onboarding.chrome.step1",
  confirmWords: "public.onboarding.chrome.step1",
  tooLittle: "public.onboarding.chrome.step1",
  reading: "public.onboarding.chrome.step2",
  understood: "public.onboarding.chrome.step2",
  fork: "public.onboarding.chrome.step2",
  question: "public.onboarding.chrome.step2",
  readyToBuild: "public.onboarding.chrome.step2",
  save: "public.onboarding.chrome.step3",
  code: "public.onboarding.chrome.step3",
  building: "public.onboarding.chrome.step4",
  arrival: "public.onboarding.chrome.step5",
};

function isOffline(): boolean {
  return typeof navigator !== "undefined" && navigator.onLine === false;
}

export function OnboardingModule({
  locale,
  intent,
  onClose,
}: {
  locale: "en" | "es";
  intent: OnboardingIntent;
  /** `saved` is true when there is progress worth a "saved on this phone" toast. */
  onClose: (result: { saved: boolean }) => void;
}) {
  const t = useMemo(() => translatorFor(locale), [locale]);
  const [state, dispatch] = useReducer(reduceMachine, intent, initialMachineState);
  const cardRef = useRef<HTMLDivElement>(null);

  // Resume: what this owner already had. Opening creates nothing.
  useEffect(() => {
    let cancelled = false;
    void loadOnboardingResume().then((snapshot) => {
      if (!cancelled) dispatch({ type: "resumeLoaded", snapshot });
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const close = useCallback(() => {
    // Progress past entry is already on the server; the host's toast says so.
    onClose({ saved: state.step !== "entry" || state.text.trim().length > 0 });
  }, [onClose, state.step, state.text]);
  const closeRef = useRef(close);
  useEffect(() => {
    closeRef.current = close;
  }, [close]);

  // Scroll lock + Escape, as the talent modal does. Mount-only; Escape reads
  // the latest `close` through the ref.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeRef.current();
    };
    window.addEventListener("keydown", onKey);
    const focusTimer = window.setTimeout(() => cardRef.current?.focus(), 60);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
      window.clearTimeout(focusTimer);
    };
  }, []);

  const send = useCallback(
    async (text: string) => {
      if (isOffline()) {
        dispatch({ type: "sendFailed", code: "offline" });
        return;
      }
      dispatch({ type: "sendStarted" });
      try {
        const result = await submitOnboardingInput({ intent: state.intent, locale, text });
        if (result.ok) dispatch({ type: "sendAccepted", briefId: result.briefId, input: result.input });
        else dispatch({ type: "sendFailed", code: result.code as MachineErrorCode });
      } catch {
        dispatch({ type: "sendFailed", code: isOffline() ? "offline" : "save_failed" });
      }
    },
    [locale, state.intent],
  );

  const back = useCallback(() => {
    dispatch({ type: "back" });
    const to = state.step === "confirmWords" || state.step === "tooLittle" ? "entry" : "understood";
    void saveOnboardingStep({ step: to });
  }, [state.step]);

  // Phase 3 · the card. Runs the understand step once the words are sent
  // (reading screen), or reloads the card from the brief on resume.
  const applyCard = useCallback((result: CardResult, opts: { step?: ModuleStep } = {}) => {
    if (result.ok) {
      dispatch({ type: "cardLoaded", understanding: result.card.understanding, chip: result.card.chip, step: opts.step });
      return true;
    }
    const code: MachineErrorCode = result.code === "ai" ? (result.understandCode as MachineErrorCode) : (result.code as MachineErrorCode);
    dispatch({ type: "cardFailed", code });
    return false;
  }, []);

  // One understand call per entry into "reading" (a ref, not `busy`, guards
  // it: `sendStarted` changes `busy`, and an effect keyed on it would cancel
  // its own in-flight promise).
  const understandingForRef = useRef<string | null>(null);
  useEffect(() => {
    if (state.step !== "reading" || state.understanding) return;
    const key = `${state.briefId ?? ""}:${state.input?.value ?? ""}`;
    if (understandingForRef.current === key) return;
    understandingForRef.current = key;
    dispatch({ type: "sendStarted" });
    void understandOnboardingInput().then((result) => {
      if (result.ok) {
        applyCard(result, { step: result.card.understanding.tooLittle ? "tooLittle" : "understood" });
        return;
      }
      // Nothing read: show the card with everything missing so the person
      // can still answer the short questions, and say why.
      const code: MachineErrorCode = result.code === "ai" ? (result.understandCode as MachineErrorCode) : (result.code as MachineErrorCode);
      void loadOnboardingCard().then((fallback) => {
        if (fallback.ok) dispatch({ type: "cardLoaded", understanding: fallback.card.understanding, chip: fallback.card.chip, step: "understood" });
        dispatch({ type: "cardFailed", code });
      });
    });
  }, [state.step, state.understanding, state.briefId, state.input, applyCard]);

  // Resume at a Phase 3 step: the card is recomputed from the brief.
  const cardLoadRef = useRef(false);
  useEffect(() => {
    const phase3 = state.step === "understood" || state.step === "fork" || state.step === "question" || state.step === "readyToBuild";
    if (!phase3 || state.understanding || cardLoadRef.current) return;
    cardLoadRef.current = true;
    dispatch({ type: "sendStarted" });
    void loadOnboardingCard().then((result) => {
      cardLoadRef.current = false;
      applyCard(result, { step: state.step });
    });
  }, [state.step, state.understanding, applyCard]);

  const accept = useCallback(async () => {
    dispatch({ type: "sendStarted" });
    const r = await acceptUnderstoodCard();
    if (r.ok) dispatch({ type: "cardAccepted", nextStep: r.nextStep, followUps: r.followUps });
    else dispatch({ type: "cardFailed", code: "save_failed" });
  }, []);

  const choosePath = useCallback(async (path: OnboardingPath) => {
    dispatch({ type: "sendStarted" });
    const r = await chooseOnboardingPath({ path });
    if (r.ok) {
      dispatch({ type: "pathChosen", understanding: r.card.understanding, chip: r.card.chip, path });
      void saveOnboardingStep({ step: r.card.understanding.followUps.filter((q) => q !== "fork").length ? "question" : "readyToBuild" });
    } else dispatch({ type: "cardFailed", code: "save_failed" });
  }, []);

  const answer = useCallback(async (a: QuestionAnswer) => {
    dispatch({ type: "sendStarted" });
    const r = await answerModuleQuestion({ answer: a, questionIndex: state.questionIndex });
    if (r.ok) dispatch({ type: "questionAnswered", understanding: r.card.understanding, chip: r.card.chip });
    else dispatch({ type: "cardFailed", code: r.code === "invalid_whatsapp" ? "invalid_whatsapp" : "save_failed" });
  }, [state.questionIndex]);

  const checkLink = useCallback(async (slug: string) => {
    const r = await setOnboardingLink({ slug });
    if (!r.ok) return null;
    dispatch({ type: "linkChecked", slug: r.link.slug, available: r.link.available, suggestions: r.link.suggestions ?? [] });
    return r.link;
  }, []);

  const stepLabel = t(STEP_LABEL[state.step]);
  const showBack = state.step === "confirmWords" || state.step === "tooLittle" || state.step === "fork" || state.step === "question" || state.step === "readyToBuild";
  const questions = questionsAfterFork(state.followUps);

  let body: React.ReactNode;
  if (state.resume) {
    body = (
      <ResumeCard
        t={t}
        snapshot={state.resume}
        onContinue={() => dispatch({ type: "resumeContinue" })}
        onFresh={() => {
          dispatch({ type: "resumeFresh" });
          void resetOnboardingDraft();
        }}
      />
    );
  } else if (state.step === "entry" || state.step === "listening") {
    body = (
      <EntryStep
        locale={locale}
        t={t}
        text={state.text}
        onText={(text) => dispatch({ type: "textChanged", text })}
        onDictation={(on) => dispatch({ type: "dictation", on })}
        onReview={() => dispatch({ type: "reviewWords" })}
        onSendLink={(url) => void send(url)}
        busy={state.busy}
        error={state.error}
      />
    );
  } else if (state.step === "confirmWords") {
    body = (
      <ConfirmWordsStep
        t={t}
        text={state.text}
        onText={(text) => dispatch({ type: "textChanged", text })}
        onSend={() => void send(state.text)}
        onSayAgain={() => dispatch({ type: "editWords" })}
        busy={state.busy}
        error={state.error}
      />
    );
  } else if (state.step === "tooLittle") {
    body = <TooLittleStep t={t} onBack={() => dispatch({ type: "back" })} />;
  } else if (state.step === "understood" && state.understanding) {
    body = (
      <UnderstoodStep
        t={t}
        understanding={state.understanding}
        fromLink={state.input?.kind === "url"}
        busy={state.busy}
        error={state.error}
        onEdit={async (factKey, value) => {
          const r = await editUnderstoodFact({ factKey, value });
          applyCard(r, { step: "understood" });
        }}
        onAskMe={(questionId) => {
          void accept().then(() => dispatch({ type: "jumpToQuestion", questionId }));
        }}
        onAccept={() => void accept()}
        onChangePath={() => dispatch({ type: "toStep", step: "fork" })}
      />
    );
  } else if (state.step === "fork") {
    body = <ForkStep t={t} busy={state.busy} onChoose={(path) => void choosePath(path)} />;
  } else if (state.step === "question" && state.understanding && questions[state.questionIndex]) {
    body = (
      <QuestionStep
        t={t}
        locale={locale}
        questionId={questions[state.questionIndex]}
        index={state.questionIndex}
        total={questions.length}
        understanding={state.understanding}
        chip={state.chip}
        busy={state.busy}
        error={state.error}
        onAnswer={(a) => void answer(a)}
        onSkip={() => {
          dispatch({ type: "questionSkipped" });
          void saveOnboardingStep({ step: state.questionIndex + 1 < questions.length ? "question" : "readyToBuild" });
        }}
      />
    );
  } else if (state.step === "readyToBuild" && state.understanding) {
    body = (
      <ReadyStep
        t={t}
        understanding={state.understanding}
        path={state.understanding.path}
        linkSlug={state.linkSlug}
        linkAvailable={state.linkAvailable}
        linkSuggestions={state.linkSuggestions}
        busy={state.busy}
        onCheckLink={checkLink}
        onBuild={() => {
          dispatch({ type: "toStep", step: "save" });
          void saveOnboardingStep({ step: "save" });
        }}
      />
    );
  } else if (state.step === "save" || state.step === "code" || state.step === "building" || state.step === "arrival") {
    // Phase 4 lands these screens; until then the step is recorded and the
    // reading screen's "next" line says so.
    body = <ReadingStep t={t} input={state.input} />;
  } else {
    body = <ReadingStep t={t} input={state.input} />;
  }

  return (
    <>
      <div
        className="fixed inset-0 z-[400] flex items-end justify-center sm:items-center sm:p-6"
        style={{ background: "rgba(22, 26, 22, 0.55)" }}
        onMouseDown={(e) => {
          if (e.target === e.currentTarget) close();
        }}
        data-testid="onb-overlay"
      >
        <div
          ref={cardRef}
          tabIndex={-1}
          role="dialog"
          aria-modal="true"
          aria-label={t("public.onboarding.chrome.dialogLabel")}
          data-onboarding-step={state.step}
          className="flex h-[100dvh] w-full flex-col overflow-hidden outline-none sm:h-auto sm:max-h-[90vh] sm:w-[640px] sm:rounded-[28px]"
          style={{ background: "var(--tl-bone)", color: "var(--tl-ink)", boxShadow: "var(--tl-shadow-lg)" }}
        >
          <div className="flex items-center justify-between px-4 pt-[max(12px,env(safe-area-inset-top))] pb-2 sm:px-6 sm:pt-5">
            <div className="flex items-center gap-2">
              {showBack ? (
                <button
                  type="button"
                  onClick={back}
                  aria-label={t("public.onboarding.chrome.back")}
                  data-testid="onb-back"
                  className="grid size-9 place-items-center rounded-full"
                  style={{ border: "1px solid var(--tl-hairline)", color: "var(--tl-ink)" }}
                >
                  <svg aria-hidden width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M10 3L5 8l5 5" /></svg>
                </button>
              ) : null}
              <span className="text-[0.75rem] font-semibold uppercase tracking-[0.08em]" style={{ color: "var(--tl-muted)" }} data-testid="onb-step-label">
                {stepLabel}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span
                className="max-w-[160px] truncate rounded-full px-2.5 py-1 text-[0.6875rem] font-medium"
                style={{ background: "var(--tl-stone-soft)", color: "var(--tl-ink-soft)" }}
                data-testid="onb-account-pill"
              >
                {state.isAuthenticated && state.email
                  ? t("public.onboarding.chrome.signedInAs").replace("{email}", state.email)
                  : t("public.onboarding.chrome.guest")}
              </span>
              <button
                type="button"
                onClick={close}
                aria-label={t("public.onboarding.chrome.close")}
                data-testid="onb-close"
                className="grid size-9 place-items-center rounded-full"
                style={{ border: "1px solid var(--tl-hairline)", color: "var(--tl-ink)" }}
              >
                <svg aria-hidden width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><path d="M2 2l10 10M12 2L2 12" /></svg>
              </button>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto px-4 pb-[max(20px,env(safe-area-inset-bottom))] pt-2 sm:px-6 sm:pb-8">{body}</div>
        </div>
      </div>
    </>
  );
}

export function SavedToast({ text, onDone }: { text: string; onDone: () => void }) {
  useEffect(() => {
    const id = window.setTimeout(onDone, 3200);
    return () => window.clearTimeout(id);
  }, [onDone]);
  return (
    <div
      role="status"
      data-testid="onb-toast"
      className="fixed bottom-6 left-1/2 z-[401] -translate-x-1/2 rounded-full px-4 py-2 text-[0.8125rem] font-medium"
      style={{ background: "var(--tl-surface-inverse)", color: "var(--tl-on-inverse)", boxShadow: "var(--tl-shadow-md)" }}
    >
      {text}
    </div>
  );
}
