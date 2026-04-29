"use client";

/**
 * Phase 14-lite — translate-section affordance.
 *
 * Sits in the inspector header next to the section save chip. Click
 * opens a popover with a target-locale picker. Submit calls the
 * server action which returns a JSON object of field → translated
 * text. Operator sees a per-field preview and can Apply or Discard
 * individual fields, or Apply All / Discard All.
 *
 * This is a stop-gap until per-field locale storage (Phase 9) ships:
 * today the operator picks a locale, accepts the translations, and
 * the section's text fields are OVERWRITTEN with the translated
 * strings. Workflow expectation: branch the locale by duplicating
 * the section first, then translate the duplicate.
 */

import { useState, useTransition, type ReactElement } from "react";

import {
  translateSectionWithAi,
  type AiTranslateResult,
} from "@/lib/site-admin/edit-mode/ai-rewrite-action";

const COMMON_LOCALES: ReadonlyArray<{ code: string; label: string }> = [
  { code: "es", label: "Spanish" },
  { code: "fr", label: "French" },
  { code: "pt-BR", label: "Portuguese (Brazil)" },
  { code: "it", label: "Italian" },
  { code: "de", label: "German" },
  { code: "ja", label: "Japanese" },
];

interface Props {
  sectionTypeKey: string;
  currentProps: Record<string, unknown>;
  onApply: (translations: Record<string, string>) => void;
}

export function AiTranslateSectionButton({
  sectionTypeKey,
  currentProps,
  onApply,
}: Props): ReactElement | null {
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState<string>("es");
  const [targetLabel, setTargetLabel] = useState<string>("Spanish");
  const [proposed, setProposed] = useState<Record<string, string> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function trigger() {
    setError(null);
    setProposed(null);
    startTransition(async () => {
      const result: AiTranslateResult = await translateSectionWithAi({
        sectionTypeKey,
        currentProps,
        targetLocale: target,
        targetLocaleLabel: targetLabel,
      });
      if (result.ok) {
        setProposed(result.translations);
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <div className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title="Translate this section's copy"
        className="inline-flex items-center gap-1 rounded-md border border-border/60 bg-background px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground hover:bg-muted/50"
      >
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M5 8h14" />
          <path d="M11 4v4" />
          <path d="M7 13c1.5 4 3 6 5 7" />
          <path d="M9 13c-2 4-3.5 6-6 7" />
          <path d="M21 21l-3-7-3 7" />
          <path d="M16 19h4" />
        </svg>
        Translate
      </button>
      {open ? (
        <div
          className="absolute right-0 top-full z-50 mt-1 w-[340px] rounded-md border border-border/60 bg-background p-3 text-xs shadow-xl"
          onMouseDown={(e) => e.preventDefault()}
        >
          <div className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Translate section copy
          </div>
          <div className="mb-2 flex items-center gap-2">
            <select
              className="flex-1 rounded-md border border-border/60 bg-background px-2 py-1 text-xs"
              value={target}
              onChange={(e) => {
                setTarget(e.target.value);
                const found = COMMON_LOCALES.find((l) => l.code === e.target.value);
                setTargetLabel(found?.label ?? e.target.value);
              }}
              disabled={pending}
            >
              {COMMON_LOCALES.map((l) => (
                <option key={l.code} value={l.code}>
                  {l.label} ({l.code})
                </option>
              ))}
            </select>
            <button
              type="button"
              disabled={pending}
              onClick={trigger}
              className="rounded-md border border-[#2a3147] bg-[#2a3147] px-2 py-1 text-[10px] font-semibold text-white transition hover:bg-[#363f59] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {pending ? "Translating…" : "Translate"}
            </button>
          </div>
          {error ? (
            <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-[11px] text-amber-700 dark:text-amber-300">
              {error}
            </div>
          ) : null}
          {proposed ? (
            <div className="mt-1 flex flex-col gap-2">
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                Preview ({Object.keys(proposed).length} field{Object.keys(proposed).length === 1 ? "" : "s"})
              </div>
              <div className="max-h-[260px] overflow-y-auto flex flex-col gap-1.5">
                {Object.entries(proposed).map(([k, v]) => (
                  <div
                    key={k}
                    className="rounded-md border border-border/60 bg-muted/20 p-2"
                  >
                    <div className="mb-1 flex items-center justify-between">
                      <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                        {k}
                      </span>
                    </div>
                    <div className="text-[12px] leading-snug text-foreground">{v}</div>
                  </div>
                ))}
              </div>
              <div className="flex justify-end gap-1">
                <button
                  type="button"
                  onClick={() => setProposed(null)}
                  className="rounded-md px-2 py-1 text-[10px] text-muted-foreground hover:bg-muted/50"
                >
                  Discard
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onApply(proposed);
                    setProposed(null);
                    setOpen(false);
                  }}
                  className="rounded-md border border-emerald-700 bg-emerald-700 px-2 py-1 text-[10px] font-semibold text-white hover:bg-emerald-800"
                >
                  Apply all
                </button>
              </div>
            </div>
          ) : null}
          {!proposed ? (
            <div className="flex justify-end pt-1">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-md px-2 py-1 text-[10px] text-muted-foreground hover:bg-muted/50"
              >
                Close
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
