import type { InboxRow } from "./types";

/** Fields the inbox search box matches. Order is also snippet preference. */
function inboxSearchFields(row: InboxRow): string[] {
  return [
    row.lastMessagePreview,
    row.subject,
    row.contactName,
    row.contactEmail ?? "",
    row.contactPhone ?? "",
    ...row.recordChips.map((chip) => chip.label),
  ].filter((value) => value.length > 0);
}

export function inboxRowMatches(row: InboxRow, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (needle === "") return true;
  return inboxSearchFields(row).some((field) => field.toLowerCase().includes(needle));
}

export function filterInboxRows(rows: readonly InboxRow[], query: string): InboxRow[] {
  if (query.trim() === "") return [...rows];
  return rows.filter((row) => inboxRowMatches(row, query));
}

export function inboxMatchSnippet(row: InboxRow, query: string): string | null {
  const needle = query.trim();
  if (needle === "") return null;
  for (const field of inboxSearchFields(row)) {
    if (field.toLowerCase().includes(needle.toLowerCase())) {
      return clipSnippet(field, needle);
    }
  }
  return null;
}

export function clipSnippet(body: string, query: string): string {
  const at = body.toLowerCase().indexOf(query.toLowerCase());
  if (at < 0) return body.slice(0, 140);
  const start = Math.max(0, at - 40);
  return `${start > 0 ? "…" : ""}${body.slice(start, start + 140)}`;
}
