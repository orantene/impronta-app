"use client";
import { useMemo } from "react";

import { translatorFor } from "./translator-for";
import { useDashboardLocale } from "./use-dashboard-locale";

/**
 * `useT` without the full-catalog import: same locale source (the dashboard
 * locale cookie / server provider) and the same cached translator, but reads
 * only the inlined client subtrees (see `client-subtrees.ts`). Use it in
 * components that render on public pages; `useT` registers the whole catalogs
 * in the browser and belongs to dashboard code.
 */
export function usePublicT() {
  const locale = useDashboardLocale();
  return useMemo(() => translatorFor(locale), [locale]);
}
