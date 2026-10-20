/**
 * safe-fetch.test.ts: the SSRF policy for server-side fetches of user URLs
 * (H1). Pure: a fake resolver and a fake transport stand in for DNS and the
 * socket, so every case is decided by the policy, not the network.
 */
import assert from "node:assert/strict";
import test from "node:test";

import { isPrivateIp } from "@/lib/ssrf-guard";

import {
  pinnedLookup,
  safeFetch,
  type Resolver,
  type Transport,
  type TransportRequest,
} from "./safe-fetch";

function bodyOf(text: string): AsyncIterable<Uint8Array> {
  const bytes = new TextEncoder().encode(text);
  return (async function* () {
    yield bytes;
  })();
}

function resolverFrom(map: Record<string, string[]>): Resolver & { calls: string[] } {
  const calls: string[] = [];
  const fn = (async (host: string) => {
    calls.push(host);
    const ips = map[host];
    if (!ips) throw new Error("ENOTFOUND");
    return ips.map((address) => ({ address, family: address.includes(":") ? 6 : 4 }) as const);
  }) as Resolver & { calls: string[] };
  fn.calls = calls;
  return fn;
}

type Reply = { status: number; headers?: Record<string, string>; body?: string };

function transportFrom(replies: Record<string, Reply>): Transport & { seen: TransportRequest[] } {
  const seen: TransportRequest[] = [];
  const fn = (async (req: TransportRequest) => {
    seen.push(req);
    const r = replies[req.url.toString()];
    if (!r) throw new Error(`unexpected fetch ${req.url}`);
    return {
      status: r.status,
      headers: new Headers(r.headers ?? {}),
      body: r.body === undefined ? null : bodyOf(r.body),
      cancel: () => undefined,
    };
  }) as Transport & { seen: TransportRequest[] };
  fn.seen = seen;
  return fn;
}

const PUBLIC = resolverFrom({ "example.com": ["93.184.216.34"], "cdn.example.com": ["151.101.1.1"] });

test("ALLOWS a public https host and pins the resolved IP into the connection", async () => {
  const transport = transportFrom({ "https://example.com/menu": { status: 200, body: "hello" } });
  const res = await safeFetch("https://example.com/menu", { maxBytes: 1024, resolver: PUBLIC, transport });
  assert.equal(res.ok, true);
  if (!res.ok) return;
  assert.equal(new TextDecoder().decode(res.body), "hello");
  assert.equal(transport.seen[0]!.address, "93.184.216.34", "socket must use the vetted address");
  assert.equal(transport.seen[0]!.url.hostname, "example.com", "TLS/SNI still uses the hostname");
});

for (const url of [
  "http://127.0.0.1/",
  "http://10.0.0.5/admin",
  "http://169.254.169.254/latest/meta-data/",
  "http://[::1]/",
  "http://[fd00::1]/",
  "http://[::ffff:7f00:1]/",
  "http://2130706433/",
  "http://localhost:3000/",
  "http://metadata.google.internal/",
]) {
  test(`BLOCKS ${url}`, async () => {
    const transport = transportFrom({});
    const res = await safeFetch(url, { maxBytes: 1024, resolver: PUBLIC, transport });
    assert.equal(res.ok, false);
    if (res.ok) return;
    assert.ok(["private_address", "blocked_host"].includes(res.reason), res.reason);
    assert.equal(transport.seen.length, 0, "no connection may be attempted");
  });
}

for (const url of ["file:///etc/passwd", "gopher://example.com/", "ftp://example.com/x", "data:text/html,hi"]) {
  test(`BLOCKS non-http scheme ${url.split(":")[0]}`, async () => {
    const res = await safeFetch(url, { maxBytes: 1024, resolver: PUBLIC, transport: transportFrom({}) });
    assert.equal(res.ok, false);
    if (!res.ok) assert.equal(res.reason, "scheme");
  });
}

test("BLOCKS a hostname whose DNS answers include ANY private address", async () => {
  const resolver = resolverFrom({ "evil.test": ["93.184.216.34", "10.0.0.1"] });
  const res = await safeFetch("https://evil.test/", { maxBytes: 1024, resolver, transport: transportFrom({}) });
  assert.equal(res.ok, false);
  if (!res.ok) assert.equal(res.reason, "private_address");
});

