"use client";

import { createContext, useContext, type ReactNode } from "react";

const TalentStudioFlagContext = createContext(false);

export function TalentStudioFlagProvider({
  enabled,
  children,
}: {
  enabled: boolean;
  children: ReactNode;
}) {
  return (
    <TalentStudioFlagContext.Provider value={enabled}>
      <div className="contents" data-talent-studio-v2={enabled ? "1" : "0"}>
        {children}
      </div>
    </TalentStudioFlagContext.Provider>
  );
}

export function useTalentStudioV2(): boolean {
  return useContext(TalentStudioFlagContext);
}
