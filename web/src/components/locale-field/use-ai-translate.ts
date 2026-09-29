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
  translateTalentField,
  type TalentTranslateField,
} from "./translate-action";

export type AiTranslateState = "idle" | "loading" | "success" | "error" | "unavailable" | "quota";

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
      setState("loading");
      let res;
      try {
        res = await translateTalentField({ field, ...input });
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
      if (res.code === "quota") {
        sessionQuotaHit = true;
        setState("quota");
      } else if (res.code === "no_key" || res.code === "disabled") {
        setState("unavailable");
      } else {
        setState("error");
      }
      return null;
    },
    [field],
  );

  return { state, lastSource, run };
}
