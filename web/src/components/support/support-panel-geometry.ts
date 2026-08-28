import type { CSSProperties } from "react";
import { COLORS } from "./support-tokens";

export function supportPanelContainerStyle(compactSheet: boolean): CSSProperties {
  if (compactSheet) {
    return {
      position: "fixed",
      inset: 0,
      width: "100vw",
      height: "100dvh",
      borderRadius: 0,
      background: COLORS.surface,
      zIndex: 390,
      display: "flex",
      flexDirection: "column",
      overflow: "hidden",
      paddingBottom: "env(safe-area-inset-bottom)",
    };
  }
  return {
    position: "fixed",
    right: "max(16px, env(safe-area-inset-right))",
    top: "50%",
    transform: "translateY(-50%)",
    width: "min(408px, calc(100vw - 32px))",
    height: "min(720px, calc(100dvh - 48px))",
    borderRadius: 20,
    background: COLORS.card,
    boxShadow: "0 18px 48px rgba(11,11,13,0.16)",
    border: `1px solid ${COLORS.border}`,
    zIndex: 390,
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
  };
}
