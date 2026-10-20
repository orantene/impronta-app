/**
 * safe-fetch.ts: the one way server code fetches a URL a user typed (H1).
 *
 * `assertPublicHttpUrl` + `fetch(url, { redirect: "manual" })` left three
 * holes, all named in ssrf-guard.ts's own header:
 *   1. DNS REBINDING. The guard resolved the name, then `fetch` resolved it
 *      AGAIN; a 0-TTL record could answer public then 127.0.0.1. Here the
 *      checked address is PINNED into the socket (`lookup` on node:http/https
 *      returns the vetted IP), so the connection goes to exactly what was
 *      checked. TLS still verifies against the hostname (SNI unchanged).
 *   2. REDIRECTS. Callers either refused all redirects (most real sites
 *      redirect http to https, so imports failed) or followed them unchecked
 *      (`redirect: "follow"` straight into 169.254.169.254). Here every hop is
 *      re-validated (scheme, hostname, resolve, range check, pin) and the hop
 *      count is capped.
 *   3. UNBOUNDED BODIES. The body is read through `readStreamCapped` after a
 *      Content-Length pre-check, with one deadline over the whole exchange.
 *
 * Resolver and transport are injectable so the policy is unit-testable
 * without a network. Production uses node:dns + node:http(s).
 */
import "server-only";

import { lookup as dnsLookup } from "node:dns/promises";
import http from "node:http";
import https from "node:https";
import { isIP, type LookupFunction } from "node:net";

import { checkDeclaredLength, readStreamCapped } from "@/lib/media/upload-guards";
import { isBlockedHostname, isPrivateIp } from "@/lib/ssrf-guard";

export type ResolvedAddress = { address: string; family: 4 | 6 };
export type Resolver = (hostname: string) => Promise<ResolvedAddress[]>;

export type TransportRequest = {
  url: URL;
  /** The vetted IP the socket MUST connect to. */
  address: string;
  family: 4 | 6;
  method: "GET" | "HEAD";
  headers: Record<string, string>;
  signal: AbortSignal;
};

export type TransportResponse = {
  status: number;
  headers: Headers;
  body: AsyncIterable<Uint8Array> | null;
  /** Drop the connection without reading the rest of the body. */
  cancel: () => void;
};

export type Transport = (req: TransportRequest) => Promise<TransportResponse>;

export type SafeFetchRefusal =
  | "malformed"
  | "scheme"
  | "credentials"
  | "blocked_host"
  | "private_address"
  | "dns_failed"
  | "too_many_redirects"
  | "bad_redirect"
  | "too_large"
  | "timeout"
  | "network";

export type SafeFetchResult =
  | {
      ok: true;
      status: number;
      headers: Headers;
      /** Final URL after redirects. */
      url: URL;
      body: Uint8Array;
      redirects: number;
    }
  | { ok: false; reason: SafeFetchRefusal; url: string; status?: number };

export type SafeFetchOptions = {
  method?: "GET" | "HEAD";
  headers?: Record<string, string>;
  /** Body byte cap. Required: there is no safe default for "how big". */
  maxBytes: number;
  /**
   * "refuse" (default): an over-cap body is a `too_large` failure (images,
   * documents). "truncate": keep the first `maxBytes` (HTML scrapers that
   * only need the <head>). Either way no more than the cap is held.
   */
  overflow?: "refuse" | "truncate";
  maxRedirects?: number;
  timeoutMs?: number;
  maxUrlLength?: number;
  resolver?: Resolver;
  transport?: Transport;
};

export const SAFE_FETCH_DEFAULT_MAX_REDIRECTS = 3;
export const SAFE_FETCH_DEFAULT_TIMEOUT_MS = 10_000;

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

export const systemResolver: Resolver = async (hostname) => {
  const records = await dnsLookup(hostname, { all: true, verbatim: true });
  return records.map((r) => ({ address: r.address, family: r.family === 6 ? 6 : 4 }));
};

type LookupCallback = (
  err: NodeJS.ErrnoException | null,
  address: string | Array<{ address: string; family: number }>,
  family?: number,
) => void;

/**
 * A `lookup` for node:net that ignores DNS and answers with the vetted IP.
 * Handles `{ all: true }` (Node's happy-eyeballs path asks for an array).
 */
export function pinnedLookup(address: string, family: 4 | 6) {
  return (_hostname: string, options: unknown, callback?: LookupCallback) => {
    const cb = (typeof options === "function" ? options : callback) as LookupCallback;
    const wantsAll =
      typeof options === "object" && options !== null && (options as { all?: boolean }).all === true;
    if (wantsAll) cb(null, [{ address, family }]);
    else cb(null, address, family);
  };
}

export const nodeTransport: Transport = (req) =>
  new Promise<TransportResponse>((resolve, reject) => {
    const mod = req.url.protocol === "https:" ? https : http;
    const clientReq = mod.request(
      req.url,
      {
        method: req.method,
        headers: { ...req.headers, "accept-encoding": "identity" },
        lookup: pinnedLookup(req.address, req.family) as unknown as LookupFunction,
        agent: false,
        signal: req.signal,
      },
      (res) => {
        const headers = new Headers();
        for (const [k, v] of Object.entries(res.headers)) {
          if (v === undefined) continue;
          headers.set(k, Array.isArray(v) ? v.join(", ") : v);
        }
        resolve({
          status: res.statusCode ?? 0,
          headers,
          body: res as AsyncIterable<Uint8Array>,
          cancel: () => {
            res.destroy();
            clientReq.destroy();
          },
        });
      },
    );
    clientReq.on("error", reject);
    clientReq.end();
  });

