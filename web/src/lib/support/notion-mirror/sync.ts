/**
 * Pure sync helpers for Support → Notion mirror (TUL-45).
 * Selection + due check live here so cron route stays thin and testable.
 */

import {
  createNotionMirrorPage,
  updateNotionMirrorPage,
  type NotionFetch,
  type NotionWriteResult,
} from "./client";
import type { NotionMirrorConfig } from "./config";
import {
  buildNotionMirrorProperties,
  type NotionMirrorTicketInput,
} from "./payload";

export const NOTION_MIRROR_SCAN_LIMIT = 200;
export const NOTION_MIRROR_BATCH_LIMIT = 50;

export type MirrorTicketRow = NotionMirrorTicketInput & {
  notionPageId: string | null;
  notionSyncedAt: string | null;
};

export function needsNotionMirror(row: {
  notionPageId: string | null;
  notionSyncedAt: string | null;
  updatedAt: string;
}): boolean {
  if (!row.notionPageId) return true;
  if (!row.notionSyncedAt) return true;
  return Date.parse(row.updatedAt) > Date.parse(row.notionSyncedAt);
}

export function pickDueMirrorTickets(
  rows: MirrorTicketRow[],
  limit = NOTION_MIRROR_BATCH_LIMIT,
): MirrorTicketRow[] {
  return rows.filter(needsNotionMirror).slice(0, limit);
}

export function mapDbMirrorRow(raw: Record<string, unknown>): MirrorTicketRow | null {
  const id = typeof raw.id === "string" ? raw.id : null;
  if (!id) return null;
  const ticketNumber =
    typeof raw.ticket_number === "number"
      ? raw.ticket_number
      : typeof raw.ticket_number === "string"
        ? Number(raw.ticket_number)
        : NaN;
  if (!Number.isFinite(ticketNumber)) return null;
  return {
    id,
    ticketNumber,
    subject: typeof raw.subject === "string" ? raw.subject : "",
    status: typeof raw.status === "string" ? raw.status : "open",
    category: typeof raw.category === "string" ? raw.category : null,
    createdAt:
      typeof raw.created_at === "string" ? raw.created_at : new Date(0).toISOString(),
    updatedAt:
      typeof raw.updated_at === "string" ? raw.updated_at : new Date(0).toISOString(),
    notionPageId: typeof raw.notion_page_id === "string" ? raw.notion_page_id : null,
    notionSyncedAt:
      typeof raw.notion_synced_at === "string" ? raw.notion_synced_at : null,
  };
}

export async function pushTicketToNotion(opts: {
  config: NotionMirrorConfig;
  ticket: MirrorTicketRow;
  fetchImpl?: NotionFetch;
}): Promise<NotionWriteResult> {
  const properties = buildNotionMirrorProperties(opts.ticket);
  if (opts.ticket.notionPageId) {
    return updateNotionMirrorPage({
      config: opts.config,
      pageId: opts.ticket.notionPageId,
      properties,
      fetchImpl: opts.fetchImpl,
    });
  }
  return createNotionMirrorPage({
    config: opts.config,
    properties,
    fetchImpl: opts.fetchImpl,
  });
}

/** Cron Authorization: Bearer check (same contract as other /api/cron routes). */
export function checkCronBearer(
  authorizationHeader: string | null | undefined,
  expectedSecret: string,
): { authorized: boolean } {
  if (!authorizationHeader || !expectedSecret) return { authorized: false };
  const token = authorizationHeader.replace(/^Bearer\s+/i, "");
  if (token === authorizationHeader) return { authorized: false };
  return { authorized: token === expectedSecret };
}
