"use client";

import { useT } from "@/i18n/use-t";
import { COLORS } from "./support-tokens";

/** TUL-621: a finished thread (resolved or closed) is never typed into again; offer a fresh question. */
export function showNewQuestionStrip(status: string | null | undefined): boolean {
  return status === "resolved" || status === "closed";
}

/**
 * TUL-621 rework: an OPEN ticket the AI just answered (no person involved yet) also offers a new
 * question, so an unrelated second question is not typed into the first ticket.
 */
export function showNewQuestionStripForThread(
  ticket: { status?: string | null; handledBy?: string | null; escalatedAt?: string | null } | null | undefined,
  lastAuthorKind: string | null | undefined,
): boolean {
  if (!ticket) return false;
  if (showNewQuestionStrip(ticket.status)) return true;
  return (
    ticket.status === "open" &&
    lastAuthorKind === "ai" &&
    ticket.handledBy !== "human" &&
    !ticket.escalatedAt
  );
}

export function NewQuestionStrip({
  show,
  onNewQuestion,
}: {
  show: boolean;
  onNewQuestion: () => void;
}) {
  const t = useT();
  if (!show) return null;
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 10,
        padding: "8px 12px",
        borderTop: `1px solid ${COLORS.borderSoft}`,
        fontSize: 12,
        color: COLORS.inkMuted,
      }}
    >
      <span>{t("dashboard.adminSupport.newQuestionHint")}</span>
      <button
        type="button"
        onClick={onNewQuestion}
        style={{
          border: "none",
          background: COLORS.fill,
          color: "#fff",
          borderRadius: 999,
          padding: "8px 14px",
          fontSize: 12,
          fontWeight: 600,
          cursor: "pointer",
          flexShrink: 0,
        }}
      >
        {t("dashboard.adminSupport.newQuestion")}
      </button>
    </div>
  );
}