test("BLOCKS an http -> private redirect, re-validating the hop", async () => {
  const transport = transportFrom({
    "http://example.com/go": { status: 302, headers: { location: "http://169.254.169.254/latest/meta-data/" } },
  });
  const res = await safeFetch("http://example.com/go", { maxBytes: 1024, resolver: PUBLIC, transport });
  assert.equal(res.ok, false);
  if (!res.ok) assert.ok(["private_address", "blocked_host"].includes(res.reason), res.reason);
  assert.equal(transport.seen.length, 1, "the private hop is never dialled");
});

test("BLOCKS a redirect to a name that resolves private (rebinding via redirect)", async () => {
  const resolver = resolverFrom({ "example.com": ["93.184.216.34"], "inner.test": ["192.168.1.10"] });
  const transport = transportFrom({
    "https://example.com/": { status: 301, headers: { location: "https://inner.test/" } },
  });
  const res = await safeFetch("https://example.com/", { maxBytes: 1024, resolver, transport });
  assert.equal(res.ok, false);
  if (!res.ok) assert.equal(res.reason, "private_address");
});

test("BLOCKS a redirect to file://", async () => {
  const transport = transportFrom({
    "https://example.com/": { status: 302, headers: { location: "file:///etc/passwd" } },
  });
  const res = await safeFetch("https://example.com/", { maxBytes: 1024, resolver: PUBLIC, transport });
  assert.equal(res.ok, false);
  if (!res.ok) assert.equal(res.reason, "bad_redirect");
});

test("FOLLOWS a public http -> https redirect, resolving each hop once", async () => {
  const transport = transportFrom({
    "http://example.com/": { status: 301, headers: { location: "https://cdn.example.com/a" } },
    "https://cdn.example.com/a": { status: 200, body: "ok" },
  });
  const resolver = resolverFrom({ "example.com": ["93.184.216.34"], "cdn.example.com": ["151.101.1.1"] });
  const res = await safeFetch("http://example.com/", { maxBytes: 1024, resolver, transport });
  assert.equal(res.ok, true);
  if (res.ok) {
    assert.equal(res.redirects, 1);
    assert.equal(res.url.toString(), "https://cdn.example.com/a");
  }
  assert.deepEqual(resolver.calls, ["example.com", "cdn.example.com"]);
  assert.equal(transport.seen[1]!.address, "151.101.1.1");
});

test("CAPS redirects", async () => {
  const transport = transportFrom({
    "https://example.com/1": { status: 302, headers: { location: "/2" } },
    "https://example.com/2": { status: 302, headers: { location: "/3" } },
    "https://example.com/3": { status: 302, headers: { location: "/4" } },
  });
  const res = await safeFetch("https://example.com/1", { maxBytes: 1024, maxRedirects: 2, resolver: PUBLIC, transport });
  assert.equal(res.ok, false);
  if (!res.ok) assert.equal(res.reason, "too_many_redirects");
});

test("REFUSES by Content-Length before reading the body", async () => {
  let pulled = false;
  const transport: Transport = async () => ({
    status: 200,
    headers: new Headers({ "content-length": String(50 * 1024 * 1024) }),
    body: (async function* () {
      pulled = true;
      yield new Uint8Array(10);
    })(),
    cancel: () => undefined,
  });
  const res = await safeFetch("https://example.com/big.jpg", { maxBytes: 1024, resolver: PUBLIC, transport });
  assert.equal(res.ok, false);
  if (!res.ok) assert.equal(res.reason, "too_large");
  assert.equal(pulled, false, "not one body byte may be read");
});

test("REFUSES by streamed bytes when Content-Length lies or is absent", async () => {
  let chunksPulled = 0;
  const transport: Transport = async () => ({
    status: 200,
    headers: new Headers({ "content-length": "10" }),
    body: (async function* () {
      for (let i = 0; i < 1000; i += 1) {
        chunksPulled += 1;
        yield new Uint8Array(512);
      }
    })(),
    cancel: () => undefined,
  });
  const res = await safeFetch("https://example.com/liar", { maxBytes: 2048, resolver: PUBLIC, transport });
  assert.equal(res.ok, false);
  if (!res.ok) assert.equal(res.reason, "too_large");
  assert.ok(chunksPulled <= 5, `stopped early (pulled ${chunksPulled})`);
});

