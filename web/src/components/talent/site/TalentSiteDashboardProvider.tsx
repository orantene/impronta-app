"use client";

import { createContext, useContext, type ReactNode } from "react";

import type { TalentSiteDashboardState } from "@/lib/talent-site/types";

export type TalentSiteDashboardLoadResult =
  | { ok: true; state: TalentSiteDashboardState }
  | { ok: false; code: string; error: string };

const TalentSiteDashboardLoadContext = createContext<TalentSiteDashboardLoadResult | null>(
  null,
);

export function TalentSiteDashboardProvider({
  initialLoad,
  children,
}: {
  initialLoad: TalentSiteDashboardLoadResult;
  children: ReactNode;
}) {
  return (
    <TalentSiteDashboardLoadContext.Provider value={initialLoad}>
      {children}
    </TalentSiteDashboardLoadContext.Provider>
  );
}

export function useTalentSiteDashboardInitialLoad(): TalentSiteDashboardLoadResult | null {
  return useContext(TalentSiteDashboardLoadContext);
}
