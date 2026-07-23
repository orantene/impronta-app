"use client";

// Slide-over shell for the intercepted field editor. Renders a fixed backdrop
// + right-aligned panel over the Catalog Map list. Closing (backdrop click,
// Esc, or the × button) calls router.back(), which unwinds the intercepted
// /catalog/[fieldKey] entry and returns to /catalog with the list intact.

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useT } from "@/i18n/use-t";

const HQ = {
  panel: "#0E0E11",
  border: "rgba(255,255,255,0.10)",
  ink: "#F5F2EB",
  inkMuted: "rgba(245,242,235,0.62)",
} as const;

export function FieldDrawer({
  children,
  title,
  ariaLabel,
}: {
  children: React.ReactNode;
  title?: string;
  ariaLabel?: string;
}) {
  const t = useT();
  const router = useRouter();
  const resolvedTitle = title ?? t("dashboard.platform.catalog.drawerFieldEditor");

  // Close on Escape + lock the underlying page scroll while open.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") router.back();
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [router]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={ariaLabel ?? resolvedTitle}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 60,
        display: "flex",
        justifyContent: "flex-end",
      }}
    >
      <style>{`
        @keyframes hq-drawer-fade { from { opacity: 0 } to { opacity: 1 } }
        @keyframes hq-drawer-slide { from { transform: translateX(24px); opacity: 0 } to { transform: translateX(0); opacity: 1 } }
      `}</style>

      {/* Backdrop */}
      <button
        type="button"
        aria-label={t("dashboard.platform.catalog.drawerClose")}
        onClick={() => router.back()}
        style={{
          position: "absolute",
          inset: 0,
          border: "none",
          padding: 0,
          margin: 0,
          background: "rgba(0,0,0,0.55)",
          backdropFilter: "blur(2px)",
          cursor: "pointer",
          animation: "hq-drawer-fade .18s ease",
        }}
      />

      {/* Panel */}
      <div
        style={{
          position: "relative",
          width: "min(980px, 100vw)",
          height: "100%",
          background: HQ.panel,
          borderLeft: `1px solid ${HQ.border}`,
          boxShadow: "-24px 0 60px rgba(0,0,0,0.5)",
          display: "flex",
          flexDirection: "column",
          animation: "hq-drawer-slide .22s cubic-bezier(0.22, 1, 0.36, 1)",
        }}
      >
        {/* Sticky drawer header with close affordance */}
        <div
          style={{
            position: "sticky",
            top: 0,
            zIndex: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            padding: "12px 16px",
            background: HQ.panel,
            borderBottom: `1px solid ${HQ.border}`,
          }}
        >
          <span
            style={{
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: 0.5,
              textTransform: "uppercase",
              color: HQ.inkMuted,
              fontFamily: '"Inter", system-ui, sans-serif',
            }}
          >
            {resolvedTitle}
          </span>
          <button
            type="button"
            onClick={() => router.back()}
            aria-label={t("dashboard.platform.catalog.drawerCloseEditor")}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              fontSize: 12,
              fontWeight: 600,
              color: HQ.inkMuted,
              background: "transparent",
              border: `1px solid ${HQ.border}`,
              borderRadius: 7,
              padding: "5px 10px",
              cursor: "pointer",
              fontFamily: '"Inter", system-ui, sans-serif',
            }}
          >
            {t("dashboard.platform.catalog.drawerCloseLabel")}
          </button>
        </div>

        {/* Scrollable content */}
        <div style={{ flex: 1, overflowY: "auto", padding: "16px 20px 40px" }}>
          {children}
        </div>
      </div>
    </div>
  );
}
