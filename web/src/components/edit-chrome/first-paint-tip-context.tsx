"use client";

/**
 * Mount fact: the first-paint orientation tip sits at the bottom of the canvas
 * instead of under the top bar. Talent mounts provide it so the tip never
 * covers the talent's site header; every other surface keeps the default.
 */
import { createContext, useContext, type CSSProperties, type ReactNode } from "react";
import { CANVAS_FLOATING_BAR } from "./kit/tokens";
import { DEFAULT_WORKSPACE_CANVAS_MODE, resolveCanvasHudLeftInset } from "./workspace-layout";

const FirstPaintTipBottomContext = createContext(false);

export function FirstPaintTipBottomProvider({ children }: { children: ReactNode }) {
  return <FirstPaintTipBottomContext.Provider value>{children}</FirstPaintTipBottomContext.Provider>;
}

export function useFirstPaintTipAtBottom(): boolean {
  return useContext(FirstPaintTipBottomContext);
}

const BASE = "pointer-events-none fixed z-[88] flex items-center gap-2 rounded-full px-3.5 py-2";

/** Default: centred under the top bar. Talent: bottom-left above the zoom controls. */
export function useFirstPaintTipPlacement(navigatorOpen: boolean, navigatorWidth: number): {
  className: string;
  style: CSSProperties;
} {
  if (!useFirstPaintTipAtBottom()) {
    return { className: `${BASE} left-1/2 -translate-x-1/2`, style: { top: 70 } };
  }
  return {
    className: BASE,
    style: {
      bottom: CANVAS_FLOATING_BAR.bottom + CANVAS_FLOATING_BAR.height + 8,
      left: resolveCanvasHudLeftInset({ mode: DEFAULT_WORKSPACE_CANVAS_MODE, navigatorOpen, navigatorWidth }),
    },
  };
}
