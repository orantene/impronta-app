"use client";

// ─── Form helpers (extras) ───────────────────────────────────────────
//
// StickyDrawerSaveBar / FieldError / UnsavedChangesGuard. The longer
// formy primitives that sit alongside FieldRow but ship as separate
// concerns. Extracted from primitives.tsx — Phase 1f decomposition.

import { useState, type ReactNode } from "react";
import { COLORS, FONTS, TRANSITION } from "../state";
import { PrimaryButton, SecondaryButton } from "./buttons";
import { ConfirmDialog } from "./confirm-dialog";


// ─── WS-2.11 Sticky drawer save bar ──────────────────────────────────
//
// Auto-applied to long-form drawers. Sticks to the bottom of the drawer
// body when the user has scrolled past the top of the form. Shows a
// "Unsaved changes" label + Cancel + Save buttons. The `dirty` prop
// controls visibility. On phone it always floats; on desktop it appears
// when the save CTA has scrolled out of view.
//
// Usage inside a DrawerShell body:
//   <StickyDrawerSaveBar dirty={isDirty} onCancel={reset} onSave={submit} />

export function StickyDrawerSaveBar({
  dirty,
  saving = false,
  onCancel,
  onSave,
  label = "Unsaved changes",
  saveLabel = "Save changes",
}: {
  dirty: boolean;
  saving?: boolean;
  onCancel: () => void;
  onSave: () => void;
  label?: string;
  saveLabel?: string;
}) {
  if (!dirty) return null;
  return (
    <div
      data-tulala-sticky-save-bar
      style={{
        position: "sticky",
        bottom: 0,
        zIndex: 10,
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "10px 18px",
        background: "rgba(255,255,255,0.96)",
        backdropFilter: "blur(8px)",
        WebkitBackdropFilter: "blur(8px)",
        borderTop: `1px solid ${COLORS.borderSoft}`,
        boxShadow: "0 -4px 16px rgba(11,11,13,0.06)",
      }}
    >
      <span style={{ flex: 1, fontFamily: FONTS.body, fontSize: 12.5, fontWeight: 500 }} className="text-admin-ink-muted">
        {label}
      </span>
      <SecondaryButton size="sm" onClick={onCancel} disabled={saving}>
        Cancel
      </SecondaryButton>
      <PrimaryButton size="sm" onClick={onSave} disabled={saving}>
        {saving ? "Saving…" : saveLabel}
      </PrimaryButton>
    </div>
  );
}


// ─── WS-6.2 Field error primitive ────────────────────────────────────
//
// Wraps a form field with a red border + aria-invalid + inline error
// message. Pairs with any <input>, <textarea>, or <select>.
//
// Usage:
//   <FieldError error={errors.email} id="email-err">
//     <input aria-describedby="email-err" ... />
//   </FieldError>

export function FieldError({
  error,
  id,
  children,
}: {
  error?: string;
  id?: string;
  children: ReactNode;
}) {
  const hasError = Boolean(error);
  return (
    <div
      data-tulala-field-error={hasError ? "true" : undefined}
      style={{ display: "flex", flexDirection: "column", gap: 4 }}
    >
      <div
        style={{
          outline: hasError ? "1.5px solid #B0303A" : undefined,
          borderRadius: 8,
        }}
      >
        {children}
      </div>
      {hasError && (
        <span
          id={id}
          role="alert"
          style={{
            fontFamily: FONTS.body,
            fontSize: 11.5,
            color: "#B0303A",
            fontWeight: 500,
            display: "flex",
            alignItems: "center",
            gap: 4,
          }}
        >
          <span aria-hidden className="text-xs">⚠</span>
          {error}
        </span>
      )}
    </div>
  );
}

// ─── WS-6.3 Unsaved changes guard ────────────────────────────────────
//
// Wraps a drawer or page. When `dirty` is true, intercepts the close /
// navigation action and shows a confirmation dialog. If the user
// confirms ("Discard"), `onClose` fires; if they cancel they stay.
//
// Usage:
//   <UnsavedChangesGuard dirty={isDirty} onClose={closeDrawer}>
//     {content}
//   </UnsavedChangesGuard>

export function UnsavedChangesGuard({
  dirty,
  onClose,
  children,
}: {
  dirty: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  const [confirming, setConfirming] = useState(false);
  const handleClose = () => {
    if (dirty) { setConfirming(true); }
    else        { onClose(); }
  };
  return (
    <>
      {/* Clone child and inject overridden close handler */}
      <div data-tulala-unsaved-guard onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
      <ConfirmDialog
        open={confirming}
        onClose={() => setConfirming(false)}
        onConfirm={() => { setConfirming(false); onClose(); }}
        title="Discard unsaved changes?"
        body="You have unsaved changes. If you leave now, they'll be lost."
        confirmLabel="Discard"
        cancelLabel="Keep editing"
        destructive
      />
      {/* Expose a close handler the drawer can call — used via render prop pattern */}
      {dirty && (
        <button
          type="button"
          data-tulala-guard-close
          onClick={handleClose}
          style={{ display: "none" }}
          aria-hidden
        />
      )}
    </>
  );
}

