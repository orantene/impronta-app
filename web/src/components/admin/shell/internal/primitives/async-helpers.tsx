"use client";

// ─── Async helpers ───────────────────────────────────────────────────
//
// useOptimisticMutation / useOnlineStatus / AsyncButton.
// Extracted from primitives.tsx — Phase 1f decomposition.

import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { COLORS, FONTS, RADIUS, TRANSITION } from "../state";

// ─── WS-6.4 Optimistic UI rollback recipe ────────────────────────────────────
//
// `useOptimisticMutation` wraps a server mutation with:
//   1. Immediate optimistic state application (no wait for server)
//   2. Automatic rollback on failure (reverts to the pre-mutation value)
//   3. `status` for visual feedback ("idle" | "pending" | "error")
//   4. `retry` to re-run the last mutation without re-applying optimistic state
//
// Usage:
//   const { display, status, mutate } = useOptimisticMutation({
//     value: someState,
//     onCommit: async (next) => {
//       await api.update(next);    // the real server call
//       setState(next);            // confirm after server agrees
//     },
//   });
//
//   // To mutate:
//   await mutate(newValue);        // display = newValue immediately
//                                  // on error: display rolls back to previous value
//
// Design decisions:
//   - Does NOT call `setState` on rollback — caller's external state
//     (the `value` prop) is the source of truth after rollback, since
//     the failed `onCommit` never called setState.
//   - The hook keeps its own `display` so rollback is instant (no
//     waiting for a parent re-render).
//   - `retry` calls `onCommit` again with the last attempted `next`
//     value, without re-triggering the optimistic update (display is
//     already showing the optimistic value from the failed attempt).
// ─────────────────────────────────────────────────────────────────────────────

export type OptimisticStatus = "idle" | "pending" | "error";

export function useOptimisticMutation<T>({
  value,
  onCommit,
  onRollback,
}: {
  /** Current confirmed value — what we show when idle or after rollback. */
  value: T;
  /**
   * Async function that persists `next` to the server.
   * If it throws, the mutation rolls back.
   */
  onCommit: (next: T) => Promise<void>;
  /**
   * Optional callback when a rollback happens — e.g. to fire an error
   * toast or re-sync derived state.
   */
  onRollback?: (previous: T, error: unknown) => void;
}): {
  /** The value to render — optimistic during pending, rolled-back after error. */
  display:  T;
  /** "idle" → "pending" → "idle" (success) or "error" (failure). */
  status:   OptimisticStatus;
  /** Apply an optimistic update and fire `onCommit`. */
  mutate:   (next: T) => Promise<void>;
  /** Re-run the last failed mutation (no-op if status isn't "error"). */
  retry:    () => Promise<void>;
} {
  const [display,  setDisplay]  = useState<T>(value);
  const [status,   setStatus]   = useState<OptimisticStatus>("idle");
  const lastAttempt = useRef<T>(value);

  // Keep display in sync with confirmed value when idle (avoids stale display
  // if parent updates the prop through an out-of-band channel).
  useEffect(() => {
    if (status === "idle") setDisplay(value);
  }, [value, status]);

  const run = useCallback(async (next: T, isRetry: boolean) => {
    const previous = isRetry ? value : display;
    if (!isRetry) {
      lastAttempt.current = next;
      setDisplay(next);      // optimistic
    }
    setStatus("pending");
    try {
      await onCommit(next);
      setStatus("idle");
    } catch (err) {
      setDisplay(previous);  // rollback
      setStatus("error");
      onRollback?.(previous, err);
    }
  }, [value, display, onCommit, onRollback]);

  const mutate = useCallback((next: T) => run(next, false), [run]);

  const retry = useCallback(() => {
    if (status !== "error") return Promise.resolve();
    return run(lastAttempt.current, true);
  }, [status, run]);

  return { display, status, mutate, retry };
}


// ─── WS-6.5 Offline status hook ───────────────────────────────────────────────
//
// `useOnlineStatus` — reactive boolean, true when navigator.onLine.
// Pair with the existing `<OfflineBanner>` in the workspace shell.
// ─────────────────────────────────────────────────────────────────────────────

export function useOnlineStatus(): boolean {
  const [online, setOnline] = useState(
    typeof navigator !== "undefined" ? navigator.onLine : true
  );
  useEffect(() => {
    const up   = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener("online",  up);
    window.addEventListener("offline", down);
    return () => {
      window.removeEventListener("online",  up);
      window.removeEventListener("offline", down);
    };
  }, []);
  return online;
}


// ─── WS-6.7 AsyncButton — sending / failed / retry ───────────────────────────
//
// Drop-in replacement for a button that fires an async action.
// Shows a spinner while pending, a retry state on failure.
//
// Usage:
//   <AsyncButton onClick={async () => { await api.save(data); }}>
//     Save changes
//   </AsyncButton>
// ─────────────────────────────────────────────────────────────────────────────

export function AsyncButton({
  onClick,
  children,
  retryLabel = "Retry",
  pendingLabel,
  errorLabel,
  disabled = false,
  variant = "primary",
  style: styleProp,
}: {
  onClick: () => Promise<void>;
  children: ReactNode;
  retryLabel?:   string;
  pendingLabel?: string;
  errorLabel?:   string;
  disabled?:     boolean;
  variant?:      "primary" | "secondary" | "danger";
  style?:        CSSProperties;
}) {
  const [state, setState] = useState<"idle" | "pending" | "error">("idle");

  const BASE: CSSProperties = {
    display:       "inline-flex",
    alignItems:    "center",
    gap:           6,
    padding:       "8px 16px",
    borderRadius:  RADIUS.md,
    border:        "none",
    fontFamily:    FONTS.body,
    fontSize:      13,
    fontWeight:    600,
    cursor:        (disabled || state === "pending") ? "not-allowed" : "pointer",
    opacity:       (disabled || state === "pending") ? 0.65 : 1,
    transition:    `background ${TRANSITION.sm}, opacity ${TRANSITION.sm}`,
    ...styleProp,
  };

  const VARIANTS: Record<string, CSSProperties> = {
    primary:   { background: COLORS.accent, color: "#fff" },
    secondary: { background: COLORS.card,   color: COLORS.ink, border: `1px solid ${COLORS.border}` },
    danger:    { background: "#dc2626",      color: "#fff" },
  };

  const ERROR_VARIANT: CSSProperties = { background: "#7f1d1d", color: "#fff" };

  const handleClick = async () => {
    if (disabled || state === "pending") return;
    setState("pending");
    try {
      await onClick();
      setState("idle");
    } catch {
      setState("error");
    }
  };

  const label =
    state === "pending" ? (pendingLabel ?? children) :
    state === "error"   ? (errorLabel   ?? retryLabel)
                        : children;

  const variantStyle = state === "error" ? ERROR_VARIANT : VARIANTS[variant];

  return (
    <button
      type="button"
      disabled={disabled || state === "pending"}
      onClick={handleClick}
      style={{ ...BASE, ...variantStyle }}
    >
      {state === "pending" && (
        <span
          aria-hidden
          style={{
            width: 12, height: 12,
            border: "2px solid rgba(255,255,255,0.35)",
            borderTopColor: "#fff",
            borderRadius: "50%",
            animation: "tulalaSpinBtn .6s linear infinite",
            flexShrink: 0,
          }}
        />
      )}
      {state === "error" && <span aria-hidden>↺</span>}
      <span>{label}</span>
      <style>{`@keyframes tulalaSpinBtn { to { transform: rotate(360deg); } }`}</style>
    </button>
  );
}

