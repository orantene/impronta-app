/**
 * TUL-645 (PM option c): "Report to Tulala" from a talent-page chat opens a Support Desk
 * ticket. Chats stay private by default, so the ticket carries REFERENCES only (inquiry id,
 * tenant id, talent code) and never a copy of the conversation; staff open the thread
 * through the normal, audited desk tools. PURE.
 */

export const CHAT_REPORT_NOTE_MAX = 1000;

export type ChatReportInput = {
  inquiryId: string;
  tenantId: string | null;
  talentProfileCode?: string | null;
  note?: string | null;
  locale?: "en" | "es";
};

export function buildChatReportTicket(input: ChatReportInput): {
  subject: string;
  body: string;
  metadata: Record<string, unknown>;
} {
  const note = (input.note ?? "").trim().slice(0, CHAT_REPORT_NOTE_MAX);
  const es = input.locale === "es";
  return {
    subject: es ? "Reporte desde un chat" : "Report from a chat",
    body:
      note ||
      (es
        ? "Un visitante reportó esta conversación a Tulala."
        : "A visitor reported this conversation to Tulala."),
    // References only: no message text is copied into the ticket.
    metadata: {
      source: "chat_report",
      inquiry_id: input.inquiryId,
      tenant_id: input.tenantId,
      talent_profile_code: input.talentProfileCode ?? null,
      locale: es ? "es" : "en",
    },
  };
}
