/**
 * T7 / D4 — removing the wordmark or favicon must STAY removed.
 *
 * `logo_url` and `favicon_url` are LEGACY_THEME_PASSTHROUGH_KEYS: they sit
 * inside `agency_branding.theme_json` but are not registry tokens. On
 * publish, `design.ts` resolves them as `{ ...liveLegacy, ...draftLegacy }`
 * — the DRAFT slice wins. That ordering is what makes the naive
 * implementation of this feature wrong:
 *
 *   - clear the LIVE value only  → the next publish copies the stale draft
 *     URL back and the logo reappears;
 *   - DELETE the key rather than setting null → same thing, plus
 *     `loadAgencyBrandingSettings` falls back to the theme mirror.
 *
 * So the clear must be an EXPLICIT null written to both slices. These tests
 * pin exactly that, and the publish-merge arithmetic that makes it matter.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";

import { splitLegacyThemeKeys } from "./legacy-passthrough";
import { syncBrandSettingsToTheme } from "@/lib/site-admin/server/brand-library";

// ── The publish arithmetic these writes have to survive ────────────────

/** Mirrors publishDesign's legacy merge (design.ts): draft wins over live. */
function publishLegacyMerge(
  live: Record<string, unknown>,
  draft: Record<string, unknown>,
): Record<string, unknown> {
  return {
    ...splitLegacyThemeKeys(live).legacy,
    ...splitLegacyThemeKeys(draft).legacy,
  };
}

describe("D4 publish-merge semantics for brand marks", () => {
  it("a null in the DRAFT survives publish", () => {
    const merged = publishLegacyMerge(
      { logo_url: null, "card.surface": "#000" },
      { logo_url: null },
    );
    assert.equal(merged.logo_url, null);
  });

  it("REGRESSION: clearing live only lets the stale draft resurrect the logo", () => {
    // This is the failure the implementation must avoid — asserted here so
    // the reason for writing both slices is documented in a runnable form.
    const merged = publishLegacyMerge(
      { logo_url: null },
      { logo_url: "https://cdn.test/old-logo.png" },
    );
    assert.equal(merged.logo_url, "https://cdn.test/old-logo.png");
  });

  it("REGRESSION: deleting the key instead of nulling also resurrects it", () => {
    const merged = publishLegacyMerge(
      {},
      { logo_url: "https://cdn.test/old-logo.png" },
    );
    assert.equal(merged.logo_url, "https://cdn.test/old-logo.png");
  });

  it("a normal (non-clearing) publish still carries the URL through", () => {
    const merged = publishLegacyMerge(
      { logo_url: "https://cdn.test/a.png", favicon_url: "https://cdn.test/f.png" },
      { logo_url: "https://cdn.test/a.png", favicon_url: "https://cdn.test/f.png" },
    );
    assert.equal(merged.logo_url, "https://cdn.test/a.png");
    assert.equal(merged.favicon_url, "https://cdn.test/f.png");
  });
});

// ── syncBrandSettingsToTheme against a recording fake ──────────────────

type Upsert = Record<string, unknown>;

function fakeBrandingDb(existing: {
  theme_json?: Record<string, unknown>;
  theme_json_draft?: Record<string, unknown>;
}): { db: SupabaseClient; upserts: Upsert[] } {
  const upserts: Upsert[] = [];
  const db = {
    from() {
      const q = {
        select() {
          return q;
        },
        eq() {
          return q;
        },
        maybeSingle() {
          return Promise.resolve({
            data: {
              theme_json: existing.theme_json ?? {},
              theme_json_draft: existing.theme_json_draft ?? {},
            },
            error: null,
          });
        },
        upsert(patch: Upsert) {
          upserts.push(patch);
          return Promise.resolve({ data: null, error: null });
        },
      };
      return q;
    },
  } as unknown as SupabaseClient;
  return { db, upserts };
}

/**
 * `syncBrandSettingsToTheme` finishes by calling `updateTag` from
 * next/cache, which throws outside a Next request scope. That happens
 * AFTER the upsert we are asserting on, so swallowing it keeps the test
 * honest — but only that one error: anything else still fails the test.
 */
async function runSync(
  db: SupabaseClient,
  v: Parameters<typeof syncBrandSettingsToTheme>[2],
): Promise<void> {
  try {
    await syncBrandSettingsToTheme(db, "tenant-a", v);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (!/updateTag|revalidat|request scope|store/i.test(msg)) throw e;
  }
}

