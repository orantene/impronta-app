"use client";

import { useT } from "@/i18n/use-t";

export function LiveSharePill({ onStop }: { onStop: () => void }) {
  const t = useT();
  return (
    <div
      role="status"
      style={{
        position: "fixed",
        top: 12,
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 4000,
        background: "#C23A3A",
        color: "#fff",
        borderRadius: 999,
        padding: "8px 14px",
        fontSize: 13,
        fontWeight: 600,
        display: "flex",
        alignItems: "center",
        gap: 10,
        boxShadow: "0 8px 24px rgba(0,0,0,0.25)",
        pointerEvents: "auto",
      }}
    >
      <span>{t("dashboard.adminSupport.sharingScreen")}</span>
      <button
        type="button"
        onClick={onStop}
        style={{
          border: "1px solid rgba(255,255,255,0.45)",
          background: "transparent",
          color: "#fff",
          borderRadius: 999,
          padding: "3px 10px",
          fontSize: 12,
          fontWeight: 600,
          cursor: "pointer",
        }}
      >
        {t("dashboard.adminSupport.stopSharing")}
      </button>
    </div>
  );
}

export function LiveGuidanceOverlay({
  pointer,
  ring,
  ink,
}: {
  pointer: { xPct: number; yPct: number } | null;
  ring: { xPct: number; yPct: number } | null;
  ink: Array<{ xPct: number; yPct: number }> | null;
}) {
  return (
    <div
      aria-hidden
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 3990,
        pointerEvents: "none",
      }}
    >
      {pointer ? (
        <div
          style={{
            position: "absolute",
            left: `${pointer.xPct * 100}%`,
            top: `${pointer.yPct * 100}%`,
            transform: "translate(-20%, -10%)",
            color: "#C23A3A",
            fontSize: 12,
            fontWeight: 700,
          }}
        >
          Support
        </div>
      ) : null}
      {ring ? (
        <div
          style={{
            position: "absolute",
            left: `${ring.xPct * 100}%`,
            top: `${ring.yPct * 100}%`,
            width: 36,
            height: 36,
            marginLeft: -18,
            marginTop: -18,
            border: "2px solid #C23A3A",
            borderRadius: "50%",
          }}
        />
      ) : null}
      {ink && ink.length > 1 ? (
        <svg width="100%" height="100%" style={{ position: "absolute", inset: 0 }}>
          <polyline
            fill="none"
            stroke="#C23A3A"
            strokeWidth="3"
            points={ink.map((p) => `${p.xPct * 100}%,${p.yPct * 100}%`).join(" ")}
          />
        </svg>
      ) : null}
    </div>
  );
}
