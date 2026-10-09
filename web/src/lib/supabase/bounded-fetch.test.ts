import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { BoundedFetchTimeoutError, createBoundedFetch, failOnReadTimeout, isBoundedRead } from "./bounded-fetch";

const never = () => new Promise<Response>(() => undefined);

describe("createBoundedFetch", () => {
  it("passes a fast PostgREST response through intact", async () => {
    const f = createBoundedFetch(200, async () => new Response('[{"id":1}]', { status: 200 }));
    const res = await f("https://x.supabase.co/rest/v1/t?select=id");
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), [{ id: 1 }]);
  });

  it("rejects when no response ever arrives", async () => {
    const f = createBoundedFetch(30, never);
    await assert.rejects(f("https://x.supabase.co/rest/v1/t"), BoundedFetchTimeoutError);
  });

  it("rejects when headers arrive but the body never finishes", async () => {
    const stalled = async () => {
      const body = new ReadableStream({ start() {} });
      return new Response(body, { status: 200 });
    };
    const f = createBoundedFetch(30, stalled);
    await assert.rejects(f("https://x.supabase.co/rest/v1/t"), BoundedFetchTimeoutError);
  });

  it("does not buffer non-PostgREST responses", async () => {
    const body = new ReadableStream({ start() {} });
    const f = createBoundedFetch(30, async () => new Response(body, { status: 200 }));
    const res = await f("https://x.supabase.co/storage/v1/object/a");
    assert.equal(res.status, 200);
  });

  it("does not hand the underlying fetch an AbortSignal", async () => {
    let seen: RequestInit | undefined;
    const f = createBoundedFetch(200, async (_i, init) => {
      seen = init;
      return new Response("[]");
    });
    await f("https://x.supabase.co/rest/v1/t", { method: "GET" });
    assert.equal(seen?.signal, undefined);
  });
});

import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("bounded fetch is wired into the request-path clients (TUL-444)", () => {
  const read = (rel: string) => readFileSync(join(new URL(".", import.meta.url).pathname, rel), "utf8");
  for (const file of ["server.ts", "public.ts", "admin.ts", "../saas/host-context.ts"]) {
    it(`${file} uses createBoundedFetch`, () => {
      assert.match(read(file), /createBoundedFetch\(/);
    });
  }
  it("host lookup never caches a failed lookup as not_found", () => {
    assert.match(read("../saas/host-context.ts"), /error && value\.kind === "not_found"/);
  });
});

describe("failOnReadTimeout", () => {
  it("throws when a read inside the scope timed out, even if the caller swallowed it", async () => {
    const f = createBoundedFetch(20, () => new Promise<Response>(() => undefined));
    await assert.rejects(
      failOnReadTimeout(async () => {
        await f("https://x.supabase.co/rest/v1/t").catch(() => undefined);
        return "hollow";
      }),
      BoundedFetchTimeoutError,
    );
  });

  it("later reads in a timed-out scope fail fast", async () => {
    const f = createBoundedFetch(20, () => new Promise<Response>(() => undefined));
    const t0 = Date.now();
    await failOnReadTimeout(async () => {
      await f("https://x.supabase.co/rest/v1/a").catch(() => undefined);
      await f("https://x.supabase.co/rest/v1/b").catch(() => undefined);
    }).catch(() => undefined);
    assert.ok(Date.now() - t0 < 200);
  });

  it("returns the result untouched when nothing timed out", async () => {
    assert.equal(await failOnReadTimeout(async () => "ok"), "ok");
  });
});

describe("only reads are bounded", () => {
  const rest = "https://x.supabase.co/rest/v1/";
  it("bounds GET and HEAD", () => {
    assert.equal(isBoundedRead(`${rest}t?select=id`, "GET"), true);
    assert.equal(isBoundedRead(`${rest}t`, "HEAD"), true);
  });
  it("never bounds writes", () => {
    for (const m of ["POST", "PATCH", "PUT", "DELETE"]) assert.equal(isBoundedRead(`${rest}orders`, m), false);
  });
  it("bounds only the known read-only RPCs", () => {
    assert.equal(isBoundedRead(`${rest}rpc/talent_site_domain_lookup`, "POST"), true);
    assert.equal(isBoundedRead(`${rest}rpc/record_payment`, "POST"), false);
  });
  it("a POST that stalls is passed through, not rejected at the deadline", async () => {
    let called = false;
    const f = createBoundedFetch(20, async () => {
      called = true;
      await new Promise((r) => setTimeout(r, 60));
      return new Response("{}", { status: 201 });
    });
    const res = await f(`${rest}orders`, { method: "POST", body: "{}" });
    assert.equal(called, true);
    assert.equal(res.status, 201);
  });
});

describe("main-row timeout (TUL-444)", () => {
  it("renderTalentMaxSite is wrapped so a timed-out read cannot become an empty 200 or a 404", () => {
    const src = readFileSync(join(new URL(".", import.meta.url).pathname, "../talent-site/server/render-max-site.tsx"), "utf8");
    assert.match(src, /export const renderTalentMaxSite[\s\S]{0,200}failOnReadTimeout\(/);
  });
});

describe("bounded-fetch stays client-bundle safe (TUL-444)", () => {
  it("has no static node: import (supabase/public.ts reaches client bundles)", () => {
    const src = readFileSync(join(new URL(".", import.meta.url).pathname, "bounded-fetch.ts"), "utf8");
    assert.doesNotMatch(src, /^\s*import[^;]*from\s+["']node:/m);
    assert.doesNotMatch(src, /require\(\s*["']node:/);
  });
});
