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
  filterPresentableAssetIds,
  hubTalentMediaTag,
  isPerHubFacesEnabled,
  isTwoKeyGrantsEnabled,
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

function makeClient(tables: StubTables, options: RpcOptions = {}) {
  const queried: string[] = [];
  const rpcCalls: Array<{ fn: string; args: Record<string, unknown> }> = [];
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
    /**
     * The two-key predicate lives in SQL, so the resolver reaches it by RPC.
     * `presentable` lists the ids the rule allows; `rpcError` simulates the
     * predicate being unavailable, which must FAIL OPEN.
     */
    rpc(fn: string, args: Record<string, unknown>) {
      rpcCalls.push({ fn, args });
      if (options.rpcError) return Promise.resolve({ data: null, error: { message: "boom" } });
      const ids = (args.p_asset_ids as string[]) ?? [];
      // Phase 4: a SECOND predicate rides the same resolver. It answers about
      // watermark conditions, and defaults to "no conditions" so every
      // pre-phase-4 expectation in this file still describes today's product.
      if (fn === "media_assets_watermark_required_on_tenant") {
        const marked = options.watermarkRequired ?? [];
        return Promise.resolve({
          data: ids.filter((id) => marked.includes(id)).map((asset_id) => ({ asset_id })),
          error: null,
        });
      }
      const allowed = options.presentable ?? ids;
      return Promise.resolve({
        data: ids.filter((id) => allowed.includes(id)).map((asset_id) => ({ asset_id })),
        error: null,
      });
    },
    storage: {
      from() {
        return {
          getPublicUrl: (p: string) => ({ data: { publicUrl: `https://cdn.test/${p}` } }),
        };
      },
    },
  };
  return { client: client as unknown as SupabaseClient, queried, rpcCalls };
}

type RpcOptions = {
  presentable?: string[];
  rpcError?: boolean;
  /** Phase 4 — asset ids an active owner grant says may only travel marked. */
  watermarkRequired?: string[];
};

const GRANTS_FLAG = "MEDIA_TWO_KEY_GRANTS_ENABLED";

