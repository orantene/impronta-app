/**
 * private-access.test.ts — P0-1 invariants for gated media access.
 *
 * Run: NODE_OPTIONS='--require ./scripts/register-server-only-test.cjs' \
 *      node_modules/.bin/tsx --test src/lib/media/private-access.test.ts
 *
 * The five things that must never regress:
 *   0. The PRECEDENCE between the platform setting, the env override, and the
 *      signing secret — all 18 combinations, because the on/off decision moved
 *      out of the environment and a wrong cell here either blanks every photo
 *      on the platform or leaves revocation unenforced.
 *   1. GATING OFF ⇒ every URL is byte-identical to the pre-P0-1 public URL, and
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
  __resetPrivateMediaWarning,
  gatedMediaPath,
  parseGatedMediaPath,
  readPrivateMediaEnvOverride,
  resolvePrivateMediaAccess,
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

/**
 * The path segments a catch-all route would hand the verifier, derived from a
 * minted URL the same way Next derives them: strip the route prefix, split on
 * `/`, percent-decode each segment.
 *
 * Deliberately goes through `new URL()` so that a minted URL which smuggled in
 * a query string would surface here as a segment containing `?` rather than
 * being quietly tolerated.
 */
function segmentsOf(url: string): string[] {
  const parsed = new URL(url, "http://n");
  assert.equal(parsed.search, "", `gated URLs must carry no query string: ${url}`);
  return parsed.pathname
    .slice(`${GATED_MEDIA_ROUTE}/`.length)
    .split("/")
    .map(decodeURIComponent);
}

/**
 * Gating ON the way the owner turns it on: the PLATFORM SETTING is true, the
 * env override is unset, and a signing secret is configured. `fn` receives the
 * resolved boolean, which is what render paths thread down to `gatedMediaPath`.
 */
