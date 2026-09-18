"use client";

/**
 * "Here is what I understood" — one card, one line per essential, each
 * marked as said / guessed / missing. Tap a guessed or said line to fix it
 * in place; a missing line jumps to its question. The button says how many
 * questions follow.
 */

import { useState } from "react";

import type { MachineErrorCode } from "@/lib/onboarding/machine";
import type { OnboardingPath } from "@/lib/onboarding/module-state";
import type { UnderstoodLine, Understanding } from "@/lib/onboarding/understanding";
import type { ModuleQuestionId } from "@/lib/onboarding/module-questions";

import { GhostLink, Notice, PrimaryButton, SecondaryButton, Sub, Title } from "../ui";

function StatusChip({ t, status }: { t: (k: string) => string; status: UnderstoodLine["status"] }) {
  const map = {
    known: { key: "public.onboarding.understood.known", bg: "var(--tl-positive-bg)", color: "var(--tl-positive)" },
    assumed: { key: "public.onboarding.understood.assumed", bg: "var(--tl-warning-bg)", color: "var(--tl-warning)" },
    missing: { key: "public.onboarding.understood.missing", bg: "var(--tl-error-bg)", color: "var(--tl-error)" },
    later: { key: "public.onboarding.understood.later", bg: "var(--tl-stone-soft)", color: "var(--tl-muted)" },
  }[status];
  return (
    <span className="shrink-0 rounded-full px-2 py-0.5 text-[0.6875rem] font-medium" style={{ background: map.bg, color: map.color }} data-testid={`onb-line-status-${status}`}>
      {t(map.key)}
    </span>
  );
}

