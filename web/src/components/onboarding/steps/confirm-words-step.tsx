"use client";

/**
 * "Is this right?" — the transcript (or typed sentence) shown once more,
 * editable, before anything is sent. One tap to fix a word; "Say it again"
 * is the only other option.
 */

import type { MachineErrorCode } from "@/lib/onboarding/machine";

import { GhostLink, Notice, PrimaryButton, Sub, Title } from "../ui";

export function ConfirmWordsStep({
  t,
  text,
  onText,
  onSend,
  onSayAgain,
  busy,
  error,
}: {
  t: (key: string) => string;
  text: string;
  onText: (text: string) => void;
  onSend: () => void;
  onSayAgain: () => void;
  busy: boolean;
  error: MachineErrorCode | null;
}) {
  const errorText =
    error === "too_long" ? t("public.onboarding.errors.tooLong")
    : error === "offline" ? t("public.onboarding.errors.offline")
    : error === "module_off" ? t("public.onboarding.errors.moduleOff")
    : error === "save_failed" ? t("public.onboarding.errors.saveFailed")
    : error === "no_owner" || error === "no_brief" ? t("public.onboarding.errors.noOwner")
    : null;
  return (
    <div data-testid="onb-confirm">
      <Title>{t("public.onboarding.confirmWords.title")}</Title>
      <Sub>{t("public.onboarding.confirmWords.sub")}</Sub>
      <div className="mt-5 rounded-[22px] p-3" style={{ background: "var(--tl-surface-raised)", border: "1px solid var(--tl-hairline)" }}>
        <textarea
          value={text}
          onChange={(e) => onText(e.target.value)}
          rows={4}
          aria-label={t("public.onboarding.confirmWords.title")}
          data-testid="onb-confirm-text"
          className="w-full resize-none bg-transparent px-2 py-1 text-[1.0625rem] leading-[1.5] outline-none"
          style={{ color: "var(--tl-ink)" }}
        />
      </div>
      {errorText ? <Notice tone="error" testId="onb-error">{errorText}</Notice> : null}
      <div className="mt-5 flex flex-col items-center gap-3">
        <PrimaryButton onClick={onSend} disabled={busy || !text.trim()} testId="onb-confirm-send">
          {t("public.onboarding.confirmWords.send")}
        </PrimaryButton>
        <GhostLink onClick={onSayAgain} testId="onb-say-again">{t("public.onboarding.confirmWords.sayAgain")}</GhostLink>
      </div>
    </div>
  );
}
