/**
 * private-access.test.ts — P0-1 invariants for gated media access.
 *
 * Run: NODE_OPTIONS='--require ./scripts/register-server-only-test.cjs' \
 *      node_modules/.bin/tsx --test src/lib/media/private-access.test.ts
 *
 * The four things that must never regress:
 *   1. FLAG OFF ⇒ every URL is byte-identical to the pre-P0-1 public URL, and
 *      no call site can accidentally opt in.
 *   2. The surface in a gated URL is UNFORGEABLE — otherwise the two-key
 *      predicate is asked the attacker's question instead of the page's.
 *   3. Predicate-denied ⇒ denied at the byte level, with no fallback to the
 *      unguarded original.
 *   4. Watermark-required ⇒ the BAKED derivative, never the original; and when
 *      no derivative exists, a refusal rather than the bare file.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  mediaPublicUrl,
  mediaUrlForAsset,
  pickBestThumbs,
  type TalentThumbCandidate,
} from "@/app/(workspace)/[tenantSlug]/_data-bridge/talent-card-thumbs";
import { resolveGatedMediaAccess } from "./gated-media-access";
import {
  GATED_MEDIA_CDN_MAX_AGE_SECONDS,
  GATED_MEDIA_ROUTE,
  GATED_MEDIA_SIGNED_URL_TTL_SECONDS,
  gatedMediaPath,
  isPrivateMediaAccessEnabled,
  verifyGatedMediaRequest,
} from "./private-access";

const TENANT_A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const TENANT_B = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const ASSET = "dddddddd-dddd-dddd-dddd-dddddddddddd";
const TALENT = "cccccccc-cccc-cccc-cccc-cccccccccccc";

const FLAG = "MEDIA_PRIVATE_ACCESS_ENABLED";
const SECRET = "MEDIA_URL_SIGNING_SECRET";

/** Set both env vars for the duration of `fn`, restoring whatever was there. */
function withEnv<T>(vars: Record<string, string | undefined>, fn: () => T): T {
  const prev: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(vars)) {
    prev[key] = process.env[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  try {
    return fn();
  } finally {
    for (const [key, value] of Object.entries(prev)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

/** Gating ON, with a signing secret present. */
function withGating<T>(fn: () => T): T {
  return withEnv({ [FLAG]: "1", [SECRET]: "test-secret-do-not-ship" }, fn);
}

/** Enough of a Supabase client for URL building. */
const urlClient = {
  storage: {
    from() {
      return {
        getPublicUrl: (p: string) => ({ data: { publicUrl: `https://cdn.test/${p}` } }),
      };
    },
  },
} as unknown as SupabaseClient;

// ─── 1. the flag ────────────────────────────────────────────────────────────

test("the flag is OFF unless explicitly enabled", () => {
  const secret = { [SECRET]: "s" };
  withEnv({ ...secret, [FLAG]: undefined }, () =>
    assert.equal(isPrivateMediaAccessEnabled(), false),
  );
  withEnv({ ...secret, [FLAG]: "" }, () => assert.equal(isPrivateMediaAccessEnabled(), false));
  withEnv({ ...secret, [FLAG]: "0" }, () => assert.equal(isPrivateMediaAccessEnabled(), false));
  withEnv({ ...secret, [FLAG]: "yes" }, () => assert.equal(isPrivateMediaAccessEnabled(), false));
  withEnv({ ...secret, [FLAG]: "1" }, () => assert.equal(isPrivateMediaAccessEnabled(), true));
  withEnv({ ...secret, [FLAG]: "true" }, () => assert.equal(isPrivateMediaAccessEnabled(), true));
});

test("a flag with no signing secret degrades to today's behavior, not to a blank site", () => {
  withEnv({ [FLAG]: "1", [SECRET]: undefined }, () => {
    assert.equal(isPrivateMediaAccessEnabled(), false);
    assert.equal(gatedMediaPath(ASSET, TENANT_A), null);
  });
});

// ─── 2. flag-off equivalence (the ship-safety guarantee) ────────────────────

test("flag OFF: mediaUrlForAsset is byte-identical to mediaPublicUrl", () => {
  const paths = [
    "tenant/abc/photo.jpg",
    "nested/deep/path with space.png",
    "https://i.pravatar.cc/300",
    "/demo/portrait-01.jpg",
  ];
  withEnv({ [FLAG]: undefined, [SECRET]: "s" }, () => {
    for (const path of paths) {
      assert.equal(
        mediaUrlForAsset(urlClient, { assetId: ASSET, storagePath: path, surface: TENANT_A }),
        mediaPublicUrl(urlClient, path),
        `flag-off URL drifted for ${path}`,
      );
    }
  });
});

test("flag ON but no surface known: still byte-identical to mediaPublicUrl", () => {
  // The workspace-internal thumb callers are in this position. Gating them
  // against a surface nobody resolved would blank the admin UI.
  withGating(() => {
    assert.equal(
      mediaUrlForAsset(urlClient, { assetId: ASSET, storagePath: "t/a.jpg" }),
      mediaPublicUrl(urlClient, "t/a.jpg"),
    );
  });
});

test("flag ON: absolute and root-relative paths are never gated", () => {
  withGating(() => {
    for (const path of ["https://i.pravatar.cc/300", "/demo/portrait-01.jpg"]) {
      assert.equal(
        mediaUrlForAsset(urlClient, { assetId: ASSET, storagePath: path, surface: TENANT_A }),
        path,
      );
    }
  });
});

test("pickBestThumbs without a surface is byte-identical with the flag on or off", () => {
  const candidates: TalentThumbCandidate[] = [
    { id: ASSET, owner_talent_profile_id: TALENT, storage_path: "t/card.jpg", variant_kind: "card" },
    { id: "x", owner_talent_profile_id: TALENT, storage_path: "t/hero.jpg", variant_kind: "hero" },
  ];
  const off = withEnv({ [FLAG]: undefined, [SECRET]: "s" }, () =>
    pickBestThumbs(urlClient, candidates),
  );
  const on = withGating(() => pickBestThumbs(urlClient, candidates));
  assert.deepEqual([...on], [...off]);
  assert.equal(off.get(TALENT), "https://cdn.test/t/card.jpg");
});

test("pickBestThumbs WITH a surface routes through the gate once the flag is on", () => {
  const candidates: TalentThumbCandidate[] = [
    { id: ASSET, owner_talent_profile_id: TALENT, storage_path: "t/card.jpg", variant_kind: "card" },
  ];
  const url = withGating(() => pickBestThumbs(urlClient, candidates, TENANT_A).get(TALENT));
  assert.ok(url?.startsWith(`${GATED_MEDIA_ROUTE}/${ASSET}?`), url);
  assert.ok(url?.includes(`s=${TENANT_A}`), url);
});

// ─── 3. the surface is unforgeable ──────────────────────────────────────────

test("a minted URL verifies back to the surface it was minted for", () => {
  withGating(() => {
    const url = gatedMediaPath(ASSET, TENANT_A);
    assert.ok(url);
    const params = new URLSearchParams(url.split("?")[1]);
    assert.deepEqual(
      verifyGatedMediaRequest(ASSET, { surface: params.get("s"), signature: params.get("k") }),
      { surface: TENANT_A },
    );
  });
});

test("the master surface round-trips as null and does not collide with a tenant", () => {
  withGating(() => {
    const url = gatedMediaPath(ASSET, null);
    assert.ok(url);
    const params = new URLSearchParams(url.split("?")[1]);
    assert.equal(params.get("s"), null, "master surface must not carry a tenant param");
    assert.deepEqual(
      verifyGatedMediaRequest(ASSET, { surface: null, signature: params.get("k") }),
      { surface: null },
    );
    // A tenant literally named "master" must not verify against that signature.
    assert.equal(
      verifyGatedMediaRequest(ASSET, { surface: "master", signature: params.get("k") }),
      null,
    );
  });
});

test("swapping the surface, the asset, or the signature is refused", () => {
  withGating(() => {
    const signature = new URLSearchParams(gatedMediaPath(ASSET, TENANT_A)!.split("?")[1]).get("k");

    // The whole point: an attacker naming the OWNING tenant is the trivial
    // bypass an unsigned query param would have handed over.
    assert.equal(verifyGatedMediaRequest(ASSET, { surface: TENANT_B, signature }), null);
    assert.equal(verifyGatedMediaRequest("other-asset", { surface: TENANT_A, signature }), null);
    assert.equal(verifyGatedMediaRequest(ASSET, { surface: TENANT_A, signature: null }), null);
    assert.equal(verifyGatedMediaRequest(ASSET, { surface: TENANT_A, signature: "short" }), null);
    assert.equal(
      verifyGatedMediaRequest(ASSET, { surface: TENANT_A, signature: `${signature}extra` }),
      null,
    );
  });
});

test("a URL minted under one secret does not verify under another", () => {
  const url = withEnv({ [FLAG]: "1", [SECRET]: "secret-one" }, () =>
    gatedMediaPath(ASSET, TENANT_A),
  );
  const signature = new URLSearchParams(url!.split("?")[1]).get("k");
  withEnv({ [FLAG]: "1", [SECRET]: "secret-two" }, () => {
    assert.equal(verifyGatedMediaRequest(ASSET, { surface: TENANT_A, signature }), null);
  });
});

test("a cached redirect can never outlive the signature it points at", () => {
  assert.ok(
    GATED_MEDIA_CDN_MAX_AGE_SECONDS <= GATED_MEDIA_SIGNED_URL_TTL_SECONDS,
    "s-maxage must stay <= the signed-URL TTL or every cached image breaks",
  );
});

// ─── 4. the byte-level verdict ──────────────────────────────────────────────

type StubOptions = {
  asset?: { id: string; storage_path: string | null; bucket_id?: string | null } | null;
  /** Asset ids the two-key predicate allows on the asked surface. */
  presentable?: string[];
  /** Asset ids an active grant says may only travel watermarked. */
  watermarkRequired?: string[];
  /** source asset id → baked derivative path. */
  derivatives?: Record<string, string>;
  /** Simulate the predicate being unavailable. */
  rpcError?: boolean;
};

function makeClient(options: StubOptions) {
  const rpcCalls: string[] = [];
  const chainFor = (rows: unknown[], single: unknown) => {
    const chain: Record<string, unknown> = {};
    for (const method of ["select", "eq", "in", "is", "order"]) chain[method] = () => chain;
    chain.maybeSingle = () => Promise.resolve({ data: single, error: null });
    chain.then = (resolve: (v: { data: unknown[]; error: null }) => unknown) =>
      resolve({ data: rows, error: null });
    return chain;
  };

  const client = {
    from(table: string) {
      if (table !== "media_assets") return chainFor([], null);
      const rows = Object.entries(options.derivatives ?? {}).map(([source, path]) => ({
        source_media_asset_id: source,
        storage_path: path,
      }));
      return chainFor(rows, options.asset ?? null);
    },
    rpc(fn: string, args: Record<string, unknown>) {
      rpcCalls.push(fn);
      if (options.rpcError) return Promise.resolve({ data: null, error: { message: "boom" } });
      const ids = (args.p_asset_ids as string[]) ?? [];
      const set =
        fn === "media_assets_watermark_required_on_tenant"
          ? (options.watermarkRequired ?? [])
          : (options.presentable ?? ids);
      return Promise.resolve({
        data: ids.filter((id) => set.includes(id)).map((asset_id) => ({ asset_id })),
        error: null,
      });
    },
  };
  return { client: client as unknown as SupabaseClient, rpcCalls };
}

const LIVE_ASSET = { id: ASSET, storage_path: "t/original.jpg", bucket_id: "media-public" };

test("the predicate allows it: the original is served from its own bucket", async () => {
  const { client, rpcCalls } = makeClient({ asset: LIVE_ASSET, presentable: [ASSET] });
  const decision = await resolveGatedMediaAccess(client, { assetId: ASSET, surface: TENANT_A });
  assert.deepEqual(decision, {
    ok: true,
    bucket: "media-public",
    storagePath: "t/original.jpg",
    watermarked: false,
  });
  // Reused, not re-derived: the byte gate asks the same SQL predicate the
  // render path asks.
  assert.ok(rpcCalls.includes("media_assets_presentable_on_tenant"));
});

test("predicate-denied is denied at the byte level, with no fallback to the original", async () => {
  const { client } = makeClient({ asset: LIVE_ASSET, presentable: [] });
  const decision = await resolveGatedMediaAccess(client, { assetId: ASSET, surface: TENANT_B });
  assert.deepEqual(decision, { ok: false, reason: "not_presentable" });
});

test("a predicate outage denies — a gate that opens when its check is down is not a gate", async () => {
  const { client } = makeClient({ asset: LIVE_ASSET, rpcError: true });
  const decision = await resolveGatedMediaAccess(client, { assetId: ASSET, surface: TENANT_A });
  assert.deepEqual(decision, { ok: false, reason: "not_presentable" });
});

test("a missing or deleted asset is not found", async () => {
  const { client } = makeClient({ asset: null, presentable: [ASSET] });
  assert.deepEqual(await resolveGatedMediaAccess(client, { assetId: ASSET, surface: null }), {
    ok: false,
    reason: "asset_not_found",
  });
});

test("watermark-required serves the BAKED derivative and never the original", async () => {
  const { client } = makeClient({
    asset: LIVE_ASSET,
    presentable: [ASSET],
    watermarkRequired: [ASSET],
    derivatives: { [ASSET]: "t/original-watermarked.jpg" },
  });
  const decision = await resolveGatedMediaAccess(client, { assetId: ASSET, surface: TENANT_B });
  assert.deepEqual(decision, {
    ok: true,
    bucket: "media-public",
    storagePath: "t/original-watermarked.jpg",
    watermarked: true,
  });
  assert.ok(decision.ok && decision.storagePath !== LIVE_ASSET.storage_path);
});

test("watermark-required with no baked derivative refuses, rather than leaking the bare file", async () => {
  const { client } = makeClient({
    asset: LIVE_ASSET,
    presentable: [ASSET],
    watermarkRequired: [ASSET],
    derivatives: {},
  });
  assert.deepEqual(await resolveGatedMediaAccess(client, { assetId: ASSET, surface: TENANT_B }), {
    ok: false,
    reason: "watermark_unavailable",
  });
});