export function UnderstoodStep({
  t,
  understanding,
  fromLink,
  busy,
  error,
  onEdit,
  onAskMe,
  onAccept,
  onChangePath,
}: {
  t: (key: string) => string;
  understanding: Understanding;
  fromLink: boolean;
  busy: boolean;
  error: MachineErrorCode | null;
  onEdit: (factKey: string, value: string | string[]) => Promise<void>;
  onAskMe: (questionId: ModuleQuestionId) => void;
  onAccept: () => void;
  onChangePath: () => void;
}) {
  const [editing, setEditing] = useState<UnderstoodLine | null>(null);
  const [draft, setDraft] = useState("");
  // One essentials screen follows whatever is missing, so the button says the same thing every time.
  const cta = t("public.onboarding.understood.looksGood");
  const pathKey = `public.onboarding.understood.path.${understanding.path}` as const;

  const errorText =
    error === "ai_off" ? t("public.onboarding.understood.aiOff")
    : error === "rate_limit" ? t("public.onboarding.understood.rateLimit")
    : error === "import_failed" ? t("public.onboarding.understood.importFailed")
    : error === "failed" ? t("public.onboarding.understood.readFailed")
    : error === "offline" ? t("public.onboarding.errors.offline")
    : error === "save_failed" ? t("public.onboarding.errors.saveFailed")
    : null;

  const startEdit = (line: UnderstoodLine) => {
    setEditing(line);
    setDraft(line.value ?? "");
  };
  const isList = (line: UnderstoodLine) => line.factKey === "work.services" || line.factKey === "business.hours";
  const saveEdit = async () => {
    if (!editing) return;
    const value = isList(editing) ? draft.split(/\n|·/).map((s) => s.trim()).filter(Boolean) : draft.trim();
    if ((Array.isArray(value) && value.length === 0) || value === "") return;
    await onEdit(editing.factKey, value);
    setEditing(null);
  };

  return (
    <div data-testid="onb-understood">
      <Title>{fromLink ? t("public.onboarding.understood.titleLink") : t("public.onboarding.understood.title")}</Title>
      <Sub>{t("public.onboarding.understood.sub")}</Sub>

      <p className="mt-4 flex items-center gap-2 text-[0.8125rem]" style={{ color: "var(--tl-muted)" }} data-testid="onb-path">
        <span>{t("public.onboarding.understood.pathLabel")}:</span>
        <span className="font-medium" style={{ color: "var(--tl-ink)" }}>{t(pathKey)}</span>
        <GhostLink onClick={onChangePath} testId="onb-change-path">{t("public.onboarding.understood.changePath")}</GhostLink>
      </p>

      <ul className="mt-4 flex flex-col gap-2" data-testid="onb-lines">
        {understanding.lines.map((line) => {
          const editable = line.status !== "later" && line.edit.kind !== "none";
          const onTap = () => {
            if (line.status === "missing" && line.edit.kind === "question") onAskMe(line.edit.questionId);
            else if (editable) startEdit(line);
          };
          return (
            <li key={line.id} data-testid={`onb-line-${line.id}`} data-status={line.status}>
              <button
                type="button"
                onClick={onTap}
                disabled={!editable}
                className="flex w-full items-center gap-3 rounded-[14px] px-3 py-2.5 text-left"
                style={{ background: "var(--tl-surface-raised)", border: "1px solid var(--tl-hairline)" }}
              >
                <span aria-hidden className="grid size-8 shrink-0 place-items-center rounded-full" style={{ background: "var(--tl-stone-soft)", color: "var(--tl-ink)" }}>
                  <LineIcon id={line.id} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[0.6875rem] font-semibold uppercase tracking-[0.06em]" style={{ color: "var(--tl-muted)" }}>{t(line.labelKey)}</span>
                  <span className="block truncate text-[0.9375rem]" style={{ color: line.value ? "var(--tl-ink)" : "var(--tl-muted-soft)" }}>
                    {line.value ?? (line.status === "later" ? t("public.onboarding.understood.laterValue") : t("public.onboarding.understood.missingValue"))}
                  </span>
                </span>
                {line.status === "known" ? (
                  <span aria-hidden className="shrink-0 text-[0.875rem]" style={{ color: "var(--tl-muted)" }}>✎</span>
                ) : (
                  <StatusChip t={t} status={line.status} />
                )}
              </button>
            </li>
          );
        })}
      </ul>

      {errorText ? <Notice tone={error === "ai_off" ? "warn" : "error"} testId="onb-error">{errorText}</Notice> : null}

      <div className="mt-5 flex flex-col gap-2">
        <PrimaryButton onClick={onAccept} disabled={busy} testId="onb-accept">{cta}</PrimaryButton>
        <p className="text-center text-[0.8125rem]" style={{ color: "var(--tl-muted)" }}>{t("public.onboarding.understood.editHint")}</p>
      </div>

      {editing ? (
        <div className="fixed inset-0 z-[410] flex items-end justify-center sm:items-center" style={{ background: "rgba(22,26,22,0.45)" }} onMouseDown={(e) => { if (e.target === e.currentTarget) setEditing(null); }}>
          <div className="w-full rounded-t-[28px] p-5 sm:w-[480px] sm:rounded-[28px]" style={{ background: "var(--tl-bone)" }} role="dialog" aria-label={t("public.onboarding.understood.editTitle")} data-testid="onb-edit-sheet">
            <p className="text-[0.75rem] font-semibold uppercase tracking-[0.06em]" style={{ color: "var(--tl-muted)" }}>{t(editing.labelKey)}</p>
            {isList(editing) ? (
              <textarea
                autoFocus
                value={draft.replaceAll(" · ", "\n")}
                onChange={(e) => setDraft(e.target.value)}
                rows={4}
                data-testid="onb-edit-input"
                className="mt-2 w-full rounded-[14px] px-3 py-2 text-[1rem] outline-none"
                style={{ background: "var(--tl-surface-raised)", border: "1px solid var(--tl-hairline)", color: "var(--tl-ink)" }}
              />
            ) : (
              <input
                autoFocus
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") void saveEdit(); }}
                data-testid="onb-edit-input"
                className="mt-2 h-12 w-full rounded-[14px] px-3 text-[1rem] outline-none"
                style={{ background: "var(--tl-surface-raised)", border: "1px solid var(--tl-hairline)", color: "var(--tl-ink)" }}
              />
            )}
            {isList(editing) ? <p className="mt-1 text-[0.75rem]" style={{ color: "var(--tl-muted)" }}>{t("public.onboarding.understood.listHint")}</p> : null}
            <div className="mt-4 flex flex-col gap-2">
              <PrimaryButton onClick={() => void saveEdit()} disabled={busy} testId="onb-edit-save">{t("public.onboarding.understood.save")}</PrimaryButton>
              <SecondaryButton onClick={() => setEditing(null)} testId="onb-edit-cancel">{t("public.onboarding.understood.cancel")}</SecondaryButton>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/** One glyph per line id; a shape, not a brand asset, so it needs no locale. */
function LineIcon({ id }: { id: string }) {
  const d =
    id === "businessName" || id === "name" ? "M4 20a8 8 0 0116 0M12 12a4 4 0 100-8 4 4 0 000 8z"
    : id === "kind" || id === "what" ? "M4 7h16M4 12h10M4 17h7"
    : id === "city" ? "M12 21s-6-5.3-6-11a6 6 0 1112 0c0 5.7-6 11-6 11zM12 10a2 2 0 100-4 2 2 0 000 4z"
    : id === "services" || id === "offer" ? "M5 12l4 4L19 6"
    : id === "hours" ? "M12 8v4l3 2M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
    : id === "whatsapp" ? "M5 4h4l2 5-2 1a11 11 0 005 5l1-2 5 2v4a2 2 0 01-2 2A16 16 0 013 6a2 2 0 012-2z"
    : id === "logo" ? "M4 4h16v16H4zM8 14l3-3 3 3 2-2 4 4"
    : "M12 3l2.5 5 5.5.8-4 3.9.9 5.5L12 15.6 7.1 18.2l.9-5.5-4-3.9 5.5-.8z";
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d={d} /></svg>
  );
}

export function pathLabelKey(path: OnboardingPath): string {
  return `public.onboarding.understood.path.${path}`;
}