function withGating<T>(fn: (enabled: boolean) => T): T {
  return withEnv({ [FLAG]: undefined, [SECRET]: "test-secret-do-not-ship" }, () => {
    const state = resolvePrivateMediaAccess(true);
    assert.equal(state.enabled, true, "fixture is meant to resolve ON");
    return fn(state.enabled);
  });
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

// ─── 0. the precedence table ────────────────────────────────────────────────
//
// The on/off decision moved out of the environment and into
// `platform_settings.media_private_access_enabled`, with the env var kept as a
// two-way override. Every cell of setting × env × secret is asserted below,
// because a wrong cell either blanks every photo on the platform or leaves
// revocation quietly unenforced. The table is the module header's, verbatim.

/** `resolvePrivateMediaAccess` under a specific environment. */
function resolveWith(
  setting: boolean,
  env: string | undefined,
  secret: string | undefined,
): ReturnType<typeof resolvePrivateMediaAccess> {
  return withEnv({ [FLAG]: env, [SECRET]: secret }, () => resolvePrivateMediaAccess(setting));
}

const ENV_UNSET = [undefined, "", "yes", "maybe"] as const;
const ENV_ON = ["1", "true", "TRUE", " true "] as const;
const ENV_OFF = ["0", "false", "FALSE", " 0 "] as const;

test("env override parsing: on, off, and everything else means 'not my call'", () => {
  for (const v of ENV_ON) {
    assert.equal(withEnv({ [FLAG]: v }, readPrivateMediaEnvOverride), true, v);
  }
  for (const v of ENV_OFF) {
    assert.equal(withEnv({ [FLAG]: v }, readPrivateMediaEnvOverride), false, v);
  }
  for (const v of ENV_UNSET) {
    assert.equal(withEnv({ [FLAG]: v }, readPrivateMediaEnvOverride), null, String(v));
  }
});

test("env unset: the PLATFORM SETTING decides, and the secret can veto it", () => {
  for (const env of ENV_UNSET) {
    // setting ON + secret present ⇒ the only ON row.
    assert.deepEqual(resolveWith(true, env, "s"), {
      enabled: true,
      settingEnabled: true,
      secretConfigured: true,
      envOverride: null,
      reason: "active",
    });
    // setting ON + secret MISSING ⇒ off, and named as such. This is production.
    assert.deepEqual(resolveWith(true, env, undefined), {
      enabled: false,
      settingEnabled: true,
      secretConfigured: false,
      envOverride: null,
      reason: "missing_secret",
    });
    // setting OFF ⇒ off whatever the secret says.
    for (const secret of ["s", undefined]) {
      assert.deepEqual(resolveWith(false, env, secret), {
        enabled: false,
        settingEnabled: false,
        secretConfigured: secret !== undefined,
        envOverride: null,
        reason: "setting_off",
      });
    }
  }
});

test("env=1 force-ENABLES regardless of the setting (the pre-existing contract)", () => {
  for (const env of ENV_ON) {
    for (const setting of [true, false]) {
      assert.deepEqual(resolveWith(setting, env, "s"), {
        enabled: true,
        settingEnabled: setting,
        secretConfigured: true,
        envOverride: true,
        reason: "active",
      });
      // …but a forced-on flag still cannot mint unsigned URLs.
      assert.deepEqual(resolveWith(setting, env, undefined), {
        enabled: false,
        settingEnabled: setting,
        secretConfigured: false,
        envOverride: true,
        reason: "missing_secret",
      });
    }
  }
});

test("env=0 is a kill switch: off regardless of the setting or the secret", () => {
  for (const env of ENV_OFF) {
    for (const setting of [true, false]) {
      for (const secret of ["s", undefined]) {
        assert.deepEqual(resolveWith(setting, env, secret), {
          enabled: false,
          settingEnabled: setting,
          secretConfigured: secret !== undefined,
          envOverride: false,
          reason: "forced_off_by_env",
        });
      }
    }
  }
});

test("the setting alone never mints a URL without a signing secret", () => {
  // The whole degrade-to-today's-behavior property, from the caller's side.
  withEnv({ [FLAG]: undefined, [SECRET]: undefined }, () => {
    const state = resolvePrivateMediaAccess(true);
    assert.equal(state.enabled, false);
    assert.equal(gatedMediaPath(ASSET, TENANT_A, state.enabled), null);
    // Even a caller that ignores the resolver and hard-codes `true` gets null,
    // rather than an unverifiable URL.
    assert.equal(gatedMediaPath(ASSET, TENANT_A, true), null);
  });
});

test("the missing-secret warning fires once, and only when someone asked for gating", () => {
  const warnings: unknown[][] = [];
  const original = console.warn;
  console.warn = (...args: unknown[]) => void warnings.push(args);
  try {
    __resetPrivateMediaWarning();
    // Nobody asked ⇒ silence. A log on every cold start of a feature that is
    // off would train everyone to ignore it.
    resolveWith(false, undefined, undefined);
    assert.equal(warnings.length, 0);

    resolveWith(true, undefined, undefined);
    resolveWith(true, "1", undefined);
    assert.equal(warnings.length, 1, "warn-once must stay once");
    assert.match(String(warnings[0]?.[0]), /MEDIA_URL_SIGNING_SECRET/);
  } finally {
    console.warn = original;
    __resetPrivateMediaWarning();
  }
});

// ─── 2. gating-off equivalence (the ship-safety guarantee) ──────────────────

const PATHS = [
  "tenant/abc/photo.jpg",
  "nested/deep/path with space.png",
  "https://i.pravatar.cc/300",
  "/demo/portrait-01.jpg",
];

test("PRODUCTION TODAY (no setting row, no env vars): the public URL, unchanged", () => {
  // The exact shape production is in: the column defaults to false, neither
  // MEDIA_PRIVATE_ACCESS_ENABLED nor MEDIA_URL_SIGNING_SECRET is set. Nothing
  // about moving the switch into the database may change a single character.
  withEnv({ [FLAG]: undefined, [SECRET]: undefined }, () => {
    const state = resolvePrivateMediaAccess(false);
    assert.deepEqual(
      { enabled: state.enabled, reason: state.reason },
      { enabled: false, reason: "setting_off" },
    );
    for (const path of PATHS) {
      assert.equal(
        mediaUrlForAsset(urlClient, {
          assetId: ASSET,
          storagePath: path,
          surface: TENANT_A,
          gatingEnabled: state.enabled,
        }),
        mediaPublicUrl(urlClient, path),
        `default-off URL drifted for ${path}`,
      );
    }
  });
});

test("gating OFF: mediaUrlForAsset is byte-identical to mediaPublicUrl", () => {
  withEnv({ [FLAG]: undefined, [SECRET]: "s" }, () => {
    for (const path of PATHS) {
      assert.equal(
        mediaUrlForAsset(urlClient, {
          assetId: ASSET,
          storagePath: path,
          surface: TENANT_A,
          gatingEnabled: false,
        }),
        mediaPublicUrl(urlClient, path),
        `gating-off URL drifted for ${path}`,
      );
    }
  });
});

test("a caller that forgets to thread the flag falls back to the public URL", () => {
  // `gatingEnabled` defaults to false on purpose: forgetting it must land on
  // today's behavior, never on a half-configured gate.
  withGating(() => {
    assert.equal(
      mediaUrlForAsset(urlClient, {
        assetId: ASSET,
        storagePath: "t/a.jpg",
        surface: TENANT_A,
      }),
      mediaPublicUrl(urlClient, "t/a.jpg"),
    );
  });
});

test("gating ON but no surface known: still byte-identical to mediaPublicUrl", () => {
  // The workspace-internal thumb callers are in this position. Gating them
  // against a surface nobody resolved would blank the admin UI.
  withGating((on) => {
    assert.equal(
      mediaUrlForAsset(urlClient, { assetId: ASSET, storagePath: "t/a.jpg", gatingEnabled: on }),
      mediaPublicUrl(urlClient, "t/a.jpg"),
    );
  });
});

test("gating ON: absolute and root-relative paths are never gated", () => {
  withGating((on) => {
    for (const path of ["https://i.pravatar.cc/300", "/demo/portrait-01.jpg"]) {
      assert.equal(
        mediaUrlForAsset(urlClient, {
          assetId: ASSET,
          storagePath: path,
          surface: TENANT_A,
          gatingEnabled: on,
        }),
        path,
      );
    }
  });
});

test("pickBestThumbs without a surface is byte-identical with gating on or off", () => {
  const candidates: TalentThumbCandidate[] = [
    { id: ASSET, owner_talent_profile_id: TALENT, storage_path: "t/card.jpg", variant_kind: "card" },
    { id: "x", owner_talent_profile_id: TALENT, storage_path: "t/hero.jpg", variant_kind: "hero" },
  ];
  const off = withEnv({ [FLAG]: undefined, [SECRET]: "s" }, () =>
    pickBestThumbs(urlClient, candidates),
  );
  const on = withGating((enabled) => pickBestThumbs(urlClient, candidates, undefined, enabled));
  assert.deepEqual([...on], [...off]);
  assert.equal(off.get(TALENT), "https://cdn.test/t/card.jpg");
});

test("pickBestThumbs WITH a surface routes through the gate once gating is on", () => {
  const candidates: TalentThumbCandidate[] = [
    { id: ASSET, owner_talent_profile_id: TALENT, storage_path: "t/card.jpg", variant_kind: "card" },
  ];
  const url = withGating((on) => pickBestThumbs(urlClient, candidates, TENANT_A, on).get(TALENT));
  assert.ok(url);
  const [tag, surface, , assetId] = segmentsOf(url);
  assert.equal(tag, "t");
  assert.equal(surface, TENANT_A);
  assert.equal(assetId, ASSET);
});

// ─── 3. the surface is unforgeable ──────────────────────────────────────────

test("a minted URL verifies back to the surface it was minted for", () => {
  withGating((on) => {
    const url = gatedMediaPath(ASSET, TENANT_A, on);
    assert.ok(url);
    assert.deepEqual(verifyGatedMediaRequest(segmentsOf(url)), {
      surface: TENANT_A,
      assetId: ASSET,
    });
  });
});

test("the master surface round-trips as null and does not collide with a tenant", () => {
  withGating((on) => {
    const url = gatedMediaPath(ASSET, null, on);
    assert.ok(url);
    const segments = segmentsOf(url);
    assert.equal(segments[0], "m", "master surface must use the master tag");
    assert.equal(segments.length, 3, "master paths carry no tenant segment");
    assert.deepEqual(verifyGatedMediaRequest(segments), { surface: null, assetId: ASSET });

    // A tenant literally named "master" — or "m" — must not verify against the
    // master signature. `surfaceMessage()`'s domain separation is what stops it.
    const [, signature, assetId] = segments;
    for (const impostor of ["master", "m"]) {
      assert.equal(
        verifyGatedMediaRequest(["t", impostor, signature, assetId]),
        null,
        `tenant "${impostor}" must not verify against the master signature`,
      );
    }
  });
});

test("swapping the surface, the asset, or the signature is refused", () => {
  withGating((on) => {
    const [, , signature, assetId] = segmentsOf(gatedMediaPath(ASSET, TENANT_A, on)!);

    // The whole point: an attacker naming the OWNING tenant is the trivial
    // bypass an unsigned surface would have handed over.
    assert.equal(verifyGatedMediaRequest(["t", TENANT_B, signature, assetId]), null);
    assert.equal(verifyGatedMediaRequest(["t", TENANT_A, signature, "other-asset"]), null);
    assert.equal(verifyGatedMediaRequest(["t", TENANT_A, "", assetId]), null);
    assert.equal(verifyGatedMediaRequest(["t", TENANT_A, "short", assetId]), null);
    assert.equal(
      verifyGatedMediaRequest(["t", TENANT_A, `${signature}extra`, assetId]),
      null,
    );
    // Re-tagging a tenant URL as a master one is a different signed message.
    assert.equal(verifyGatedMediaRequest(["m", signature, assetId]), null);
  });
});

test("a malformed path is refused before any signature is considered", () => {
  withGating(() => {
    for (const segments of [
      [],
      ["m"],
      ["t"],
      ["m", "sig"], // master arity is exactly 3
      ["t", TENANT_A, "sig"], // tenant arity is exactly 4
      ["t", "", "sig", ASSET], // empty tenant would collapse into master
      ["x", TENANT_A, "sig", ASSET], // unknown surface tag
      ["m", "sig", ASSET, "extra"],
    ]) {
      assert.equal(
        parseGatedMediaPath(segments),
        null,
        `expected malformed: ${JSON.stringify(segments)}`,
      );
      assert.equal(verifyGatedMediaRequest(segments), null);
    }
  });
});

test("a URL minted under one secret does not verify under another", () => {
  const segments = segmentsOf(
    withEnv({ [FLAG]: "1", [SECRET]: "secret-one" }, () =>
      gatedMediaPath(ASSET, TENANT_A, true),
    )!,
  );
  withEnv({ [FLAG]: "1", [SECRET]: "secret-two" }, () => {
    assert.equal(verifyGatedMediaRequest(segments), null);
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
