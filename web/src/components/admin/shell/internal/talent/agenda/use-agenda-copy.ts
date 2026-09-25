"use client";

import { useMemo } from "react";
import { agendaI18n, type AgendaLocale } from "@/lib/talent-agenda/agenda-i18n";
import { useDashboardText } from "../../dashboard-i18n";

/**
 * Dashboard translator first; agenda catalog fills keys not yet in the shell catalog.
 */
export function useAgendaCopy() {
  const dash = useDashboardText();
  const locale: AgendaLocale = dash.isSpanish ? "es" : "en";
  const agendaT = useMemo(() => agendaI18n(locale), [locale]);

  return useMemo(
    () => ({
      locale,
      isSpanish: dash.isSpanish,
      t: (key: string) => {
        const fromDash = dash.t(key);
        if (fromDash !== key) return fromDash;
        return agendaT(key);
      },
    }),
    [agendaT, dash, locale],
  );
}
