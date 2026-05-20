"use client";

// ─── FAB primitives ──────────────────────────────────────────────────
//
// AutoSaveIndicator / FloatingFab / FabAction / FabHost / useFab.
// Extracted from primitives.tsx — Phase 1f decomposition.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { COLORS, FONTS, TRANSITION } from "../state";
import { useViewport } from "./hooks";

// ─── AutoSaveIndicator (#6) ───────────────────────────────────────────
// Displays "Saved X ago" or "Saving…" inside forms.

export function AutoSaveIndicator({ savedAt }: { savedAt: Date | null }) {
  const [label, setLabel] = useState("");

  useEffect(() => {
    if (!savedAt) return;
    const update = () => {
      const s = Math.round((Date.now() - savedAt.getTime()) / 1000);
      if (s < 5) setLabel("Saved just now");
      else if (s < 60) setLabel(`Saved ${s}s ago`);
      else setLabel(`Saved ${Math.round(s / 60)}m ago`);
    };
    update();
    const id = setInterval(update, 10_000);
    return () => clearInterval(id);
  }, [savedAt]);

  if (!savedAt) return null;
  return (
    <span
      aria-live="polite"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        fontSize: 11.5,
        color: COLORS.inkMuted,
        fontFamily: FONTS.body,
      }}
    >
      <svg width={11} height={11} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
        <path d="M20 6 9 17l-5-5" />
      </svg>
      {label}
    </span>
  );
}

// ─── FloatingFab (#4) ─────────────────────────────────────────────────
// Fixed "+ New" action button for mobile list pages.

export type FabAction = {
  id: string;
  label: string;
  sub?: string;
  emoji?: string;
  onClick: () => void;
};

