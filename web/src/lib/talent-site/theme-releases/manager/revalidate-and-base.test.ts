import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { SupabaseClient } from "@supabase/supabase-js";

import { makeBaseResolver } from "./base-resolver.server";
import {
  REVALIDATE_PATH,
  requestTalentSiteRevalidate,
  revalidateOrigin,
} from "../../server/revalidate-request.server";

const HERE = fileURLToPath(new URL(".", import.meta.url));
const SRC = join(HERE, "../../../..");

// ── base resolver: exact pinned snapshot, else unknownBase ───────────────────

function fakeAdmin(snapshots: Record<number, unknown>): { admin: SupabaseClient; reads: number[] } {
  const reads: number[] = [];
  const admin = {
    from: (table: string) => {
      assert.equal(table, "talent_theme_versions");
      let version = -1;
      const q = {
        select: () => q,
        eq: (col: string, v: unknown) => {
          if (col === "version") version = v as number;
          return q;
        },
        maybeSingle: async () => {
          reads.push(version);
          return { data: version in snapshots ? { payload: snapshots[version] } : null, error: null };
        },
      };
      return q;
    },
  } as unknown as SupabaseClient;
  return { admin, reads };
}

const REL = { design_slug: "maison-v2", from_version: 13, base_payload: null as unknown };

test("base resolver: the pinned version's snapshot, cached per version", async () => {
  const { admin, reads } = fakeAdmin({ 13: { v: 13 }, 14: { v: 14 } });
  const resolve = makeBaseResolver(admin, REL);
  assert.deepEqual(await resolve(13), { v: 13 });
  assert.deepEqual(await resolve(14), { v: 14 });
  await resolve(13);
  assert.deepEqual(reads, [13, 14]);
});

test("base resolver: unpinned or no snapshot is unknownBase (null)", async () => {
  const { admin } = fakeAdmin({});
  const resolve = makeBaseResolver(admin, REL);
  assert.equal(await resolve(null), null);
  assert.equal(await resolve(9), null);
});

test("base resolver: saved from_version payload only stands in for from_version", async () => {
  const { admin } = fakeAdmin({});
  const resolve = makeBaseResolver(admin, { ...REL, base_payload: { saved: true } });
  assert.deepEqual(await resolve(13), { saved: true });
  assert.equal(await resolve(12), null);
});

// ── cache clear through a real request path ──────────────────────────────────

const ENV = { NEXT_PUBLIC_APP_URL: "https://app.example.test/", CRON_SECRET: "s3cret" };

test("revalidate origin comes from NEXT_PUBLIC_APP_URL, trailing slash trimmed", () => {
  assert.equal(revalidateOrigin(ENV), "https://app.example.test");
  assert.equal(revalidateOrigin({}), null);
  assert.equal(revalidateOrigin({ NEXT_PUBLIC_APP_URL: "app.example.test" }), null);
});

test("revalidate request: POSTs the bearer secret to the cron path", async () => {
  const seen: Array<{ url: string; init: RequestInit }> = [];
  const res = await requestTalentSiteRevalidate(
    { talentProfileId: "00000000-0000-4000-8000-000000000001", profileCode: "TAL-93003" },
    {
      env: ENV,
      fetch: (async (url: string, init: RequestInit) => {
        seen.push({ url, init });
        return new Response("{}", { status: 200 });
      }) as unknown as typeof fetch,
    },
  );
  assert.equal(res.ok, true);
  assert.equal(seen[0]!.url, `https://app.example.test${REVALIDATE_PATH}`);
  assert.equal(seen[0]!.init.method, "POST");
  assert.equal((seen[0]!.init.headers as Record<string, string>).authorization, "Bearer s3cret");
});

test("revalidate request: failures are reported, never thrown", async () => {
  const input = { talentProfileId: "00000000-0000-4000-8000-000000000001", profileCode: "TAL-93003" };
  assert.equal((await requestTalentSiteRevalidate(input, { env: {} })).ok, false);
  assert.equal((await requestTalentSiteRevalidate(input, { env: { NEXT_PUBLIC_APP_URL: ENV.NEXT_PUBLIC_APP_URL } })).ok, false);
  const bad = await requestTalentSiteRevalidate(input, {
    env: ENV,
    fetch: (async () => new Response("no", { status: 401 })) as unknown as typeof fetch,
  });
  assert.deepEqual(bad, { ok: false, error: "revalidate request returned 401" });
  const boom = await requestTalentSiteRevalidate(input, {
    env: ENV,
    fetch: (async () => {
      throw new Error("offline");
    }) as unknown as typeof fetch,
  });
  assert.deepEqual(boom, { ok: false, error: "offline" });
});

test("cron route: secret-gated, timing-safe, reachable via the proxy cron short-circuit", () => {
  const route = readFileSync(join(SRC, "app/api/cron/revalidate-talent-site/route.ts"), "utf8");
  assert.match(route, /process\.env\.CRON_SECRET/);
  assert.match(route, /timingSafeEqual/);
  assert.match(route, /status: 401/);
  assert.ok(route.indexOf("sameSecret(token, secret)") < route.indexOf("bustTalentSiteCache(id, code)"));
  assert.equal(REVALIDATE_PATH, "/api/cron/revalidate-talent-site");
  // proxy.ts short-circuits /api/cron/ before host gating (any host reaches it).
  assert.match(readFileSync(join(SRC, "proxy.ts"), "utf8"), /\/api\/cron\//);
});

test("live demo publish clears the public cache through the request path", () => {
  const s = readFileSync(join(SRC, "lib/talent-site/server/demo-pipeline.server.ts"), "utf8");
  const publish = s.slice(s.indexOf("export async function publishDemoSite"), s.indexOf("export async function applyThemeDemos"));
  assert.ok(publish.indexOf("publishSiteTheme(") < publish.indexOf("requestTalentSiteRevalidate("));
});
