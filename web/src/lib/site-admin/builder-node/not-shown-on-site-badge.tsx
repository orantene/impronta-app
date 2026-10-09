/**
 * TUL-124 — canvas badge for blocks the live site drops.
 * Editor-only; callers must gate on `editorPreview` (or equivalent).
 */
import type { CSSProperties, ReactNode } from "react";

import { notShownOnSiteLabel } from "./not-shown-on-site";

const BADGE_STYLE: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  margin: "0 0 10px",
  padding: "4px 10px",
  borderRadius: 999,
  border: "1px solid rgba(24,24,27,0.18)",
  background: "rgba(24,24,27,0.06)",
  color: "rgba(24,24,27,0.72)",
  fontSize: 11,
  fontWeight: 600,
  letterSpacing: "0.02em",
  lineHeight: 1.3,
};

export function NotShownOnSiteBadge({
  locale,
  style,
}: {
  locale?: string | null;
  style?: CSSProperties;
}): ReactNode {
  return (
    <span data-not-shown-on-site="" role="status" style={{ ...BADGE_STYLE, ...style }}>
      {notShownOnSiteLabel(locale)}
    </span>
  );
}
