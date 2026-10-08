/**
 * Pure sync helpers for Support → Notion mirror (TUL-45).
 * Selection + due check live here so cron route stays thin and testable.
 */

import { timingSafeEqual } from "node:crypto";

import {
  createNotionMirrorPage,
  findNotionMirrorPageByTicketId,
  findNotionMirrorPageByTicketNumber,
  updateNotionMirrorPage,
  type NotionFetch,
  type NotionWriteResult,
} from "./client";
import type { NotionMirrorConfig } from "./config";
import {
  buildNotionMirrorProperties,
  deskLinkForTicket,
  type NotionMirrorTicketInput,
} from "./payload";

/** Max tickets processed per cron run (SQL limit + Notion rate budget). */
export const NOTION_MIRROR_BATCH_LIMIT = 50;

/** Soft wall-clock budget so a slow Notion run cannot blow the cron window. */
export const NOTION_MIRROR_ELAPSED_BUDGET_MS = 45_000;

/**
 * Only permanent Notion client errors advance fail_count / dead-letter.
 * 429 and 5xx are transient (outage / rate limit) and must not burn the
 * 5-strike budget; network/timeouts have no status and also do not count.
 */
export function isPermanentNotionMirrorFailure(status: number): boolean {
  return status >= 400 && status < 500 && status !== 429;
}

/** True when the cron batch should stop before the next ticket. */
export function shouldStopForElapsedBudget(
  startedAtMs: number,
  nowMs: number,
  budgetMs = NOTION_MIRROR_ELAPSED_BUDGET_MS,
): boolean {
  return nowMs - startedAtMs >= budgetMs;
}

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

/** @deprecated Prefer SQL due list; kept for unit tests of the due predicate. */
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

/**
 * Push one ticket. Before create, query Notion by ticket id (Desk link) then
 * ticket number so a lost writeback cannot spawn a duplicate page.
 */
export async function pushTicketToNotion(opts: {
  config: NotionMirrorConfig;
  ticket: MirrorTicketRow;
  fetchImpl?: NotionFetch;
}): Promise<NotionWriteResult> {
  const properties = buildNotionMirrorProperties(opts.ticket);
  let pageId = opts.ticket.notionPageId;

  if (!pageId) {
    const byId = await findNotionMirrorPageByTicketId({
      config: opts.config,
      deskLink: deskLinkForTicket(opts.ticket.id),
      fetchImpl: opts.fetchImpl,
    });
    if (!byId.ok) return byId;
    pageId = byId.pageId;

    if (!pageId) {
      const byNumber = await findNotionMirrorPageByTicketNumber({
        config: opts.config,
        ticketNumber: opts.ticket.ticketNumber,
        fetchImpl: opts.fetchImpl,
      });
      if (!byNumber.ok) return byNumber;
      pageId = byNumber.pageId;
    }
  }

  if (pageId) {
    return updateNotionMirrorPage({
      config: opts.config,
      pageId,
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

function sameSecret(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/** Cron Authorization: Bearer check (constant-time; matches other /api/cron routes). */
export function checkCronBearer(
  authorizationHeader: string | null | undefined,
  expectedSecret: string,
): { authorized: boolean } {
  if (!authorizationHeader || !expectedSecret) return { authorized: false };
  const match = /^Bearer\s+(.+)$/i.exec(authorizationHeader);
  if (!match) return { authorized: false };
  return { authorized: sameSecret(match[1], expectedSecret) };
}
