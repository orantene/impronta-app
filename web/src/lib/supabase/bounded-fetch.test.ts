import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { BoundedFetchTimeoutError, createBoundedFetch } from "./bounded-fetch";

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
