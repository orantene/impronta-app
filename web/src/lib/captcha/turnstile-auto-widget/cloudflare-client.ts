/**
 * TUL-1017: thin Cloudflare Turnstile widget API client.
 *
 * `fetch` is injected so tests never reach Cloudflare. Every method returns a
 * result object and never throws: an HTTP error, a `success: false` body, a
 * malformed body or a timeout (AbortSignal, ~8s) all come back as
 * `{ ok: false, status, code }` so the caller can fail safe (captcha stays
 * "none"). Errors carry names and status only, never the token or a secret.
 */

import type { ListedWidget } from "./decision";

export const CLOUDFLARE_API_BASE = "https://api.cloudflare.com/client/v4";
export const DEFAULT_TIMEOUT_MS = 8_000;
const LIST_PER_PAGE = 50;
const LIST_MAX_PAGES = 20;

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export type CfFailure = { ok: false; status: number | null; code: "http_error" | "api_error" | "bad_body" | "timeout" | "network" };

export type CreatedWidget = { sitekey: string; secret: string; name: string };

export type TurnstileWidgetClient = {
  listWidgets(): Promise<{ ok: true; widgets: ListedWidget[] } | CfFailure>;
  createWidget(input: { name: string; domains: string[] }): Promise<{ ok: true; widget: CreatedWidget } | CfFailure>;
  deleteWidget(sitekey: string): Promise<{ ok: true } | CfFailure>;
};

type CfEnvelope = {
  success?: unknown;
  result?: unknown;
  result_info?: { total_count?: unknown; total_pages?: unknown } | null;
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

export function createTurnstileWidgetClient(opts: {
  accountId: string;
  apiToken: string;
  fetch: FetchLike;
  timeoutMs?: number;
}): TurnstileWidgetClient {
  const base = `${CLOUDFLARE_API_BASE}/accounts/${encodeURIComponent(opts.accountId)}/challenges/widgets`;
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  async function call(
    url: string,
    init: { method: "GET" | "POST" | "DELETE"; body?: unknown },
  ): Promise<{ ok: true; envelope: CfEnvelope } | CfFailure> {
    let res: Response;
    try {
      res = await opts.fetch(url, {
        method: init.method,
        headers: {
          Authorization: `Bearer ${opts.apiToken}`,
          ...(init.body !== undefined ? { "Content-Type": "application/json" } : {}),
        },
        body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
        signal: AbortSignal.timeout(timeoutMs),
        cache: "no-store",
      });
    } catch (error) {
      const name = error instanceof Error ? error.name : "";
      return { ok: false, status: null, code: name === "TimeoutError" || name === "AbortError" ? "timeout" : "network" };
    }
    let body: unknown = null;
    try {
      body = await res.json();
    } catch {
      body = null;
    }
    if (!res.ok) return { ok: false, status: res.status, code: "http_error" };
    if (!isRecord(body)) return { ok: false, status: res.status, code: "bad_body" };
    if (body.success !== true) return { ok: false, status: res.status, code: "api_error" };
    return { ok: true, envelope: body as CfEnvelope };
  }

  return {
    async listWidgets() {
      const widgets: ListedWidget[] = [];
      for (let page = 1; page <= LIST_MAX_PAGES; page += 1) {
        const r = await call(`${base}?page=${page}&per_page=${LIST_PER_PAGE}`, { method: "GET" });
        if (!r.ok) return r;
        const result = r.envelope.result;
        if (!Array.isArray(result)) return { ok: false, status: 200, code: "bad_body" };
        for (const w of result) {
          if (isRecord(w) && typeof w.sitekey === "string" && typeof w.name === "string") {
            widgets.push({ sitekey: w.sitekey, name: w.name });
          }
        }
        const total = Number(r.envelope.result_info?.total_count);
        const done = result.length < LIST_PER_PAGE || (Number.isFinite(total) && page * LIST_PER_PAGE >= total);
        if (done) break;
      }
      return { ok: true, widgets };
    },

    async createWidget(input) {
      const r = await call(base, {
        method: "POST",
        body: { name: input.name, domains: input.domains, mode: "managed" },
      });
      if (!r.ok) return r;
      const w = r.envelope.result;
      if (!isRecord(w) || typeof w.sitekey !== "string" || typeof w.secret !== "string" || !w.sitekey || !w.secret) {
        return { ok: false, status: 200, code: "bad_body" };
      }
      return { ok: true, widget: { sitekey: w.sitekey, secret: w.secret, name: typeof w.name === "string" ? w.name : input.name } };
    },

    async deleteWidget(sitekey) {
      const r = await call(`${base}/${encodeURIComponent(sitekey)}`, { method: "DELETE" });
      return r.ok ? { ok: true } : r;
    },
  };
}