function withGrantsFlag<T>(value: string | undefined, fn: () => T): T {
  const prev = process.env[GRANTS_FLAG];
  if (value === undefined) delete process.env[GRANTS_FLAG];
  else process.env[GRANTS_FLAG] = value;
  try {
    return fn();
  } finally {
    if (prev === undefined) delete process.env[GRANTS_FLAG];
    else process.env[GRANTS_FLAG] = prev;
  }
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

// ─── 4. phase 3 — the two-key rule ──────────────────────────────────────────

test("the grants flag is OFF unless explicitly enabled", () => {
  withGrantsFlag(undefined, () => assert.equal(isTwoKeyGrantsEnabled(), false));
  withGrantsFlag("0", () => assert.equal(isTwoKeyGrantsEnabled(), false));
  withGrantsFlag("yes", () => assert.equal(isTwoKeyGrantsEnabled(), false));
  withGrantsFlag("1", () => assert.equal(isTwoKeyGrantsEnabled(), true));
  withGrantsFlag("true", () => assert.equal(isTwoKeyGrantsEnabled(), true));
});

test("both flags OFF ⇒ the predicate is never consulted", async () => {
  const { client, rpcCalls } = makeClient({
    media_assets: [
      { id: "a1", owner_talent_profile_id: TALENT, storage_path: "d.jpg", variant_kind: "card" },
    ],
  });

  const out = await withFlag(undefined, () =>
    withGrantsFlag(undefined, () => resolveTalentCardThumbsForHub(client, [TALENT], TENANT_A)),
  );

  assert.equal(out.get(TALENT), "https://cdn.test/d.jpg");
  assert.deepEqual(rpcCalls, [], "production today must not call the predicate at all");
});

test("enforcement ON with NO grant rows still shows today's media", async () => {
  // The whole non-breaking claim: the SQL predicate's IMPLICIT defaults pass
  // every asset that renders today, so an empty media_grants table is a no-op.
  // Modelled here by the predicate allowing everything it is asked about.
  const { client } = makeClient({
    media_assets: [
      { id: "a1", owner_talent_profile_id: TALENT, storage_path: "d.jpg", variant_kind: "card" },
    ],
  });

  const out = await withGrantsFlag("1", () =>
    resolveTalentCardThumbsForHub(client, [TALENT], TENANT_A),
  );

  assert.equal(out.get(TALENT), "https://cdn.test/d.jpg", "no grants must not blank a card");
});

test("a forbidden candidate falls through to the next allowed variant", async () => {
  // 'card' outranks 'hero', but the rule forbids the card crop on this hub —
  // the talent must get their allowed hero shot, NOT a blank card.
  const { client } = makeClient(
    {
      media_assets: [
        { id: "card-1", owner_talent_profile_id: TALENT, storage_path: "card.jpg", variant_kind: "card" },
        { id: "hero-1", owner_talent_profile_id: TALENT, storage_path: "hero.jpg", variant_kind: "hero" },
      ],
    },
    { presentable: ["hero-1"] },
  );

  const out = await withGrantsFlag("1", () =>
    resolveTalentCardThumbsForHub(client, [TALENT], TENANT_A),
  );

  assert.equal(out.get(TALENT), "https://cdn.test/hero.jpg");
});

test("REVOCATION un-publishes on every surface at once", async () => {
  // The phase 3 risk in the plan: a revoke must un-publish EVERYWHERE. It does,
  // because every surface reads this one resolver. Same asset, three surfaces,
  // one predicate answer — before and after the grant is pulled.
  const tables: StubTables = {
    media_assets: [
      { id: "released-1", owner_talent_profile_id: TALENT, storage_path: "impronta.jpg", variant_kind: "card" },
    ],
  };
  const surfaces: Array<string | null> = [TENANT_A, TENANT_B, null];

  // While the grant is live, the photo resolves on every surface.
  for (const surface of surfaces) {
    const { client } = makeClient(tables, { presentable: ["released-1"] });
    const out = await withGrantsFlag("1", () =>
      resolveTalentCardThumbsForHub(client, [TALENT], surface),
    );
    assert.equal(
      out.get(TALENT),
      "https://cdn.test/impronta.jpg",
      `granted photo should resolve on ${surface ?? "master"}`,
    );
  }

  // After the revoke the predicate allows nothing — and no surface keeps it.
  for (const surface of surfaces) {
    const { client } = makeClient(tables, { presentable: [] });
    const out = await withGrantsFlag("1", () =>
      resolveTalentCardThumbsForHub(client, [TALENT], surface),
    );
    assert.equal(
      out.get(TALENT),
      undefined,
      `revoked photo must NOT resolve on ${surface ?? "master"}`,
    );
  }
});

test("a curated pick the rule forbids falls back instead of blanking", async () => {
  // Staff curation does not override the subject: a curated-but-forbidden
  // asset drops out, and the talent falls back to a photo they MAY show.
  const { client } = makeClient(
    {
      agency_talent_overlays: [{ talent_profile_id: TALENT, cover_media_asset_id: "curated-1" }],
      agency_talent_media: [
        { talent_profile_id: TALENT, agency_media_id: "curated-1", display_order: 10 },
      ],
      media_assets: [
        { id: "own-1", owner_talent_profile_id: TALENT, storage_path: "own.jpg", variant_kind: "card" },
      ],
    },
    { presentable: ["own-1"] },
  );

  const out = await withFlag("1", () =>
    withGrantsFlag("1", () =>
      resolveTalentMediaForHub(client, { tenantId: TENANT_A, talentProfileIds: [TALENT] }),
    ),
  );

  assert.equal(out.get(TALENT)?.source, "default");
  assert.equal(out.get(TALENT)?.coverUrl, "https://cdn.test/own.jpg");
});

test("the predicate is asked about the RIGHT surface", async () => {
  const { client, rpcCalls } = makeClient({
    media_assets: [
      { id: "a1", owner_talent_profile_id: TALENT, storage_path: "d.jpg", variant_kind: "card" },
    ],
  });

  await withGrantsFlag("1", () => resolveTalentCardThumbsForHub(client, [TALENT], null));

  assert.equal(rpcCalls[0]?.fn, "media_assets_presentable_on_tenant");
  assert.equal(rpcCalls[0]?.args.p_tenant_id, null, "master surface must be asked as null");
});

test("filterPresentableAssetIds FAILS CLOSED when the predicate errors", async () => {
  // Batch A / A3. This assertion used to say the opposite. The privacy
  // predicate is the only thing between an un-consented photo and a third hub,
  // and Supabase throttling is chronic on this tier — failing open meant a
  // transient blip PUBLISHED photos nobody released, with no trace. A blank
  // card is recoverable; a leaked photo is not.
  const { client } = makeClient({}, { rpcError: true });
  const allowed = await filterPresentableAssetIds(client, ["a", "b"], TENANT_A);
  assert.deepEqual([...allowed], [], "an unavailable predicate must permit nothing");
});

test("a predicate outage degrades a card to initials, never to a leak", async () => {
  // The whole-resolver view of the same rule: with the predicate down, the
  // candidate rank has nothing left to pick from, so the card resolves no URL
  // rather than serving an unvetted photo.
  const { client } = makeClient(
    {
      media_assets: [
        { id: "a1", owner_talent_profile_id: TALENT, storage_path: "d.jpg", variant_kind: "card" },
      ],
    },
    { rpcError: true },
  );

  const out = await withGrantsFlag("1", () =>
    resolveTalentCardThumbsForHub(client, [TALENT], TENANT_B),
  );

  assert.equal(out.get(TALENT), undefined);
});

test("the watermark path still fails OPEN — only the privacy path closed", async () => {
  // The two must not be conflated. A watermark-predicate outage means "no
  // conditions known", which leaves an already-permitted photo rendering. Only
  // the two-key predicate blanks on error.
  const { client } = makeClient({
    media_assets: [
      { id: "a1", owner_talent_profile_id: TALENT, storage_path: "d.jpg", variant_kind: "card" },
    ],
  });

  const out = await withGrantsFlag("1", () =>
    resolveTalentCardThumbsForHub(client, [TALENT], TENANT_A),
  );

  assert.equal(out.get(TALENT), "https://cdn.test/d.jpg");
});

test("filterPresentableAssetIds drops what the predicate rejects", async () => {
  const { client } = makeClient({}, { presentable: ["a"] });
  const allowed = await filterPresentableAssetIds(client, ["a", "b"], TENANT_A);
  assert.deepEqual([...allowed], ["a"]);
});

// ─── 5. phase 4 — watermark-on-release ──────────────────────────────────────

test("a release with no watermark condition is untouched", async () => {
  const { client, rpcCalls } = makeClient({
    media_assets: [
      { id: "a1", owner_talent_profile_id: TALENT, storage_path: "d.jpg", variant_kind: "card" },
    ],
  });

  const out = await withGrantsFlag("1", () =>
    resolveTalentCardThumbsForHub(client, [TALENT], TENANT_A),
  );

  assert.equal(out.get(TALENT), "https://cdn.test/d.jpg");
  assert.ok(
    rpcCalls.some((c) => c.fn === "media_assets_watermark_required_on_tenant"),
    "the watermark condition must be asked about, never assumed absent",
  );
});

test("a watermark-required photo serves the BAKED derivative, not the original", async () => {
  const { client } = makeClient(
    {
      media_assets: [
        { id: "a1", owner_talent_profile_id: TALENT, storage_path: "d.jpg", variant_kind: "card" },
        // The bake that ran at approval time.
        {
          id: "wm1",
          source_media_asset_id: "a1",
          storage_path: "wm/a1.jpg",
          variant_kind: "watermarked",
        },
      ],
    },
    { watermarkRequired: ["a1"] },
  );

  const out = await withGrantsFlag("1", () =>
    resolveTalentCardThumbsForHub(client, [TALENT], TENANT_B),
  );

  assert.equal(out.get(TALENT), "https://cdn.test/wm/a1.jpg");
});

test("a watermark-required photo with NO bake is not served at all", async () => {
  // Fails CLOSED on purpose: serving the bare original would break the promise
  // the owning workspace made when it required a watermark.
  const { client } = makeClient(
    {
      media_assets: [
        { id: "a1", owner_talent_profile_id: TALENT, storage_path: "d.jpg", variant_kind: "card" },
      ],
    },
    { watermarkRequired: ["a1"] },
  );

  const out = await withGrantsFlag("1", () =>
    resolveTalentCardThumbsForHub(client, [TALENT], TENANT_B),
  );

  assert.equal(out.get(TALENT), undefined);
});

test("the watermark predicate is asked about the SAME surface as the two-key one", async () => {
  const { client, rpcCalls } = makeClient({
    media_assets: [
      { id: "a1", owner_talent_profile_id: TALENT, storage_path: "d.jpg", variant_kind: "card" },
    ],
  });

  await withGrantsFlag("1", () => resolveTalentCardThumbsForHub(client, [TALENT], null));

  const surfaces = new Set(rpcCalls.map((c) => c.args.p_tenant_id));
  assert.deepEqual([...surfaces], [null], "the master surface must not leak a tenant id");
});
