"use client";

/**
 * drawer-parts.tsx — the house async-state machine, rendered once.
 *
 * The pattern (idle | saving | saved | stub | error, with the amber "saved in
 * DB only, Stripe not connected" state) is copied from the Catalog drawer's
 * Pricing tab. It is not decoration: STUB is a genuinely different outcome from
 * SAVED, and a UI that paints them the same tells the operator a discount is
 * live at Stripe when it exists only in our database. Both discount drawers use
 * this so neither can quietly lose the amber branch.
 */

import { HQ, F, FD } from "../_tokens";

export type DrawerSaveState = "idle" | "saving" | "saved" | "stub" | "error";

export function SubHeading({ text }: { text: string }) {
  return (
    <div
      style={{
        fontFamily: FD,
        fontSize: 10.5,
        fontWeight: 600,
        letterSpacing: 1,
        textTransform: "uppercase",
        color: HQ.inkMuted,
        borderTop: `1px solid ${HQ.borderSoft}`,
        paddingTop: 12,
      }}
    >
      {text}
    </div>
  );
}

export function FieldRow({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>{children}</div>
  );
}

export function DrawerSaveBar({
  state,
  dirty,
  canSave,
  message,
  saveLabel,
  savingLabel,
  savedLabel,
  cancelLabel,
  onSave,
  onCancel,
}: {
  state: DrawerSaveState;
  /** Drives the Save button's filled-vs-outline styling, per house pattern. */
  dirty: boolean;
  canSave: boolean;
  message: string | null;
  saveLabel: string;
  savingLabel: string;
  savedLabel: string;
  cancelLabel: string;
  onSave: () => void;
  onCancel: () => void;
}) {
  const emphasise = dirty && canSave;
  return (
    <div
      style={{
        display: "flex",
        gap: 10,
        alignItems: "center",
        flexWrap: "wrap",
        borderTop: `1px solid ${HQ.borderSoft}`,
        paddingTop: 14,
        marginTop: 4,
      }}
    >
      <button
        type="button"
        onClick={onSave}
        disabled={!canSave}
        style={{
          background: emphasise ? HQ.ink : "transparent",
          color: emphasise ? HQ.bg : HQ.inkMuted,
          border: emphasise ? "none" : `1px solid ${HQ.borderHover}`,
          borderRadius: 6,
          padding: "9px 16px",
          fontFamily: F,
          fontSize: 12.5,
          fontWeight: 600,
          cursor: canSave ? "pointer" : "default",
        }}
      >
        {state === "saving" ? savingLabel : saveLabel}
      </button>
      <button
        type="button"
        onClick={onCancel}
        disabled={state === "saving"}
        style={{
          background: "transparent",
          color: HQ.inkMuted,
          border: `1px solid ${HQ.borderSoft}`,
          borderRadius: 6,
          padding: "9px 14px",
          fontFamily: F,
          fontSize: 12.5,
          cursor: state === "saving" ? "default" : "pointer",
        }}
      >
        {cancelLabel}
      </button>
      {state === "saved" && (
        <span style={{ fontSize: 11.5, color: HQ.green }}>✓ {savedLabel}</span>
      )}
      {state === "stub" && (
        <span style={{ fontSize: 11.5, color: HQ.amber, lineHeight: 1.4 }}>
          ✓ {message}
        </span>
      )}
      {state === "error" && (
        <span style={{ fontSize: 11.5, color: HQ.red, lineHeight: 1.4 }}>
          {message}
        </span>
      )}
    </div>
  );
}

/** Confirm-inline destructive action: one click arms, the second commits. */
export function ConfirmInline({
  state,
  idleLabel,
  busyLabel,
  confirmLabel,
  cancelLabel,
  errorLabel,
  onArm,
  onConfirm,
  onCancel,
}: {
  state: "idle" | "confirm" | "busy" | "error";
  idleLabel: string;
  busyLabel: string;
  confirmLabel: string;
  cancelLabel: string;
  errorLabel: string;
  onArm: () => void;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  if (state === "confirm") {
    return (
      <div style={{ display: "flex", gap: 4 }}>
        <button
          type="button"
          onClick={onConfirm}
          style={{
            background: HQ.red,
            color: HQ.bg,
            border: "none",
            borderRadius: 4,
            padding: "3px 8px",
            fontSize: 10.5,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          {confirmLabel}
        </button>
        <button
          type="button"
          onClick={onCancel}
          style={{
            background: "transparent",
            color: HQ.inkMuted,
            border: `1px solid ${HQ.borderSoft}`,
            borderRadius: 4,
            padding: "3px 8px",
            fontSize: 10.5,
            cursor: "pointer",
          }}
        >
          {cancelLabel}
        </button>
      </div>
    );
  }
  return (
    <button
      type="button"
      onClick={onArm}
      disabled={state === "busy"}
      style={{
        background: "transparent",
        color: state === "error" ? HQ.red : HQ.inkDim,
        border: "none",
        padding: 0,
        fontSize: 11,
        cursor: state === "busy" ? "wait" : "pointer",
        textDecoration: "underline",
      }}
    >
      {state === "busy" ? busyLabel : state === "error" ? errorLabel : idleLabel}
    </button>
  );
}