const LIVE = {
  "card.surface": "#101010",
  logo_url: "https://cdn.test/logo.png",
  favicon_url: "https://cdn.test/fav.png",
};
const DRAFT = {
  "card.surface": "#101010",
  logo_url: "https://cdn.test/logo.png",
  favicon_url: "https://cdn.test/fav.png",
};

describe("D4 syncBrandSettingsToTheme writes an explicit clear to both slices", () => {
  it("logo_url: null nulls live AND draft, and drops the typed FK", async () => {
    const { db, upserts } = fakeBrandingDb({
      theme_json: LIVE,
      theme_json_draft: DRAFT,
    });
    await runSync(db, { logo_url: null });

    assert.equal(upserts.length, 1);
    const patch = upserts[0]!;
    const live = patch.theme_json as Record<string, unknown>;
    const draft = patch.theme_json_draft as Record<string, unknown>;

    assert.ok(draft, "the draft slice must be written on a brand-mark change");
    assert.equal(live.logo_url, null);
    assert.equal(draft.logo_url, null);
    // Explicit null, not an omission — an absent key resurrects on publish.
    assert.ok("logo_url" in live);
    assert.ok("logo_url" in draft);
    assert.equal(patch.logo_media_asset_id, null);
    // Untouched neighbours survive.
    assert.equal(live["card.surface"], "#101010");
    assert.equal(live.favicon_url, "https://cdn.test/fav.png");
    // …and a clear of one mark must not touch the other's FK.
    assert.ok(!("favicon_media_asset_id" in patch));
  });

  it("favicon_url: null nulls live AND draft, and drops the typed FK", async () => {
    const { db, upserts } = fakeBrandingDb({
      theme_json: LIVE,
      theme_json_draft: DRAFT,
    });
    await runSync(db, { favicon_url: null });

    const patch = upserts[0]!;
    const live = patch.theme_json as Record<string, unknown>;
    const draft = patch.theme_json_draft as Record<string, unknown>;
    assert.equal(live.favicon_url, null);
    assert.equal(draft.favicon_url, null);
    assert.equal(patch.favicon_media_asset_id, null);
    assert.equal(live.logo_url, "https://cdn.test/logo.png");
    assert.ok(!("logo_media_asset_id" in patch));
  });

  it("the clear survives the publish merge end to end", async () => {
    const { db, upserts } = fakeBrandingDb({
      theme_json: LIVE,
      theme_json_draft: DRAFT,
    });
    await runSync(db, { logo_url: null });
    const patch = upserts[0]!;
    const merged = publishLegacyMerge(
      patch.theme_json as Record<string, unknown>,
      patch.theme_json_draft as Record<string, unknown>,
    );
    assert.equal(merged.logo_url, null, "publish must not resurrect the logo");
  });

  it("setting a NEW url still writes both slices (same key, same rule)", async () => {
    const { db, upserts } = fakeBrandingDb({ theme_json: {}, theme_json_draft: {} });
    await runSync(db, {
      logo_url: "https://cdn.test/new.png",
    });
    const patch = upserts[0]!;
    assert.equal(
      (patch.theme_json as Record<string, unknown>).logo_url,
      "https://cdn.test/new.png",
    );
    assert.equal(
      (patch.theme_json_draft as Record<string, unknown>).logo_url,
      "https://cdn.test/new.png",
    );
    // A set is not a clear — the FK must not be nulled out from under it.
    assert.ok(!("logo_media_asset_id" in patch));
  });

  it("an unrelated save (colors only) leaves both brand marks alone", async () => {
    const { db, upserts } = fakeBrandingDb({
      theme_json: LIVE,
      theme_json_draft: DRAFT,
    });
    await runSync(db, { primary_color: "#ff0000" });
    const patch = upserts[0]!;
    const live = patch.theme_json as Record<string, unknown>;
    assert.equal(live.logo_url, "https://cdn.test/logo.png");
    assert.equal(live.favicon_url, "https://cdn.test/fav.png");
    assert.ok(!("logo_media_asset_id" in patch));
    assert.ok(!("favicon_media_asset_id" in patch));
  });

  it("a no-op call writes nothing at all", async () => {
    const { db, upserts } = fakeBrandingDb({ theme_json: LIVE });
    await runSync(db, {});
    assert.equal(upserts.length, 0);
  });
});
