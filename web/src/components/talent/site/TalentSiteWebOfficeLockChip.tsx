"use client";

/**
 * TalentSiteWebOfficeLockChip — the ONE lock-chip UI for a talent personal-
 * site control gated on a `TalentSiteCapability`. Read the capability record
 * (never `surfaceKind` or the plan key) at the call site and render this chip
 * in place of the control when the capability is false.
 *
 * Phase 1 mounts this on: the builder's Add control (insert gallery), the SEO
 * tab, "Add page" in the page switcher, and the custom-domain panel. All four
 * read the SAME `TalentSiteCapabilities` record; only the label + click target
 * differ, so this single component is the whole contract.
 *
 * Clicking the chip calls `onUpgrade` when provided (Phase 4 wires this to the
 * Web Office upgrade dialog); otherwise it is a plain, non-interactive badge —
 * so this component never needs to know whether the upgrade dialog exists yet.
 *
 * 44px minimum touch target when interactive (`onUpgrade` set), per the
 * mobile-target rule for talent surfaces (works at 390px).
 */

import { CHROME } from "@/components/edit-chrome/kit/tokens";

const COPY = {
  en: "Web Office",
  es: "Web Office",
} as const;

/** "Web Office" is an English brand name, kept the same in Spanish copy
 *  (mirrors `siteCapabilityDeniedMessage`, which always names it in English
 *  even inside Spanish sentences). Exported so callers needing the plain
 *  label (not the chip) stay in sync with this one string. */
export function talentSiteLockedUpsellLabel(): string {
  return COPY.en;
}

export type TalentSiteWebOfficeLockChipProps = {
  locale?: string | null;
  /** Called on click/Enter/Space. Omit to render a plain, non-interactive badge. */
  onUpgrade?: () => void;
  /** Accessible label override (defaults to a generic "Web Office feature, locked" phrase). */
  ariaLabel?: string;
  style?: React.CSSProperties;
};

export function TalentSiteWebOfficeLockChip({
  locale,
  onUpgrade,
  ariaLabel,
  style,
}: TalentSiteWebOfficeLockChipProps) {
  const label = talentSiteLockedUpsellLabel();
  const fallbackAriaLabel =
    locale === "es"
      ? `${label}, función bloqueada`
      : `${label}, locked feature`;

  const chip = (
    <span
      aria-hidden={Boolean(onUpgrade)}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        padding: "3px 9px",
        borderRadius: 999,
        background: CHROME.controlFill,
        border: `1px solid ${CHROME.controlBorder}`,
        color: CHROME.muted,
        fontSize: 10.5,
        fontWeight: 700,
        letterSpacing: 0.3,
        textTransform: "uppercase",
        whiteSpace: "nowrap",
      }}
    >
      <span aria-hidden style={{ fontSize: 11 }}>🔒</span>
      {label}
    </span>
  );

  if (!onUpgrade) {
    return (
      <span
        data-talent-site-lock-chip=""
        role="img"
        aria-label={ariaLabel ?? fallbackAriaLabel}
        style={style}
      >
        {chip}
      </span>
    );
  }

  return (
    <button
      type="button"
      data-talent-site-lock-chip=""
      onClick={onUpgrade}
      aria-label={ariaLabel ?? fallbackAriaLabel}
      style={{
        display: "inline-flex",
        alignItems: "center",
        minHeight: 44,
        minWidth: 44,
        padding: "0 6px",
        border: "none",
        background: "transparent",
        cursor: "pointer",
        ...style,
      }}
    >
      {chip}
    </button>
  );
}
