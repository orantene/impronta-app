"use client";

/**
 * Whether the builder inspector may offer the AI translate button (PR 7).
 * The action is talent-owner only, so the talent builder mounts provide
 * `true`; every other surface reads the default `false`. A mount fact, not a
 * surface-literal branch in the editor core.
 */
import { createContext, useContext, type ReactNode } from "react";

const TalentAiTranslateContext = createContext(false);

export function TalentAiTranslateProvider({ children }: { children: ReactNode }) {
  return <TalentAiTranslateContext.Provider value>{children}</TalentAiTranslateContext.Provider>;
}

export function useTalentAiTranslateEnabled(): boolean {
  return useContext(TalentAiTranslateContext);
}
