/**
 * Minimal Notion Pages API client for the one-way Support mirror.
 * Create + update only. No Notion reads that drive Tulala writes.
 */

import type { NotionMirrorConfig } from "./config";
import type { NotionMirrorProperties } from "./payload";

const NOTION_VERSION = "2022-06-28";
const NOTION_PAGES_URL = "https://api.notion.com/v1/pages";

export type NotionFetch = typeof fetch;

export type NotionWriteResult =
  | { ok: true; pageId: string }
  | { ok: false; status: number; message: string };

function headers(apiKey: string): HeadersInit {
  return {
    Authorization: `Bearer ${apiKey}`,
    "Notion-Version": NOTION_VERSION,
    "Content-Type": "application/json",
  };
}

async function readErrorMessage(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { message?: string; code?: string };
    if (typeof body.message === "string" && body.message) return body.message;
    if (typeof body.code === "string" && body.code) return body.code;
  } catch {
    // ignore parse errors
  }
  return res.statusText || `HTTP ${res.status}`;
}

export async function createNotionMirrorPage(opts: {
  config: NotionMirrorConfig;
  properties: NotionMirrorProperties;
  fetchImpl?: NotionFetch;
}): Promise<NotionWriteResult> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const res = await fetchImpl(NOTION_PAGES_URL, {
    method: "POST",
    headers: headers(opts.config.apiKey),
    body: JSON.stringify({
      parent: { database_id: opts.config.databaseId },
      properties: opts.properties,
    }),
  });
  if (!res.ok) {
    return { ok: false, status: res.status, message: await readErrorMessage(res) };
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
  const res = await fetchImpl(`${NOTION_PAGES_URL}/${encodeURIComponent(opts.pageId)}`, {
    method: "PATCH",
    headers: headers(opts.config.apiKey),
    body: JSON.stringify({ properties: opts.properties }),
  });
  if (!res.ok) {
    return { ok: false, status: res.status, message: await readErrorMessage(res) };
  }
  return { ok: true, pageId: opts.pageId };
}
