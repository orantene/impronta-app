"use client";

/**
 * Selection-chip button primitives.
 *
 * `ChipBtn` was extracted out of `selection-layer.tsx` (size ratchet) so the
 * unlock affordance below could join the section chip without pushing that
 * file past its budget. Same component, same styling contract, no behaviour
 * change — it is now importable by anything that draws a chip row.
 */

import React, { useState } from "react";
import { Lock, LockOpen } from "lucide-react";

import { CHROME } from "./kit/tokens";
import { useEditorLocale } from "./use-editor-locale";

export function ChipBtn({
  children,
  style,
  disabled,
  onClick,
  danger,
  light = false,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  danger?: boolean;
  /** Light floating toolbar — inverts the idle/hover ink for a white surface. */
  light?: boolean;
}) {
  const [hovered, setHovered] = useState(false);
  // NOTE: these win over anything in `style` (spread first), so a light chip
  // MUST pass `light` — a colour on `style` alone gets overwritten and the
  // icon renders white-on-white.
  const idleColor = light ? CHROME.muted : "rgba(255,255,255,0.72)";
  const hoverColor = light ? CHROME.ink : "white";
  const dangerColor = light ? "#b91c1c" : "#ff8b8b";
  const hoverBg = light ? "rgba(24,24,27,0.05)" : "rgba(255,255,255,0.10)";
  const dangerBg = light ? "rgba(196,61,61,0.10)" : "rgba(196,61,61,0.20)";
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
      style={{
        ...style,
        background: hovered ? (danger ? dangerBg : hoverBg) : "transparent",
        color: hovered ? (danger ? dangerColor : hoverColor) : idleColor,
        opacity: disabled ? 0.4 : 1,
      }}
      {...rest}
    >
      {children}
    </button>
  );
}

/**
 * Unlock design — the ONE visible door between a curated section and blocks.
 *
 * The eject/uneject bridge existed but lived only in the canvas right-click
 * menu, so operators never found it and read the builder as two products: a
 * curated section you may recolour, and freeform blocks you may actually
 * build with. This puts the door in the chip, in plain language.
 *
 * Relock is destructive — it hard-clears the section's children, so every
 * block added or edited since unlocking is gone — and it used to fire on a
 * single click with no warning. It now takes the SAME inline confirm the
 * chip's Remove button uses (red commit + Cancel, in place, no modal).
 * Unlock itself is safe and reversible, so it stays one click.
 */
export function SectionUnlockChipButton({
  light,
  disabled,
  btnStyle,
  isUnlocked,
  blockedReason = null,
  onUnlock,
  onRelock,
}: {
  light: boolean;
  disabled: boolean;
  btnStyle: React.CSSProperties;
  isUnlocked: boolean;
  /**
   * Set when this section type derives no layers, so unlocking it would report
   * success and leave the operator with a BLANK section. The door still shows
   * (hiding it would read as "this build has no unlock") but it is disabled and
   * says why, instead of being a silent no-op.
   */
  blockedReason?: string | null;
  onUnlock: () => void;
  onRelock: () => void;
}) {
  const { t } = useEditorLocale();
  const [confirming, setConfirming] = useState(false);

  if (blockedReason && !isUnlocked) {
    return (
      <ChipBtn
        light={light}
        style={btnStyle}
        disabled
        aria-label={t("Nothing to unlock yet")}
        data-selection-section-action="unlock-unavailable"
        title={`${t("Nothing to unlock yet")}: ${t(blockedReason)}`}
      >
        <LockOpen size={13} strokeWidth={2} aria-hidden />
      </ChipBtn>
    );
  }

  if (isUnlocked && confirming) {
    return (
      <>
        <button
          type="button"
          disabled={disabled}
          onClick={() => {
            setConfirming(false);
            onRelock();
          }}
          title={t(
            "Relocking restores the original design and discards the blocks you added or edited here.",
          )}
          data-selection-section-action="relock-confirm"
          style={{
            display: "inline-flex",
            alignItems: "center",
            padding: "0 12px",
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: "0.02em",
            background: "rgba(196,61,61,0.90)",
            color: "white",
            border: "none",
            borderLeft: `1px solid ${CHROME.line}`,
            cursor: "pointer",
          }}
        >
          {t("Relock and discard added blocks?")}
        </button>
        <button
          type="button"
          onClick={() => setConfirming(false)}
          style={{
            display: "inline-flex",
            alignItems: "center",
            padding: "0 12px",
            fontSize: 11,
            fontWeight: 500,
            background: "transparent",
            color: light ? CHROME.muted : "rgba(255,255,255,0.72)",
            border: "none",
            borderLeft: `1px solid ${CHROME.line}`,
            cursor: "pointer",
          }}
        >
          {t("Cancel")}
        </button>
      </>
    );
  }

  const label = isUnlocked ? t("Relock design") : t("Unlock design");
  return (
    <ChipBtn
      light={light}
      style={btnStyle}
      disabled={disabled}
      onClick={() => (isUnlocked ? setConfirming(true) : onUnlock())}
      aria-label={label}
      data-selection-section-action={isUnlocked ? "relock" : "unlock"}
      title={`${label}: ${
        isUnlocked
          ? t("Restore the original design")
          : t("Edit every element in this section individually")
      }`}
    >
      {isUnlocked ? (
        <Lock size={13} strokeWidth={2} aria-hidden />
      ) : (
        <LockOpen size={13} strokeWidth={2} aria-hidden />
      )}
    </ChipBtn>
  );
}

/**
 * Text action (Edit Content / Design) — the left half of every chip row.
 * Extracted alongside ChipBtn so the section and block chips share ONE source
 * of truth for chip height, padding, ink and hover, instead of drifting.
 */
export function ChipTextAction({
  label,
  disabled,
  onClick,
  active = false,
  light = false,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
  active?: boolean;
  light?: boolean;
}) {
  // `label` stays the English key (icon selection below compares against it);
  // only the rendered text goes through t().
  const { t } = useEditorLocale();
  const lightActive = light && active;
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="inline-flex h-full cursor-pointer items-center gap-[5px] border-none px-[10px] text-[11px] font-semibold tracking-[-0.01em] transition-colors disabled:cursor-not-allowed disabled:opacity-50"
      style={{
        background: lightActive
          ? "rgba(124, 58, 237, 0.10)"
          : "transparent",
        color: lightActive
          ? CHROME.accent
          : light
            ? CHROME.ink
            : "rgba(255,255,255,0.88)",
        borderLeft: light
          ? `1px solid ${CHROME.line}`
          : "1px solid rgba(255,255,255,0.10)",
        boxShadow: lightActive
          ? `inset 0 0 0 1px ${CHROME.accent}`
          : undefined,
        borderRadius: lightActive ? 6 : undefined,
        margin: lightActive ? "4px 2px" : undefined,
      }}
      onMouseEnter={(e) => {
        if (disabled || lightActive) return;
        e.currentTarget.style.background = light
          ? CHROME.paper2
          : "rgba(255,255,255,0.08)";
      }}
      onMouseLeave={(e) => {
        if (lightActive) return;
        e.currentTarget.style.background = "transparent";
      }}
    >
      {light && label === "Edit Content" ? (
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <path d="M12 20h9" />
          <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
        </svg>
      ) : null}
      {light && label === "Design" ? (
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <path d="m12 19 7-7-7-7-7 7 7 7Z" />
          <path d="M18.5 5.5 12 12" />
        </svg>
      ) : null}
      {t(label)}
    </button>
  );
}
