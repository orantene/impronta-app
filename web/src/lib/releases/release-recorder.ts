/**
 * Release recorder: pure helpers (TUL-1389). No I/O.
 *
 * `scripts/release-recorder.mts` runs after the production pointer advances
 * (`npm run release:record`). It lists the commits between the last recorded
 * production commit and the new one, pulls every PR number out of their
 * messages, matches those PRs to Tickets & Tasks rows through the ticket's PR
 * URL field, and writes one "Production release" row into the Notion
 * Releases database. Everything that decides WHAT gets written lives here so
 * it is unit-tested; the script only does git + HTTP.
 *
 * Release IDs are Cancún calendar dates: `2026.10.21`, then `2026.10.21.2`,
 * `2026.10.21.3` for further releases on the same day.
 */

export const RELEASE_TIME_ZONE = "America/Cancun";

/** Notion rich_text objects hold at most 2000 characters each. */
export const NOTION_TEXT_CHUNK = 2000;
/** Notion accepts at most 100 rich_text objects / block children per request. */
export const NOTION_ARRAY_MAX = 100;

/** `YYYY.MM.DD` for an instant, in Cancún time. */
export function releaseDatePrefix(at: Date, timeZone = RELEASE_TIME_ZONE): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(at);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}.${get("month")}.${get("day")}`;
}

/** ISO date (`YYYY-MM-DD`) matching a `YYYY.MM.DD` prefix. */
export function prefixToIsoDate(prefix: string): string {
  return prefix.replace(/\./g, "-");
}

/**
 * Next free release ID for a date prefix, given the IDs already recorded.
 * `2026.10.21` is taken first; later releases that day get `.2`, `.3`, ...
 */
export function nextReleaseId(prefix: string, existingIds: readonly string[]): string {
  const sameDay = existingIds.filter((id) => id === prefix || id.startsWith(`${prefix}.`));
  if (sameDay.length === 0) return prefix;
  let max = 1;
  for (const id of sameDay) {
    const rest = id.slice(prefix.length);
    if (rest === "") continue;
    const n = Number(rest.slice(1));
    if (Number.isInteger(n) && n > max) max = n;
  }
  return `${prefix}.${max + 1}`;
}

/**
 * Every PR number referenced in commit messages: `(#4107)` on squash merges,
 * and the `#2621 #2645 ...` lists integration batches carry. Sorted, unique.
 */
export function extractPrNumbers(messages: readonly string[]): number[] {
  const seen = new Set<number>();
  for (const message of messages) {
    for (const match of message.matchAll(/(?:^|[^\w&/])#(\d{2,6})\b/g)) {
      seen.add(Number(match[1]));
    }
  }
  return [...seen].sort((a, b) => a - b);
}

/** PR numbers in a ticket's PR field (one or more GitHub pull URLs, or `#N`). */
export function prNumbersFromTicketField(value: string | null | undefined): number[] {
  if (!value) return [];
  const seen = new Set<number>();
  for (const match of value.matchAll(/(?:\/pull\/|#)(\d{2,6})\b/g)) {
    seen.add(Number(match[1]));
  }
  return [...seen];
}

export type TicketPrRow = {
  id: string;
  prField: string | null;
  /** Page ids already in the ticket's Release relation. */
  releaseIds: readonly string[];
};

/** Tickets whose PR field names at least one PR in this release. */
export function matchTicketsToPrs(
  tickets: readonly TicketPrRow[],
  prNumbers: readonly number[],
): TicketPrRow[] {
  const wanted = new Set(prNumbers);
  return tickets.filter((t) => prNumbersFromTicketField(t.prField).some((n) => wanted.has(n)));
}

/** Release relation for a ticket after adding this release (no duplicates). */
export function withRelease(existing: readonly string[], releasePageId: string): string[] {
  const norm = (id: string) => id.replace(/-/g, "");
  if (existing.some((id) => norm(id) === norm(releasePageId))) return [...existing];
  return [...existing, releasePageId];
}

/** Split text into Notion rich_text objects (2000 chars each, 100 max). */
export function toRichText(text: string): Array<{ type: "text"; text: { content: string } }> {
  const out: Array<{ type: "text"; text: { content: string } }> = [];
  for (let i = 0; i < text.length && out.length < NOTION_ARRAY_MAX; i += NOTION_TEXT_CHUNK) {
    out.push({ type: "text", text: { content: text.slice(i, i + NOTION_TEXT_CHUNK) } });
  }
  return out;
}

export function chunk<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

export type ReleaseRowInput = {
  releaseId: string;
  isoDate: string;
  commit: string;
  prNumbers: readonly number[];
};

/** Notion properties for a new "Production release" row in Releases. */
export function buildReleaseProperties(input: ReleaseRowInput): Record<string, unknown> {
  const prs = input.prNumbers.map((n) => `#${n}`).join(" ");
  return {
    Release: { title: toRichText(`Production release ${input.releaseId}`) },
    Status: { status: { name: "Draft" } },
    Kind: { select: { name: "Production release" } },
    "Release ID": { rich_text: toRichText(input.releaseId) },
    "Release date": { date: { start: input.isoDate } },
    Tier: { select: { name: "0 Internal" } },
    Commit: { rich_text: toRichText(input.commit) },
    PRs: { rich_text: toRichText(prs || "none") },
    Owner: { select: { name: "PM (Claude)" } },
  };
}

export type CommitLine = { sha: string; subject: string };

/** Page body: one bullet per commit on the first-parent chain, newest first. */
export function buildReleaseBodyBlocks(
  commits: readonly CommitLine[],
  ticketCount: number,
): Array<Record<string, unknown>> {
  const paragraph = (text: string) => ({
    object: "block",
    type: "paragraph",
    paragraph: { rich_text: toRichText(text) },
  });
  const blocks: Array<Record<string, unknown>> = [
    paragraph(
      `Recorded automatically by npm run release:record. ${commits.length} commits, ${ticketCount} linked tickets. Internal record: the public changelog is written in a Weekly changelog entry.`,
    ),
    {
      object: "block",
      type: "heading_2",
      heading_2: { rich_text: toRichText("Commits") },
    },
  ];
  for (const c of commits) {
    blocks.push({
      object: "block",
      type: "bulleted_list_item",
      bulleted_list_item: { rich_text: toRichText(`${c.sha.slice(0, 10)} ${c.subject}`) },
    });
  }
  return blocks;
}