test("TIMES OUT a transport that never answers", async () => {
  const transport: Transport = (req) =>
    new Promise((_resolve, reject) => {
      req.signal.addEventListener("abort", () => reject(new Error("aborted")));
    });
  const res = await safeFetch("https://example.com/slow", {
    maxBytes: 1024,
    timeoutMs: 20,
    resolver: PUBLIC,
    transport,
  });
  assert.equal(res.ok, false);
  if (!res.ok) assert.equal(res.reason, "timeout");
});

test("REFUSES URLs carrying credentials", async () => {
  const res = await safeFetch("https://user:pw@example.com/", { maxBytes: 1024, resolver: PUBLIC, transport: transportFrom({}) });
  assert.equal(res.ok, false);
  if (!res.ok) assert.equal(res.reason, "credentials");
});

test("pinnedLookup answers both lookup shapes with the vetted IP", () => {
  const lookup = pinnedLookup("93.184.216.34", 4);
  lookup("example.com", { all: true }, (err, address) => {
    assert.equal(err, null);
    assert.deepEqual(address, [{ address: "93.184.216.34", family: 4 }]);
  });
  lookup("example.com", {}, (err, address, family) => {
    assert.equal(err, null);
    assert.equal(address, "93.184.216.34");
    assert.equal(family, 4);
  });
});

test("isPrivateIp covers the ranges a string prefix check missed", () => {
  for (const ip of [
    "127.0.0.1", "10.1.2.3", "172.16.0.1", "192.168.0.1", "169.254.169.254", "100.64.0.1",
    "0.0.0.0", "192.0.0.1", "198.18.0.1", "255.255.255.255",
    "::", "::1", "::ffff:127.0.0.1", "::ffff:7f00:1", "::127.0.0.1", "fe80::1", "fe90::1",
    "febf::1", "fec0::1", "fc00::1", "fd00::", "ff02::1", "64:ff9b::a9fe:a9fe", "64:ff9b:1::1",
    "2002:7f00:1::", "2001:db8::1", "2001:0:4136:e378::1", "100::1",
  ]) {
    assert.equal(isPrivateIp(ip), true, `${ip} must be private`);
  }
  for (const ip of ["93.184.216.34", "8.8.8.8", "2606:4700:4700::1111", "2a00:1450:4001:80b::200e", "::ffff:8.8.8.8", "2002:808:808::"]) {
    assert.equal(isPrivateIp(ip), false, `${ip} must be public`);
  }
});

test("truncate mode (HTML scrapers) keeps only the first maxBytes and stops reading", async () => {
  let chunksPulled = 0;
  const transport: Transport = async () => ({
    status: 200,
    headers: new Headers({ "content-length": String(10 * 1024 * 1024), "content-type": "text/html" }),
    body: (async function* () {
      for (let i = 0; i < 1000; i += 1) {
        chunksPulled += 1;
        yield new TextEncoder().encode("<head><title>x</title></head>".padEnd(512, " "));
      }
    })(),
    cancel: () => undefined,
  });
  const res = await safeFetch("https://example.com/page", {
    maxBytes: 2048,
    overflow: "truncate",
    resolver: PUBLIC,
    transport,
  });
  assert.equal(res.ok, true);
  if (res.ok) assert.equal(res.body.byteLength, 2048);
  assert.ok(chunksPulled <= 5, `stopped early (pulled ${chunksPulled})`);
});

test("HEAD reads no body and still re-validates redirects", async () => {
  const transport = transportFrom({
    "https://example.com/a": { status: 302, headers: { location: "http://[::1]:8080/" } },
  });
  const res = await safeFetch("https://example.com/a", { method: "HEAD", maxBytes: 0, resolver: PUBLIC, transport });
  assert.equal(res.ok, false);
});
