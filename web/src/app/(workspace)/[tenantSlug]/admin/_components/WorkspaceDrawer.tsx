"use client";

import { useEffect, type ReactNode } from "react";

export function WorkspaceDrawer({
  open,
  onClose,
  width = 440,
  children,
}: {
  open: boolean;
  onClose: () => void;
  width?: number;
  children: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open) return null;

  return (
    <>
      <style>{`
        @keyframes ws-backdrop { from { opacity: 0 } to { opacity: 1 } }
        @keyframes ws-slide-in { from { transform: translateX(100%) } to { transform: translateX(0) } }
      `}</style>
      <div
        onClick={onClose}
        aria-hidden="true"
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 200,
          background: "rgba(11,11,13,0.38)",
          backdropFilter: "blur(2px)",
          animation: "ws-backdrop 0.18s ease",
        }}
      />
      <div
        role="dialog"
        aria-modal="true"
        style={{
          position: "fixed",
          top: 0,
          right: 0,
          bottom: 0,
          width,
          maxWidth: "95vw",
          zIndex: 201,
          background: "#FAFAF7",
          boxShadow: "-8px 0 48px -8px rgba(11,11,13,0.22)",
          overflowY: "auto",
          animation: "ws-slide-in 0.22s cubic-bezier(0.25, 0.46, 0.45, 0.94)",
        }}
      >
        {children}
      </div>
    </>
  );
}