export type AddressCheck =
  | { ok: true; address: string; family: 4 | 6 }
  | { ok: false; reason: "blocked_host" | "private_address" | "dns_failed" };

/**
 * Resolve once and vet EVERY answer; any private answer refuses the host
 * (an attacker controls which record the client would pick).
 */
export async function resolvePublicAddress(
  hostname: string,
  resolver: Resolver,
): Promise<AddressCheck> {
  const host = hostname.replace(/^\[|\]$/g, "");
  if (!host || isBlockedHostname(host)) return { ok: false, reason: "blocked_host" };
  const literal = isIP(host);
  if (literal) {
    return isPrivateIp(host)
      ? { ok: false, reason: "private_address" }
      : { ok: true, address: host, family: literal === 6 ? 6 : 4 };
  }
  let records: ResolvedAddress[];
  try {
    records = await resolver(host);
  } catch {
    return { ok: false, reason: "dns_failed" };
  }
  if (!records || records.length === 0) return { ok: false, reason: "dns_failed" };
  if (records.some((r) => isPrivateIp(r.address))) return { ok: false, reason: "private_address" };
  const first = records[0]!;
  return { ok: true, address: first.address, family: first.family };
}

function parseTarget(raw: string, maxLength: number): { ok: true; url: URL } | { ok: false; reason: SafeFetchRefusal } {
  if (typeof raw !== "string" || raw.length === 0 || raw.length > maxLength) {
    return { ok: false, reason: "malformed" };
  }
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, reason: "malformed" };
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return { ok: false, reason: "scheme" };
  if (url.username || url.password) return { ok: false, reason: "credentials" };
  return { ok: true, url };
}

/** Fetch a user-supplied URL under the full SSRF policy. Never throws. */
export async function safeFetch(rawUrl: string, opts: SafeFetchOptions): Promise<SafeFetchResult> {
  const resolver = opts.resolver ?? systemResolver;
  const transport = opts.transport ?? nodeTransport;
  const maxRedirects = opts.maxRedirects ?? SAFE_FETCH_DEFAULT_MAX_REDIRECTS;
  const maxUrlLength = opts.maxUrlLength ?? 2048;
  const method = opts.method ?? "GET";
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? SAFE_FETCH_DEFAULT_TIMEOUT_MS);

  let current = rawUrl;
  try {
    for (let hop = 0; ; hop += 1) {
      const parsed = parseTarget(current, maxUrlLength);
      if (!parsed.ok) {
        return { ok: false, reason: hop === 0 ? parsed.reason : "bad_redirect", url: current };
      }
      const url = parsed.url;
      const vetted = await resolvePublicAddress(url.hostname, resolver);
      if (!vetted.ok) return { ok: false, reason: vetted.reason, url: url.toString() };
      if (controller.signal.aborted) return { ok: false, reason: "timeout", url: url.toString() };

      let res: TransportResponse;
      try {
        res = await transport({
          url,
          address: vetted.address,
          family: vetted.family,
          method,
          headers: opts.headers ?? {},
          signal: controller.signal,
        });
      } catch {
        return {
          ok: false,
          reason: controller.signal.aborted ? "timeout" : "network",
          url: url.toString(),
        };
      }

      if (REDIRECT_STATUSES.has(res.status)) {
        res.cancel();
        const location = res.headers.get("location");
        if (!location) return { ok: false, reason: "bad_redirect", url: url.toString(), status: res.status };
        if (hop >= maxRedirects) {
          return { ok: false, reason: "too_many_redirects", url: url.toString(), status: res.status };
        }
        try {
          current = new URL(location, url).toString();
        } catch {
          return { ok: false, reason: "bad_redirect", url: url.toString(), status: res.status };
        }
        continue;
      }

      if (method === "HEAD") {
        res.cancel();
        return { ok: true, status: res.status, headers: res.headers, url, body: new Uint8Array(0), redirects: hop };
      }

      const truncate = opts.overflow === "truncate";
      const declared = checkDeclaredLength(res.headers.get("content-length"), opts.maxBytes);
      if (!declared.ok && !truncate) {
        res.cancel();
        return { ok: false, reason: "too_large", url: url.toString(), status: res.status };
      }
      let read;
      try {
        read = await readStreamCapped(res.body, opts.maxBytes, { truncate });
      } catch {
        res.cancel();
        return {
          ok: false,
          reason: controller.signal.aborted ? "timeout" : "network",
          url: url.toString(),
          status: res.status,
        };
      }
      if (!read.ok || read.truncated) res.cancel();
      if (!read.ok) {
        return { ok: false, reason: "too_large", url: url.toString(), status: res.status };
      }
      return { ok: true, status: res.status, headers: res.headers, url, body: read.bytes, redirects: hop };
    }
  } finally {
    clearTimeout(timer);
  }
}

/** UTF-8 decode of a safeFetch body (lenient, like `res.text()`). */
export function decodeBody(body: Uint8Array): string {
  return new TextDecoder("utf-8", { fatal: false }).decode(body);
}
