"use client";

import { useT } from "@/i18n/use-t";
import { COLORS } from "./support-tokens";

/** The thread read failed: say so and offer a retry that does not need a close and reopen. `code` (PostgREST/RLS code or "no_row") is exposed as data-load-error-code so QA can read the cause without a console. */
export function SupportThreadLoadError({ onRetry, code }: { onRetry: () => void; code?: string }) {
  const t = useT();
  return (
    <div role="alert" data-load-error-code={code} style={{ padding: 24, fontSize: 13, color: COLORS.inkMuted }}>
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
