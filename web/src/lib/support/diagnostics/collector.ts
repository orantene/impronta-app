"use client";

import * as Sentry from "@sentry/nextjs";

/**
 * Always-on client diagnostics ring buffers. Zero network until ticket create
 * calls `getDiagnosticsSnapshot()`.
 */

export type DiagnosticsSnapshot = {
  appVersion: string;
  route: string;
  url: string;
  viewport: { w: number; h: number; dpr: number };
  userAgent: string;
  locale: string;
  timezone: string;
  online: boolean;
  consoleEvents: Array<{ level: string; message: string; ts: number }>;
  networkFailures: Array<{
    method: string;
    pathOnly: string;
    status: number | null;
    durationMs: number;
    ts: number;
  }>;
  routeHistory: Array<{ path: string; ts: number }>;
  sentryLastEventId: string | null;
  collectedAt: string;
};

const consoleBuf: DiagnosticsSnapshot["consoleEvents"] = [];
const netBuf: DiagnosticsSnapshot["networkFailures"] = [];
const routeBuf: DiagnosticsSnapshot["routeHistory"] = [];
let started = false;

function truncate(s: string, n = 500): string {
  return s.length > n ? s.slice(0, n) : s;
}

function push<T>(buf: T[], item: T, max: number) {
  buf.push(item);
  if (buf.length > max) buf.splice(0, buf.length - max);
}

function pathOnly(input: string): string {
  try {
    const u = new URL(input, window.location.origin);
    return u.pathname;
  } catch {
    return input.split("?")[0] ?? input;
  }
}

export function startDiagnosticsCollector(): void {
  if (started || typeof window === "undefined") return;
  started = true;

  const wrap = (level: "error" | "warn") => {
    // The collector wraps the live console; it does not print on its own.
    // eslint-disable-next-line no-console
    const orig = console[level].bind(console);
    // eslint-disable-next-line no-console
    console[level] = (...args: unknown[]) => {
      push(
        consoleBuf,
        {
          level,
          message: truncate(args.map((a) => (typeof a === "string" ? a : safeStr(a))).join(" ")),
          ts: Date.now(),
        },
        50,
      );
      orig(...args);
    };
  };
  wrap("error");
  wrap("warn");

  window.addEventListener("error", (e) => {
    push(consoleBuf, { level: "error", message: truncate(e.message || "error"), ts: Date.now() }, 50);
  });
  window.addEventListener("unhandledrejection", (e) => {
    const msg = e.reason instanceof Error ? e.reason.message : String(e.reason ?? "rejection");
    push(consoleBuf, { level: "error", message: truncate(msg), ts: Date.now() }, 50);
  });

  const origFetch = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const method = (init?.method ?? (typeof input === "object" && "method" in input ? input.method : "GET") ?? "GET").toUpperCase();
    const startedAt = Date.now();
    try {
      const res = await origFetch(input, init);
      recordNet(url, method, res.status, Date.now() - startedAt);
      return res;
    } catch (err) {
      recordNet(url, method, null, Date.now() - startedAt);
      throw err;
    }
  };

  const remember = () => {
    push(routeBuf, { path: window.location.pathname, ts: Date.now() }, 20);
  };
  remember();
  window.addEventListener("popstate", remember);
  const origPush = history.pushState.bind(history);
  history.pushState = (...args) => {
    origPush(...args);
    remember();
  };
  const origReplace = history.replaceState.bind(history);
  history.replaceState = (...args) => {
    origReplace(...args);
    remember();
  };
}

function recordNet(url: string, method: string, status: number | null, durationMs: number) {
  if (typeof window === "undefined") return;
  const abs = (() => {
    try {
      return new URL(url, window.location.origin);
    } catch {
      return null;
    }
  })();
  if (!abs) return;
  const sameOrigin = abs.origin === window.location.origin;
  const supabase = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(/\/$/, "");
  const isApi = sameOrigin && abs.pathname.startsWith("/api/");
  const isSb = supabase && abs.href.startsWith(supabase);
  if (!isApi && !isSb) return;
  if (status != null && status < 400) return;
  push(
    netBuf,
    { method, pathOnly: pathOnly(abs.href), status, durationMs, ts: Date.now() },
    25,
  );
}

function safeStr(v: unknown): string {
  try {
    return truncate(JSON.stringify(v));
  } catch {
    return "[unserializable]";
  }
}

export function getDiagnosticsSnapshot(): DiagnosticsSnapshot {
  let sentryId: string | null = null;
  try {
    sentryId = Sentry.lastEventId() ?? null;
  } catch {
    sentryId = null;
  }
  return {
    appVersion: process.env.NEXT_PUBLIC_COMMIT_SHA ?? "",
    route: typeof window !== "undefined" ? window.location.pathname : "",
    url: typeof window !== "undefined" ? window.location.href.split("?")[0] : "",
    viewport:
      typeof window !== "undefined"
        ? { w: window.innerWidth, h: window.innerHeight, dpr: window.devicePixelRatio || 1 }
        : { w: 0, h: 0, dpr: 1 },
    userAgent: typeof navigator !== "undefined" ? navigator.userAgent : "",
    locale: typeof navigator !== "undefined" ? navigator.language : "",
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    online: typeof navigator !== "undefined" ? navigator.onLine : true,
    consoleEvents: consoleBuf.slice(-50),
    networkFailures: netBuf.slice(-25),
    routeHistory: routeBuf.slice(-20),
    sentryLastEventId: sentryId,
    collectedAt: new Date().toISOString(),
  };
}
