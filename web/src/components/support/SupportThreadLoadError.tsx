"use client";

import { useT } from "@/i18n/use-t";
import { COLORS } from "./support-tokens";

/** The thread read failed: say so and offer a retry that does not need a close and reopen. */
export function SupportThreadLoadError({ onRetry }: { onRetry: () => void }) {
  const t = useT();
  return (
    <div role="alert" style={{ padding: 24, fontSize: 13, color: COLORS.inkMuted }}>
      <div>{t("dashboard.adminSupport.threadLoadFailed")}</div>
      <button
        type="button"
        onClick={onRetry}
        style={{
          marginTop: 12,
          minHeight: 44,
          padding: "0 16px",
          border: `1px solid ${COLORS.border}`,
          background: COLORS.card,
          color: COLORS.ink,
          borderRadius: 10,
          fontSize: 13,
          fontWeight: 600,
          cursor: "pointer",
        }}
      >
        {t("dashboard.adminSupport.threadLoadRetry")}
      </button>
    </div>
  );
}
