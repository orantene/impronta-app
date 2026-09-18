"use client";

/**
 * Step 1 · Tell us what you do.
 *
 * Mic first (one big button in the middle), the text box under it, a link
 * button for people with a site or Instagram, and one example sentence that
 * rotates every two seconds until the person starts typing or talking.
 * Nothing is sent while talking; Send is always a tap the person makes.
 */

import { useEffect, useRef, useState } from "react";

import { useFormPersistence, clearFormPersistence } from "@/lib/ui/use-form-persistence";
import { EXAMPLE_ROTATE_MS, exampleAt } from "@/lib/onboarding/example-bank";
import type { MachineErrorCode } from "@/lib/onboarding/machine";

import { useVoiceInput } from "../use-voice-input";
import type { OnboardingIntent } from "@/lib/onboarding/module-state";

import { Eyebrow, MicGlyph, Notice, PrimaryButton, StopGlyph, Sub, Title } from "../ui";

const PERSIST_STEP = "onboarding-entry";

export function EntryStep({
  locale,
  t,
  intent = "unknown",
  text,
  onText,
  onDictation,
  onReview,
  onSendLink,
  busy,
  error,
}: {
  locale: "en" | "es";
  t: (key: string) => string;
  text: string;
  onText: (text: string) => void;
  onDictation: (on: boolean) => void;
  onReview: () => void;
  onSendLink: (url: string) => void;
  intent?: OnboardingIntent;
  busy: boolean;
  error: MachineErrorCode | null;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  // Typed words survive a reload / an app switch on the phone (offline too).
  useFormPersistence(formRef, { step: PERSIST_STEP });

  const [mode, setMode] = useState<"type" | "voice" | "link">("type");
  const linkMode = mode === "link";
  const [link, setLink] = useState("");
  const [exampleIndex, setExampleIndex] = useState(0);

  const voice = useVoiceInput({
    locale,
    value: text,
    setValue: (updater) => onText(updater(text)),
  });
  const listening = voice.state === "listening";
  const transcribing = voice.state === "transcribing";

  const onDictationRef = useRef(onDictation);
  useEffect(() => {
    onDictationRef.current = onDictation;
  }, [onDictation]);
  useEffect(() => {
    onDictationRef.current(listening);
  }, [listening]);

  // Rotate examples only while the box is empty and nobody is talking.
  const paused = text.trim().length > 0 || listening || transcribing || linkMode;
  useEffect(() => {
    if (paused) return;
    const id = window.setInterval(() => setExampleIndex((i) => i + 1), EXAMPLE_ROTATE_MS);
    return () => window.clearInterval(id);
  }, [paused]);

  const micNote =
    voice.note === "blocked" ? t("public.onboarding.entry.micBlocked")
    : voice.note === "failed" ? t("public.onboarding.entry.micFailed")
    : voice.note === "tooShort" ? t("public.onboarding.entry.micTooShort")
    : null;

  const errorText =
    error === "too_long" ? t("public.onboarding.errors.tooLong")
    : error === "offline" ? t("public.onboarding.errors.offline")
    : error === "module_off" ? t("public.onboarding.errors.moduleOff")
    : error === "save_failed" ? t("public.onboarding.errors.saveFailed")
    : error === "no_owner" || error === "no_brief" ? t("public.onboarding.errors.noOwner")
    : null;

  const submit = () => {
    if (busy) return;
    if (linkMode) {
      const url = link.trim();
      if (url) onSendLink(url);
      return;
    }
    if (listening) voice.cancel();
    if (text.trim()) {
      clearFormPersistence(PERSIST_STEP);
      onReview();
    }
  };

  return (
    <form
      ref={formRef}
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      data-testid="onb-entry"
    >
      <Eyebrow>{t("public.onboarding.entry.eyebrow")}</Eyebrow>
      <Title>{intent === "business" ? t("public.onboarding.entry.titleBusiness") : intent === "talent" ? t("public.onboarding.entry.titleTalent") : t("public.onboarding.entry.title")}</Title>
      <Sub>{t("public.onboarding.entry.sub")}</Sub>

      {/* How they want to say it. One control, three modes; the box below follows. */}
      <div className="mt-5 inline-flex rounded-full p-1" style={{ background: "var(--tl-stone-soft)" }} role="tablist" aria-label={t("public.onboarding.entry.modeLabel")} data-testid="onb-mode">
        {(["type", "voice", "link"] as const).map((m) => (
          <button
            key={m}
            type="button"
            role="tab"
            aria-selected={mode === m}
            onClick={() => { if (listening) voice.cancel(); setMode(m); }}
            data-testid={m === "link" ? "onb-toggle-link" : `onb-mode-${m}`}
            className="rounded-full px-4 py-1.5 text-[0.8125rem] font-semibold transition-colors"
            style={{ background: mode === m ? "var(--tl-ink)" : "transparent", color: mode === m ? "var(--tl-bone)" : "var(--tl-ink-soft)" }}
          >
            {m === "type" ? t("public.onboarding.entry.modeType") : m === "voice" ? t("public.onboarding.entry.modeVoice") : t("public.onboarding.entry.modeLink")}
          </button>
        ))}
      </div>

      {mode === "voice" ? (
        <div className="mt-6 flex flex-col items-center">
          {voice.micMode ? (
            <>
              <button
                type="button"
                onClick={voice.toggle}
                disabled={busy || transcribing}
                aria-pressed={listening}
                aria-label={listening ? t("public.onboarding.entry.tapToStop") : t("public.onboarding.entry.tapToTalk")}
                data-testid="onb-mic"
                className="grid size-[88px] place-items-center rounded-full transition-transform active:scale-95 disabled:opacity-50"
                style={{
                  background: listening ? "var(--tl-accent)" : "var(--tl-forest)",
                  color: listening ? "var(--tl-ink)" : "var(--tl-forest-on)",
                  boxShadow: listening ? "0 0 0 10px var(--tl-forest-soft)" : "var(--tl-shadow-md)",
                }}
              >
                {transcribing ? <span className="animate-pulse text-[0.75rem] font-semibold">…</span> : listening ? <StopGlyph /> : <MicGlyph />}
              </button>
              <p className="mt-3 text-[0.875rem] font-medium" style={{ color: "var(--tl-ink-soft)" }} aria-live="polite">
                {listening
                  ? t("public.onboarding.entry.listening")
                  : transcribing
                    ? t("public.onboarding.entry.transcribing")
                    : t("public.onboarding.entry.tapToTalk")}
              </p>
            </>
          ) : (
            <p className="text-[0.875rem]" style={{ color: "var(--tl-muted)" }}>{t("public.onboarding.entry.noMic")}</p>
          )}
          {micNote ? <Notice tone="warn" testId="onb-mic-note">{micNote}</Notice> : null}
        </div>
      ) : null}

      <div
        className="mt-5 rounded-[22px] p-3"
        style={{ background: "var(--tl-surface-raised)", border: "1px solid var(--tl-hairline)" }}
      >
        {linkMode ? (
          <input
            name="link"
            type="text"
            inputMode="url"
            autoComplete="off"
            value={link}
            onChange={(e) => setLink(e.target.value)}
            placeholder={t("public.onboarding.entry.linkPlaceholder")}
            aria-label={t("public.onboarding.entry.linkPlaceholder")}
            data-testid="onb-link"
            className="h-11 w-full bg-transparent px-2 text-[0.9375rem] outline-none placeholder:text-[var(--tl-muted-soft)]"
            style={{ color: "var(--tl-ink)" }}
          />
        ) : (
          <textarea
            name="sentence"
            value={text}
            onChange={(e) => onText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submit();
              }
            }}
            rows={mode === "voice" ? 3 : 4}
            placeholder={t("public.onboarding.entry.typePlaceholder")}
            aria-label={t("public.onboarding.entry.typePlaceholder")}
            data-testid="onb-sentence"
            className="w-full resize-none bg-transparent px-2 py-1 text-[0.9375rem] leading-[1.5] outline-none placeholder:text-[var(--tl-muted-soft)]"
            style={{ color: "var(--tl-ink)" }}
          />
        )}
      </div>

      {!paused ? (
        <p className="mt-3 min-h-[2.6em] text-[0.8125rem] leading-[1.45]" style={{ color: "var(--tl-muted)" }} data-testid="onb-example" aria-live="off">
          <span className="font-medium">{t("public.onboarding.entry.forExample")}:</span>{" "}
          <span key={exampleIndex} className="onb-example-in">{exampleAt(locale, exampleIndex)}</span>
        </p>
      ) : null}

      {errorText ? <Notice tone="error" testId="onb-error">{errorText}</Notice> : null}

      <div className="mt-5 flex flex-col gap-3">
        <PrimaryButton type="submit" disabled={busy || (linkMode ? !link.trim() : !text.trim())} testId="onb-send">
          {t("public.onboarding.entry.send")}
        </PrimaryButton>
        <p className="text-center text-[0.75rem]" style={{ color: "var(--tl-muted)" }}>{t("public.onboarding.entry.free")}</p>
      </div>
    </form>
  );
}
