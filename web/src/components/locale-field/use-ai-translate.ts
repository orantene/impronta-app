"use client";

/**
 * useAiTranslate: the AI button's state machine for one field.
 *
 *   idle → loading → success (1.5 s) → idle
 *                  → error        (retry allowed)
 *                  → unavailable  (no key / flag off; stays disabled)
 *                  → quota        (daily cap; disabled for the whole session)
 *
 * Remembers `lastSource[locale]`, the primary text last translated into each
 * locale, so the button re-enables only when the source changed. The result is
 * handed back to the caller as a normal draft edit; nothing is saved here.
 */
import { useCallback, useEffect, useRef, useState } from "react";

import {
  aiStateForCode,
  translateTalentField,
  type TalentTranslateField,
} from "./translate-action";

export type AiTranslateState = "idle" | "loading" | "success" | "error" | "unavailable" | "quota";

/** Mirrors TALENT_TRANSLATE_LOCALES (that module pulls node:crypto; not client-safe). */
const TRANSLATE_LOCALES = ["en", "es", "fr", "pt", "de"] as const;
type TranslateLocale = (typeof TRANSLATE_LOCALES)[number];
function isTranslateLocale(v: string): v is TranslateLocale {
  return (TRANSLATE_LOCALES as readonly string[]).includes(v);
}

/** A quota hit disables every AI button until the next page load. */
let sessionQuotaHit = false;

/** Test hook: reset the session-wide quota latch. */
export function resetAiTranslateSessionForTests(): void {
  sessionQuotaHit = false;
}

export function useAiTranslate(field: TalentTranslateField) {
  const [state, setState] = useState<AiTranslateState>(() => (sessionQuotaHit ? "quota" : "idle"));
  const [lastSource, setLastSource] = useState<Record<string, string>>({});
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const run = useCallback(
    async (input: { from: string; to: string; text: string }): Promise<string | null> => {
      if (sessionQuotaHit) {
        setState("quota");
        return null;
      }
      if (!isTranslateLocale(input.from) || !isTranslateLocale(input.to)) {
        setState("error");
        return null;
      }
      setState("loading");
      let res;
      try {
        res = await translateTalentField({ field, text: input.text, from: input.from, to: input.to });
      } catch {
        setState("error");
        return null;
      }
      if (res.ok) {
        setLastSource((prev) => ({ ...prev, [input.to]: input.text }));
        setState("success");
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => setState("idle"), 1500);
        return res.text;
      }
      const next = aiStateForCode(res.code);
      if (next === "quota") sessionQuotaHit = true;
      setState(next);
      return null;
    },
    [field],
  );

  return { state, lastSource, run };
}
