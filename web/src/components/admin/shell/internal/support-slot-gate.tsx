"use client";

import { createContext, useContext, type ReactNode } from "react";

import { useAdminShell } from "./state";

/** Slot published by each shell client so the launcher can live anywhere. */
export const SupportSlotContext = createContext<ReactNode>(null);

/**
 * Support launcher mount point.
 *
 * This used to live inside AdminShellContent, i.e. inside AdminShellRoot. On
 * the TALENT shell, ConditionalAdminShellRoot returns null for canonical
 * paths, so the launcher silently vanished on /talent/today and every other
 * canonical talent route. Rendering it as a sibling of the shell root — still
 * inside AdminShellProvider, so shell state (including the drawer-open check)
 * is available — makes it route- and surface-agnostic.
 */
export function SupportSlotGate() {
  const { workspaceSupportEnabled } = useAdminShell();
  const supportSlot = useContext(SupportSlotContext);
  if (!workspaceSupportEnabled) return null;
  return <>{supportSlot}</>;
}

