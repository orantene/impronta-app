"use client";

/**
 * Support Guide P0 — Helper mode wrapper.
 *
 * Wrap any explainable control with `<GuideHotspot id="...">`. When Helper
 * mode is off this renders its children unchanged — zero visual or
 * behavioral difference, so it's safe to leave wrapped in production.
 * When Helper mode is on it draws the dotted outline from the mockups and
 * intercepts the click to open that node's article in the Guide tab
 * instead of firing the wrapped control.
 *
 * P0 dogfoods this on the support drawer's own controls (Home tab —
 * SupportPanelHome.tsx) rather than a workspace page, to avoid touching
 * files under active redesign elsewhere (Messages). Wrapping a real
 * workspace page's controls is the mechanically identical next step; see
 * the P0 PR description for what's deferred.
 */
import { COLORS } from "./support-tokens";

export function GuideHotspot({
  id,
  active,
  onOpen,
  children,
}: {
  id: string;
  active: boolean;
  onOpen: (nodeId: string) => void;
  children: React.ReactNode;
}) {
  if (!active) return <>{children}</>;
  return (
    <span
      style={{ position: "relative", display: "flex", width: "100%" }}
      data-guide-hotspot={id}
    >
      <span style={{ pointerEvents: "none", width: "100%" }}>{children}</span>
      <button
        type="button"
        onClick={() => onOpen(id)}
        aria-label={id}
        style={{
          position: "absolute",
          inset: -3,
          border: `2px dashed ${COLORS.royal}`,
          borderRadius: 10,
          background: COLORS.royalSoft,
          cursor: "pointer",
        }}
      />
    </span>
  );
}
