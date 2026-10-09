/**
 * Minimal Notion Pages API client for the one-way Support mirror.
 * Create + update + idempotent lookup. No Notion reads that drive Tulala writes
 * beyond create-dedupe.
 */

import type { NotionMirrorConfig } from "./config";
import type { NotionMirrorProperties } from "./payload";

const NOTION_VERSION = "2022-06-28";
const NOTION_PAGES_URL = "https://api.notion.com/v1/pages";
const NOTION_FETCH_TIMEOUT_MS = 12_000;
const NOTION_ERROR_MESSAGE_MAX = 240;

export type NotionFetch = typeof fetch;

export type NotionWriteResult =
  | { ok: true; pageId: string }
  | { ok: false; status: number; message: string; retryAfterSec?: number };

export type NotionLookupResult =
  | { ok: true; pageId: string | null }
  | { ok: false; status: number; message: string; retryAfterSec?: number };

function headers(apiKey: string): HeadersInit {
  return {
    Authorization: `Bearer ${apiKey}`,
    "Notion-Version": NOTION_VERSION,
    "Content-Type": "application/json",
  };
}

function readRetryAfterSec(res: Response): number | undefined {
  const raw = res.headers.get("retry-after");
  if (!raw) return undefined;
  const asNum = Number(raw);
  if (Number.isFinite(asNum) && asNum >= 0) return Math.ceil(asNum);
  const asDate = Date.parse(raw);
  if (!Number.isFinite(asDate)) return undefined;
  return Math.max(0, Math.ceil((asDate - Date.now()) / 1000));
}

function capMessage(message: string): string {
  if (message.length <= NOTION_ERROR_MESSAGE_MAX) return message;
  return `${message.slice(0, NOTION_ERROR_MESSAGE_MAX - 1)}…`;
}

async function readErrorMessage(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { message?: string; code?: string };
    if (typeof body.message === "string" && body.message) return capMessage(body.message);
    if (typeof body.code === "string" && body.code) return capMessage(body.code);
  } catch {
    // ignore parse errors
  }
  return capMessage(res.statusText || `HTTP ${res.status}`);
}

function mergeSignal(userSignal: AbortSignal | null | undefined): AbortSignal {
  const timeout = AbortSignal.timeout(NOTION_FETCH_TIMEOUT_MS);
  if (!userSignal) return timeout;
  if (typeof AbortSignal.any === "function") {
    return AbortSignal.any([userSignal, timeout]);
  }
  return timeout;
}

async function notionFetch(
  fetchImpl: NotionFetch,
  url: string,
  init: RequestInit & { apiKey: string },
): Promise<Response> {
  const { apiKey, signal, ...rest } = init;
  return fetchImpl(url, {
    ...rest,
    headers: headers(apiKey),
    signal: mergeSignal(signal ?? undefined),
  });
}

function failFromResponse(
  res: Response,
  message: string,
): { ok: false; status: number; message: string; retryAfterSec?: number } {
  const retryAfterSec = res.status === 429 ? readRetryAfterSec(res) : undefined;
  return { ok: false, status: res.status, message, retryAfterSec };
}

/**
 * Look up an existing Notion page by ticket UUID (Desk link URL) so retries
 * do not create duplicate pages after a create-without-writeback.
 */
export async function findNotionMirrorPageByTicketId(opts: {
  config: NotionMirrorConfig;
  /** Desk link embeds the stable ticket UUID — Notion create key. */
  deskLink: string;
  fetchImpl?: NotionFetch;
}): Promise<NotionLookupResult> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const url = `https://api.notion.com/v1/databases/${encodeURIComponent(opts.config.databaseId)}/query`;
  const res = await notionFetch(fetchImpl, url, {
    method: "POST",
    apiKey: opts.config.apiKey,
    body: JSON.stringify({
      page_size: 1,
      filter: {
        property: "Desk link",
        url: { equals: opts.deskLink },
      },
    }),
  });
  if (!res.ok) {
    return failFromResponse(res, await readErrorMessage(res));
  }
  const body = (await res.json()) as { results?: Array<{ id?: string }> };
  const pageId = body.results?.[0]?.id;
  if (typeof pageId === "string" && pageId) {
    return { ok: true, pageId };
  }
  return { ok: true, pageId: null };
}

/** Secondary lookup by Ticket number when Desk link filter is unavailable. */
export async function findNotionMirrorPageByTicketNumber(opts: {
  config: NotionMirrorConfig;
  ticketNumber: number;
  fetchImpl?: NotionFetch;
}): Promise<NotionLookupResult> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const url = `https://api.notion.com/v1/databases/${encodeURIComponent(opts.config.databaseId)}/query`;
  const res = await notionFetch(fetchImpl, url, {
    method: "POST",
    apiKey: opts.config.apiKey,
    body: JSON.stringify({
      page_size: 1,
      filter: {
        property: "Ticket number",
        number: { equals: opts.ticketNumber },
      },
    }),
  });
  if (!res.ok) {
    return failFromResponse(res, await readErrorMessage(res));
  }
  const body = (await res.json()) as { results?: Array<{ id?: string }> };
  const pageId = body.results?.[0]?.id;
  if (typeof pageId === "string" && pageId) {
    return { ok: true, pageId };
  }
  return { ok: true, pageId: null };
}

export async function createNotionMirrorPage(opts: {
  config: NotionMirrorConfig;
  properties: NotionMirrorProperties;
  fetchImpl?: NotionFetch;
}): Promise<NotionWriteResult> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const res = await notionFetch(fetchImpl, NOTION_PAGES_URL, {
    method: "POST",
    apiKey: opts.config.apiKey,
    body: JSON.stringify({
      parent: { database_id: opts.config.databaseId },
      properties: opts.properties,
    }),
  });
  if (!res.ok) {
    return failFromResponse(res, await readErrorMessage(res));
  }
  const body = (await res.json()) as { id?: string };
  if (typeof body.id !== "string" || !body.id) {
    return { ok: false, status: res.status, message: "Notion create returned no page id" };
  }
  return { ok: true, pageId: body.id };
}

export async function updateNotionMirrorPage(opts: {
  config: NotionMirrorConfig;
  pageId: string;
  properties: NotionMirrorProperties;
  fetchImpl?: NotionFetch;
}): Promise<NotionWriteResult> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const res = await notionFetch(fetchImpl, `${NOTION_PAGES_URL}/${encodeURIComponent(opts.pageId)}`, {
    method: "PATCH",
    apiKey: opts.config.apiKey,
    body: JSON.stringify({ properties: opts.properties }),
  });
  if (!res.ok) {
    return failFromResponse(res, await readErrorMessage(res));
  }
  return { ok: true, pageId: opts.pageId };
}
