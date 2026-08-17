"use client";

/**
 * StylePanel · the FOOTER ROW (mockup annotation F).
 *
 * "Copy style · Paste · Reset…" — three equal buttons on one line at the foot
 * of the panel, which is where a panel's whole-object actions belong and where
 * an operator looks for them.
 *
 * WHAT THIS REPLACES: a "Reuse style" card holding Copy / Paste / Clear as
 * three uppercase micro-buttons, and — separately, below it, unrelated to it —
 * a bare grey text link reading "Reset desktop style". The card and the link
 * were the same category of action wearing two different control languages,
 * which is the audit's 20-patterns finding in miniature.
 *
 * ── RESET IS DESTRUCTIVE AND LOOKS IT (D6) ────────────────────────────────
 * The trailing ellipsis is a promise: the first click ARMS, it does not fire.
 * The armed state is a different button — danger tone, different words — not
 * an in-place text swap on an otherwise identical control, which is the trap
 * P2 was sent to fix and which this component must not quietly reintroduce.
 * The arm/disarm state and the timeout live in the panel (`confirmThenRunReset`
 * and its `resetConfirmTarget`), so this component stays presentational and the
 * confirm cannot end up implemented twice.
 */

import type { CSSProperties } from "react";

import { FIELD_KIT } from "../field-kit";
import { useInspectorT } from "../kit/use-inspector-t";

export interface StyleFooterRowProps {
  onCopy: () => void;
  onPaste: () => void;
  /** Arms on the first call, runs on the second. Owned by the panel. */
  onReset: () => void;
  /** Something is on the style clipboard. */
  canPaste: boolean;
  /** There is anything to reset at the current scope. */
  canReset: boolean;
  /** The panel's `resetConfirmTarget === "node"`. */
  resetArmed: boolean;
  /** Where a paste would come from, e.g. "Card / desktop". */
  clipboardLabel: string | null;
  /** The device a copy/reset acts on. */
  scopeLabel: string;
}

const DANGER = "#b42323";

function buttonStyle(opts: {
  enabled: boolean;
  danger?: boolean;
  armed?: boolean;
}): CSSProperties {
  return {
    flex: 1,
    minWidth: 0,
    textAlign: "center",
    fontSize: FIELD_KIT.font.value,
    fontWeight: FIELD_KIT.weight.label,
    padding: "8px 6px",
    borderRadius: FIELD_KIT.radius.chip,
    background: opts.armed ? DANGER : FIELD_KIT.surface,
    border: `1px solid ${
      opts.armed
        ? DANGER
        : opts.danger && opts.enabled
          ? "rgba(180,35,35,0.28)"
          : FIELD_KIT.border
    }`,
    color: opts.armed
      ? "#fff"
      : !opts.enabled
        ? FIELD_KIT.mutedSoft
        : opts.danger
          ? DANGER
          : FIELD_KIT.ink,
    cursor: opts.enabled ? "pointer" : "not-allowed",
    transition: `background-color ${FIELD_KIT.motion.duration}ms ${FIELD_KIT.motion.easing}`,
  };
}

export function StyleFooterRow({
  onCopy,
  onPaste,
  onReset,
  canPaste,
  canReset,
  resetArmed,
  clipboardLabel,
  scopeLabel,
}: StyleFooterRowProps) {
  const { t } = useInspectorT();

  return (
    <div
      className="flex flex-col gap-1.5 border-t pt-3"
      data-builder-node-style-footer=""
      style={{ borderColor: FIELD_KIT.border }}
    >
      <div style={{ display: "flex", gap: FIELD_KIT.gap.control }}>
        <button
          type="button"
          data-builder-node-style-copy=""
          onClick={onCopy}
          style={buttonStyle({ enabled: true })}
        >
          {t("Copy style")}
        </button>
        <button
          type="button"
          data-builder-node-style-paste=""
          onClick={onPaste}
          disabled={!canPaste}
          style={buttonStyle({ enabled: canPaste })}
        >
          {t("Paste")}
        </button>
        <button
          type="button"
          data-builder-node-style-reset=""
          onClick={onReset}
          disabled={!canReset}
          aria-label={
            resetArmed
              ? t("Confirm reset")
              : t("Reset this block's {device} style").replace("{device}", t(scopeLabel))
          }
          style={buttonStyle({
            enabled: canReset,
            danger: true,
            armed: resetArmed && canReset,
          })}
        >
          {resetArmed && canReset ? t("Confirm reset") : t("Reset…")}
        </button>
      </div>
      <span
        style={{
          fontSize: FIELD_KIT.font.caption,
          fontWeight: FIELD_KIT.weight.caption,
          color: FIELD_KIT.muted,
        }}
      >
        {clipboardLabel
          ? t("Copied: {source}").replace("{source}", clipboardLabel)
          : t("Copy once, paste anywhere.")}
      </span>
    </div>
  );
}
