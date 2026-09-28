"use client";

import { useMemo } from "react";
import { useDashboardText } from "@/components/admin/shell/internal/dashboard-i18n";
import { PRESENCE_ES_TEXT } from "./presence-es-text";

export { PRESENCE_ES_TEXT };

/** Presence strings first, then the dashboard map, then the English literal. */

export function translatePresence(value: string, es: boolean, fallback: (v: string) => string): string {
  if (!es) return value;
  return PRESENCE_ES_TEXT[value] ?? fallback(value);
}

export function usePresenceText() {
  const copy = useDashboardText();
  return useMemo(
    () => ({
      es: copy.isSpanish,
      t: (value: string) => translatePresence(value, copy.isSpanish, copy.t),
    }),
    [copy],
  );
}