export function FloatingFab({
  label,
  onClick,
  actions,
}: {
  label: string;
  onClick?: () => void;
  /** When provided, tapping the FAB opens a bottom-sheet with these actions
   *  instead of firing onClick. Each action becomes a row in the sheet. */
  actions?: FabAction[];
}) {
  const [open, setOpen] = useState(false);
  const hasMenu = actions && actions.length > 0;
  const handleTap = () => {
    if (hasMenu) setOpen(true);
    else onClick?.();
  };
  return (
    <>
      <button
        type="button"
        aria-label={label}
        onClick={handleTap}
        data-tulala-fab
        style={{
          position: "fixed",
          right: 18,
          bottom: "calc(72px + env(safe-area-inset-bottom, 0px))",
          width: 52,
          height: 52,
          borderRadius: "50%",
          background: COLORS.accent,
          color: "#fff",
          border: "none",
          cursor: "pointer",
          display: "none",
          alignItems: "center",
          justifyContent: "center",
          boxShadow: "0 6px 24px rgba(15,79,62,0.36)",
          zIndex: 400,
          transition: `transform ${TRANSITION.micro}, box-shadow ${TRANSITION.micro}`,
          fontFamily: FONTS.body,
          fontSize: 24,
          fontWeight: 300,
          lineHeight: 1,
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.transform = "scale(1.06)";
          e.currentTarget.style.boxShadow = "0 8px 28px rgba(15,79,62,0.44)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.transform = "scale(1)";
          e.currentTarget.style.boxShadow = "0 6px 24px rgba(15,79,62,0.36)";
        }}
      >
        +
      </button>
      {hasMenu && open && (
        <div
          onClick={() => setOpen(false)}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 500,
            background: "rgba(11,11,13,0.42)",
            backdropFilter: "blur(6px)",
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "center",
            fontFamily: FONTS.body,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "100%",
              maxWidth: 480,
              background: "#fff",
              borderRadius: "20px 20px 0 0",
              padding: "16px 16px max(20px, env(safe-area-inset-bottom)) 16px",
              boxShadow: "0 -10px 40px -8px rgba(11,11,13,0.30)",
            }}
          >
            <div style={{ width: 36, height: 4, borderRadius: 999, background: "rgba(11,11,13,0.10)", margin: "0 auto 14px", }} />
            <div style={{
              fontSize: 11, fontWeight: 600, letterSpacing: 0.4, textTransform: "uppercase", marginBottom: 10, paddingLeft: 4 }} className="text-admin-ink-muted">
              Create new
            </div>
            <div className="flex flex-col gap-1">
              {actions!.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => { setOpen(false); a.onClick(); }}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    padding: "12px 14px",
                    borderRadius: 12,
                    border: "none",
                    background: "transparent",
                    cursor: "pointer",
                    textAlign: "left",
                    fontFamily: FONTS.body,
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(11,11,13,0.04)")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                >
                  <span
                    aria-hidden
                    style={{
                      width: 36, height: 36, borderRadius: 10,
                      background: COLORS.surface,
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 18, flexShrink: 0,
                    }}
                  >
                    {a.emoji ?? "+"}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="text-admin-ink text-sm font-semibold">{a.label}</div>
                    {a.sub && (
                      <div style={{ fontSize: 11.5, marginTop: 1, lineHeight: 1.35 }} className="text-admin-ink-muted">{a.sub}</div>
                    )}
                  </div>
                  <span aria-hidden style={{ color: COLORS.inkDim, fontSize: 16 }}>›</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}


// ─── WS-2.7 FAB host + single-FAB system ─────────────────────────────
//
// Only one FAB may be visible at a time across the whole page.
// `<FabHost>` is a React context provider. Each `<FloatingFab>` must be
// wrapped inside a `<FabHost>`; on phone viewport the first registered
// FAB wins (others are suppressed). On tablet/desktop FABs are hidden
// entirely (the topbar Quick-create menu handles creates).
//
// Usage:
//   <FabHost>
//     <OverviewPage />  ← renders <FloatingFab> somewhere inside
//   </FabHost>

type FabSlot = { id: string; label: string; onClick: () => void };

const FabContext = createContext<{
  register:   (slot: FabSlot) => void;
  unregister: (id: string) => void;
  active:     FabSlot | null;
} | null>(null);

export function FabHost({ children }: { children: ReactNode }) {
  const [slots, setSlots] = useState<FabSlot[]>([]);
  const register   = useCallback((s: FabSlot) => setSlots((p) => [...p.filter((x) => x.id !== s.id), s]), []);
  const unregister = useCallback((id: string)  => setSlots((p) => p.filter((x) => x.id !== id)), []);
  const active     = slots[0] ?? null;
  const viewport   = useViewport();
  return (
    <FabContext.Provider value={{ register, unregister, active }}>
      {children}
      {/* Render the single active FAB — phone only */}
      {active && viewport === "phone" && (
        <button
          type="button"
          aria-label={active.label}
          onClick={active.onClick}
          data-tulala-fab
          style={{
            position: "fixed",
            right: 18,
            bottom: "calc(72px + env(safe-area-inset-bottom, 0px))",
            width: 52,
            height: 52,
            borderRadius: "50%",
            background: COLORS.accent,
            color: "#fff",
            border: "none",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            boxShadow: "0 6px 24px rgba(15,79,62,0.36)",
            zIndex: 400,
            fontFamily: FONTS.body,
            fontSize: 24,
            fontWeight: 300,
            lineHeight: 1,
            transition: `transform ${TRANSITION.micro}, box-shadow ${TRANSITION.micro}`,
          }}
          onMouseEnter={(e) => { e.currentTarget.style.transform = "scale(1.06)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.transform = "scale(1)"; }}
        >
          +
        </button>
      )}
    </FabContext.Provider>
  );
}

/** Register a FAB slot inside a `<FabHost>`. Phone-only; no-ops on tablet+. */
export function useFab(id: string, label: string, onClick: () => void) {
  const ctx = useContext(FabContext);
  // Keep the latest onClick in a ref so the registered handler is always
  // up-to-date without re-registering on every render.
  const onClickRef = useRef(onClick);
  useEffect(() => { onClickRef.current = onClick; });
  useEffect(() => {
    if (!ctx) return;
    ctx.register({ id, label, onClick: () => onClickRef.current() });
    return () => ctx.unregister(id);
  }, [ctx, id, label]);
}
