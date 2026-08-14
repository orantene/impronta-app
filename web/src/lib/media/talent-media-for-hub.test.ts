/**
 * talent-media-for-hub.test.ts — phase 2 invariants for the per-hub resolver.
 *
 * Run: NODE_OPTIONS='--require ./scripts/register-server-only-test.cjs' \
 *      node_modules/.bin/tsx --test src/lib/media/talent-media-for-hub.test.ts
 *
 * The three things that must never regress:
 *   1. flag OFF ⇒ byte-identical to today's global rank (no curation query),
 *   2. a hub's curated face is keyed on (tenant, talent) — NEVER on talent
 *      alone (the resolveCardDesign cache-key lesson),
 *   3. curation precedence: overlay cover > lowest display_order > default.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  hubTalentMediaTag,
  isPerHubFacesEnabled,
  pickHubCoverAssetIds,
  resolveTalentCardThumbsForHub,
  resolveTalentMediaForHub,
} from "./talent-media-for-hub";

const TENANT_A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const TENANT_B = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const TALENT = "cccccccc-cccc-cccc-cccc-cccccccccccc";

const FLAG = "MEDIA_PER_HUB_FACES_ENABLED";

function withFlag<T>(value: string | undefined, fn: () => T): T {
  const prev = process.env[FLAG];
  if (value === undefined) delete process.env[FLAG];
  else process.env[FLAG] = value;
  try {
    return fn();
  } finally {
    if (prev === undefined) delete process.env[FLAG];
    else process.env[FLAG] = prev;
  }
}

// ─── a minimal chainable Supabase stub ──────────────────────────────────────

type StubTables = {
  agency_talent_overlays?: unknown[];
  agency_talent_media?: unknown[];
  media_assets?: unknown[];
};

function makeClient(tables: StubTables) {
  const queried: string[] = [];
  const builder = (rows: unknown[]) => {
    const chain: Record<string, unknown> = {};
    for (const method of ["select", "eq", "in", "is", "order", "neq"]) {
      chain[method] = () => chain;
    }
    // Awaiting the builder resolves to the PostgREST-shaped result.
    chain.then = (resolve: (v: { data: unknown[]; error: null }) => unknown) =>
      resolve({ data: rows, error: null });
    return chain;
  };
  const client = {
    from(table: string) {
      queried.push(table);
      return builder((tables as Record<string, unknown[] | undefined>)[table] ?? []);
    },
    storage: {
      from() {
        return {
          getPublicUrl: (p: string) => ({ data: { publicUrl: `https://cdn.test/${p}` } }),
        };
      },
    },
  };
  return { client: client as unknown as SupabaseClient, queried };
}

// ─── 1. the flag ────────────────────────────────────────────────────────────

test("the flag is OFF unless explicitly enabled", () => {
  withFlag(undefined, () => assert.equal(isPerHubFacesEnabled(), false));
  withFlag("", () => assert.equal(isPerHubFacesEnabled(), false));
  withFlag("0", () => assert.equal(isPerHubFacesEnabled(), false));
  withFlag("yes", () => assert.equal(isPerHubFacesEnabled(), false));
  withFlag("1", () => assert.equal(isPerHubFacesEnabled(), true));
  withFlag("true", () => assert.equal(isPerHubFacesEnabled(), true));
});

test("flag OFF never reads the curation tables and returns the global rank", async () => {
  const { client, queried } = makeClient({
    agency_talent_overlays: [{ talent_profile_id: TALENT, cover_media_asset_id: "curated" }],
    agency_talent_media: [
      { talent_profile_id: TALENT, agency_media_id: "curated", display_order: 10 },
    ],
    media_assets: [
      { owner_talent_profile_id: TALENT, storage_path: "default.jpg", variant_kind: "card" },
    ],
  });

  const out = await withFlag(undefined, () =>
    resolveTalentCardThumbsForHub(client, [TALENT], TENANT_A),
  );

  assert.equal(out.get(TALENT), "https://cdn.test/default.jpg");
  assert.deepEqual(queried, ["media_assets"], "curation tables must not be touched");
});

// ─── 2. tenant separation ───────────────────────────────────────────────────

test("the cache tag separates hubs for the SAME talent", () => {
  const a = hubTalentMediaTag(TENANT_A, TALENT);
  const b = hubTalentMediaTag(TENANT_B, TALENT);
  assert.notEqual(a, b, "one talent must not share a media cache key across hubs");
  assert.ok(a.includes(TENANT_A) && a.includes(TALENT));
  assert.ok(b.includes(TENANT_B));
  // Stable shape — busting code depends on it.
  assert.equal(a, `tenant:${TENANT_A}:talent-media:${TALENT}`);
});

test("the master surface (tenantId null) never picks up a hub's curation", async () => {
  const { client, queried } = makeClient({
    agency_talent_overlays: [{ talent_profile_id: TALENT, cover_media_asset_id: "curated" }],
    media_assets: [
      { owner_talent_profile_id: TALENT, storage_path: "default.jpg", variant_kind: "card" },
    ],
  });

  const out = await withFlag("1", () => resolveTalentCardThumbsForHub(client, [TALENT], null));

  assert.equal(out.get(TALENT), "https://cdn.test/default.jpg");
  assert.deepEqual(queried, ["media_assets"]);
});

// ─── 3. curation precedence ─────────────────────────────────────────────────

test("overlay cover outranks display_order, which outranks nothing", () => {
  const picked = pickHubCoverAssetIds(
    [{ talent_profile_id: "t1", cover_media_asset_id: "cover-1" }],
    [
      { talent_profile_id: "t1", agency_media_id: "ordered-1", display_order: 10 },
      { talent_profile_id: "t2", agency_media_id: "ordered-b", display_order: 30 },
      { talent_profile_id: "t2", agency_media_id: "ordered-a", display_order: 20 },
    ],
  );
  assert.equal(picked.get("t1"), "cover-1", "explicit cover wins");
  assert.equal(picked.get("t2"), "ordered-a", "lowest display_order wins");
  assert.equal(picked.get("t3"), undefined, "uncurated talents fall through");
});

test("a null overlay cover does not erase the ordered pick", () => {
  const picked = pickHubCoverAssetIds(
    [{ talent_profile_id: "t1", cover_media_asset_id: null }],
    [{ talent_profile_id: "t1", agency_media_id: "ordered-1", display_order: 10 }],
  );
  assert.equal(picked.get("t1"), "ordered-1");
});

test("flag ON with curation serves the curated face and reports its source", async () => {
  const { client } = makeClient({
    agency_talent_overlays: [{ talent_profile_id: TALENT, cover_media_asset_id: "asset-9" }],
    agency_talent_media: [
      { talent_profile_id: TALENT, agency_media_id: "asset-9", display_order: 10 },
    ],
    media_assets: [{ id: "asset-9", storage_path: "impronta/shoot.jpg" }],
  });

  const out = await withFlag("1", () =>
    resolveTalentMediaForHub(client, { tenantId: TENANT_A, talentProfileIds: [TALENT] }),
  );

  const media = out.get(TALENT);
  assert.equal(media?.coverUrl, "https://cdn.test/impronta/shoot.jpg");
  assert.equal(media?.source, "curation");
  assert.deepEqual(media?.assetIds, ["asset-9"]);
});

test("flag ON with NO curation degrades to the global rank", async () => {
  const { client } = makeClient({
    media_assets: [
      { owner_talent_profile_id: TALENT, storage_path: "default.jpg", variant_kind: "hero" },
    ],
  });

  const out = await withFlag("1", () =>
    resolveTalentMediaForHub(client, { tenantId: TENANT_A, talentProfileIds: [TALENT] }),
  );

  const media = out.get(TALENT);
  assert.equal(media?.source, "default");
  assert.equal(media?.coverUrl, "https://cdn.test/default.jpg");
});

test("a curated asset that no longer resolves falls back instead of blanking", async () => {
  const { client } = makeClient({
    agency_talent_overlays: [{ talent_profile_id: TALENT, cover_media_asset_id: "deleted" }],
    // media_assets returns the same stub rows for both the asset-url lookup and
    // the fallback rank query; the asset-url lookup finds no matching id.
    media_assets: [
      { owner_talent_profile_id: TALENT, storage_path: "default.jpg", variant_kind: "card" },
    ],
  });

  const out = await withFlag("1", () =>
    resolveTalentMediaForHub(client, { tenantId: TENANT_A, talentProfileIds: [TALENT] }),
  );

  assert.equal(out.get(TALENT)?.coverUrl, "https://cdn.test/default.jpg");
  assert.equal(out.get(TALENT)?.source, "default");
});

test("empty input short-circuits", async () => {
  const { client, queried } = makeClient({});
  const out = await resolveTalentMediaForHub(client, {
    tenantId: TENANT_A,
    talentProfileIds: [null, undefined],
  });
  assert.equal(out.size, 0);
  assert.deepEqual(queried, []);
});
