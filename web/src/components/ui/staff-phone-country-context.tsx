"use client";

import { createContext, useContext, type ReactNode } from "react";

/** Workspace (or Talent/Profesional) country ISO2, server-loaded; the staff phone field defaults to it. */
const StaffPhoneCountryContext = createContext<string | null>(null);

export function StaffPhoneCountryProvider({ country, children }: { country: string | null; children: ReactNode }) {
  return <StaffPhoneCountryContext.Provider value={country}>{children}</StaffPhoneCountryContext.Provider>;
}

export function useStaffPhoneCountry(): string | null {
  return useContext(StaffPhoneCountryContext);
}
