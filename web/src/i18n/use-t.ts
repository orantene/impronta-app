"use client";
import { createTranslator } from "./messages";
import { useDashboardLocale } from "./use-dashboard-locale";

export function useT() {
  return createTranslator(useDashboardLocale());
}
