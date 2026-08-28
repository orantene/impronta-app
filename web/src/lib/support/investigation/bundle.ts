import type { SupportMessageRow, SupportTicketRow } from "../support-types";

function hashPii(value: string): string {
  let h = 0;
  for (let i = 0; i < value.length; i += 1) h = (h * 31 + value.charCodeAt(i)) | 0;
  return `h${(h >>> 0).toString(16).padStart(8, "0")}`;
}

function redact(text: string): string {
  return text
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, (m) => `[email:${hashPii(m)}]`)
    .replace(/\+?\d[\d\s().-]{8,}\d/g, (m) => `[phone:${hashPii(m.replace(/\D/g, ""))}]`);
}

export type InvestigationInputs = {
  ticket: SupportTicketRow;
  messages: SupportMessageRow[];
  tenantSlug: string | null;
  diagnostics: Record<string, unknown> | null;
  auditEvents: Array<{ action: string; summary: string | null; createdAt: string }>;
};

export function renderInvestigationMarkdown(input: InvestigationInputs): string {
  const t = input.ticket;
  const severity = t.priority === "urgent" || t.priority === "high" ? t.priority : "normal";
  const front = [
    "---",
    `ticket: INV-${t.ticketNumber}`,
    `tenant: ${input.tenantSlug ?? "none"}`,
    `severity: ${severity}`,
    `category: ${t.category ?? "General"}`,
    `status: ${t.status}`,
    `replay:`,
    `sentry: ${typeof input.diagnostics?.sentry_link === "string" ? input.diagnostics.sentry_link : ""}`,
    "---",
    "",
  ].join("\n");

  const report = input.messages
    .filter((m) => m.messageKind !== "note")
    .map((m) => `**${m.authorKind}** (${m.createdAt}): ${redact(m.body)}`)
    .join("\n\n");

  const diag = input.diagnostics
    ? "```json\n" + redact(JSON.stringify(input.diagnostics, null, 2)) + "\n```"
    : "_none_";
  const audit = input.auditEvents
    .map((e) => `- ${e.createdAt} ${e.action}${e.summary ? ` - ${redact(e.summary)}` : ""}`)
    .join("\n") || "_none_";

  return [
    front,
    "## Report",
    report || "_empty_",
    "",
    "## Diagnostics",
    diag,
    "",
    "## Audit trail",
    audit,
    "",
    "## Environment",
    `- surface: ${t.surface}`,
    `- handled_by: ${t.handledBy}`,
    "",
    "## Findings",
    t.rootCause ?? "",
    "",
    "## Long-term fix",
    t.longTermFix ?? "",
    "",
  ].join("\n");
}

export function parseInvestigationFindings(markdown: string): {
  rootCause: string | null;
  longTermFix: string | null;
} {
  const findings = markdown.split(/^## Findings\s*$/m)[1]?.split(/^## /m)[0] ?? "";
  const fix = markdown.split(/^## Long-term fix\s*$/m)[1]?.split(/^## /m)[0] ?? "";
  return {
    rootCause: findings.trim() || null,
    longTermFix: fix.trim() || null,
  };
}
