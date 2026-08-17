/**
 * REGRESSION SUITE — "a publish emptied the live theme".
 *
 * Two production wipes of `agency_branding.theme_json` in two days:
 *
 *   2026-08-15 — publish rebuilt live from the normalized draft and dropped
 *                logo_url / favicon_url / watermark_preset (not registry
 *                tokens). Fixed by the legacy-passthrough split.
 *   2026-08-16 — the header inspector saved a ONE-KEY partial patch as the
 *                whole draft, then ran an UNSCOPED publish. The passthrough fix
 *                worked (the 3 special keys survived) while the 55 registry
 *                tokens behind them were replaced by that one key. Impronta's
 *                live theme went 58 keys → 4 and the storefront fell back to
 *                platform defaults.
 *
 * These tests drive the REAL `publishDesign` over a recording Supabase mock —
 * deliberately NOT a re-implementation of the composition, because a mirror
 * test would have stayed green through both incidents. The capability gate is
 * bypassed via the `__hooks` DI seam (same pattern as
 * `homepage-restore-integration.test.ts`); the trailing `scheduleAuditEvent` +
 * `updateTag` calls run outside a request scope under `tsx --test`, so the
 * tests catch the throw and assert on the writes that already landed.
 *
 * Run:
 *   NODE_OPTIONS='--require ./scripts/register-server-only-test.cjs' \
 *     npx tsx --test src/lib/site-admin/server/theme-publish-shrink-integration.test.ts
 *   (Glob-covered by the `test:builder` lane → runs in CI.)
 */

import assert from "node:assert/strict";
import { describe, test } from "node:test";

import type { SupabaseClient } from "@supabase/supabase-js";

import { listAgencyConfigurableTokens } from "../tokens/registry";
import { publishDesign } from "./design";

const TENANT = "11111111-1111-4111-8111-111111111111";

// ---------------------------------------------------------------------------
// Fixtures — built from the REAL registry so every value passes the token gate
// and the counts reflect the real data shape (Impronta held 55 registry tokens
// + 3 legacy keys = the 58-key row that was wiped).
// ---------------------------------------------------------------------------

const CONFIGURABLE = listAgencyConfigurableTokens();
const LIVE_TOKEN_COUNT = 55;
/** Sanity: the registry must be able to supply the fixture size. */
assert.ok(
  CONFIGURABLE.length >= LIVE_TOKEN_COUNT,
  `registry has ${CONFIGURABLE.length} agency-configurable tokens; fixture needs ${LIVE_TOKEN_COUNT}`,
);

/** `n` real registry tokens at their platform defaults. */
function registryTokens(n: number): Record<string, string> {
  const out: Record<string, string> = {};
  for (const spec of CONFIGURABLE.slice(0, n)) out[spec.key] = spec.defaultValue;
  return out;
}

/** A distinct-but-valid value for a token, so "the edit published" is provable. */
const BRAND_GOLD = "#c9a227";
const BRAND_INK = "#0b0b0b";

/** 55 registry tokens + 3 legacy keys — the live row that got wiped. */
function improntaLiveTheme(): Record<string, string> {
  const theme = registryTokens(LIVE_TOKEN_COUNT);
  // Two real, hex-validated brand colors so the assertions below prove the
  // OPERATOR'S values survived, not just that some keys did.
  theme["color.primary"] = BRAND_GOLD;
  theme["color.secondary"] = BRAND_INK;
  theme.logo_url = "https://cdn.example/impronta-logo.svg";
  theme.favicon_url = "https://cdn.example/favicon.ico";
  theme.watermark_preset = "corner-gold";
  return theme;
}

// ---------------------------------------------------------------------------
// Recording Supabase mock.
// ---------------------------------------------------------------------------

interface RecordedCall {
  table: string;
  method: "select" | "insert" | "update";
  payload?: Record<string, unknown>;
  eqs: Array<[string, unknown]>;
}

function makeSupabase(cfg: {
  liveTheme: Record<string, string>;
  draftTheme: Record<string, string>;
  version?: number;
}) {
  const version = cfg.version ?? 100;
  const calls: RecordedCall[] = [];

  const beforeRow = {
    tenant_id: TENANT,
    theme_json: cfg.liveTheme,
    theme_json_draft: cfg.draftTheme,
    component_styles_json: {},
    component_styles_json_draft: {},
    theme_preset_slug: null,
    theme_published_at: "2026-08-01T00:00:00.000Z",
    version,
    updated_by: null,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-08-01T00:00:00.000Z",
  };

  function from(table: string) {
    const rec: RecordedCall = { table, method: "select", eqs: [] };
    calls.push(rec);
    const chain: Record<string, unknown> = {};
    const self = () => chain;

    chain.select = () => self();
    chain.insert = (payload: Record<string, unknown>) => {
      rec.method = "insert";
      rec.payload = payload;
      return Promise.resolve({ data: null, error: null });
    };
    chain.update = (payload: Record<string, unknown>) => {
      rec.method = "update";
      rec.payload = payload;
      return self();
    };
    chain.eq = (col: string, val: unknown) => {
      rec.eqs.push([col, val]);
      return self();
    };
    chain.order = () => self();
    chain.limit = () => self();
    chain.maybeSingle = () => {
      if (rec.method === "update") {
        // Echo the written payload back as the post-update row, exactly as
        // PostgREST's `.update(...).select(...)` would.
        return Promise.resolve({
          data: { ...beforeRow, ...(rec.payload ?? {}) },
          error: null,
        });
      }
      return Promise.resolve({ data: beforeRow, error: null });
    };
    return chain;
  }

  return { supabase: { from } as unknown as SupabaseClient, calls, version };
}

/** Run publishDesign, absorbing the post-write request-scope throw. */
async function runPublish(
  supabase: SupabaseClient,
  version: number,
  extra: Record<string, unknown> = {},
): Promise<{ ok: boolean; code?: string; message?: string }> {
  try {
    const res = (await publishDesign(supabase, {
      tenantId: TENANT,
      values: { tenantId: TENANT, expectedVersion: version },
      actorProfileId: null,
      __hooks: { requireCapability: async () => {} },
      ...extra,
    })) as { ok: boolean; code?: string; message?: string };
    return res;
  } catch {
    // scheduleAuditEvent / updateTag fire only AFTER the row write; a throw
    // there means the write already landed.
    return { ok: true, code: "THREW_AFTER_WRITE" };
  }
}

const themeUpdate = (calls: RecordedCall[]) =>
  calls.find((c) => c.table === "agency_branding" && c.method === "update");

const revisionInserts = (calls: RecordedCall[]) =>
  calls.filter((c) => c.table === "agency_branding_revisions" && c.method === "insert");

const tokenKeys = (map: Record<string, unknown>) =>
  Object.keys(map).filter(
    (k) => k !== "logo_url" && k !== "favicon_url" && k !== "watermark_preset",
  );

// ---------------------------------------------------------------------------
// (a) 2026-08-16 shape — live 58 keys, draft 1 key, UNSCOPED publish.
// ---------------------------------------------------------------------------

describe("2026-08-16: one-key draft must not wipe a 58-key live theme", () => {
  test("UNSCOPED publish over an EMPTY-token draft seeds from live, writes nothing away", async () => {
    // Draft holds ONLY legacy keys — zero registry tokens. The pre-fix code
    // wrote `{ ...{}, ...legacy }` = 3 keys over 58.
    const { supabase, calls, version } = makeSupabase({
      liveTheme: improntaLiveTheme(),
      draftTheme: { logo_url: "https://cdn.example/impronta-logo.svg" },
    });

    await runPublish(supabase, version);

    const upd = themeUpdate(calls);
    assert.ok(upd, "the publish performed the row update");
    const next = upd.payload?.theme_json as Record<string, string>;
    assert.equal(
      tokenKeys(next).length,
      55,
      "every live registry token survives an empty-token draft",
    );
    assert.equal(next["color.primary"], BRAND_GOLD, "brand gold intact");
    assert.equal(next["color.secondary"], BRAND_INK, "brand ink intact");
    assert.equal(next.logo_url, "https://cdn.example/impronta-logo.svg");
  });

  test("UNSCOPED publish of a ONE-token draft is REJECTED by the shrink guard, no write", async () => {
    // The exact wipe: the header inspector left `shell.header-brand-layout`
    // alone in the draft column and published unscoped.
    const { supabase, calls, version } = makeSupabase({
      liveTheme: improntaLiveTheme(),
      draftTheme: {
        "shell.header-brand-layout": "stacked",
        logo_url: "https://cdn.example/impronta-logo.svg",
        favicon_url: "https://cdn.example/favicon.ico",
        watermark_preset: "corner-gold",
      },
    });

    const res = await runPublish(supabase, version);

    assert.equal(res.ok, false, "publish refused");
    assert.equal(res.code, "PUBLISH_NOT_READY");
    assert.match(String(res.message), /Publish blocked/);
    assert.match(String(res.message), /55 design tokens/);
    assert.equal(
      themeUpdate(calls),
      undefined,
      "NO write reached agency_branding — the live theme is untouched",
    );
  });

  test("the guard also refuses a partial wipe that clears the absolute floor (58 → 12)", async () => {
    const draft = registryTokens(12);
    const { supabase, calls, version } = makeSupabase({
      liveTheme: improntaLiveTheme(),
      draftTheme: draft,
    });

    const res = await runPublish(supabase, version);

    assert.equal(res.ok, false, "12 tokens is under 25% of 55 — refused");
    assert.equal(themeUpdate(calls), undefined, "no write");
  });
});

// ---------------------------------------------------------------------------
// (b) 2026-08-15 shape — legacy keys must survive a publish.
// ---------------------------------------------------------------------------

describe("2026-08-15: logo / favicon / watermark survive a publish", () => {
  test("live legacy keys are carried onto the new live map when the draft lacks them", async () => {
    const live = improntaLiveTheme();
    // A full, legitimate theme draft that simply does not carry the legacy keys.
    const draft: Record<string, string> = {};
    for (const [k, v] of Object.entries(live)) {
      if (k === "logo_url" || k === "favicon_url" || k === "watermark_preset") continue;
      draft[k] = v;
    }
    draft["color.primary"] = "#ffffff";

    const { supabase, calls, version } = makeSupabase({ liveTheme: live, draftTheme: draft });
    await runPublish(supabase, version);

    const next = themeUpdate(calls)?.payload?.theme_json as Record<string, string>;
    assert.ok(next, "write landed");
    assert.equal(next.logo_url, "https://cdn.example/impronta-logo.svg", "logo preserved");
    assert.equal(next.favicon_url, "https://cdn.example/favicon.ico", "favicon preserved");
    assert.equal(next.watermark_preset, "corner-gold", "watermark preserved");
    assert.equal(next["color.primary"], "#ffffff", "the real edit still publishes");
  });
});

// ---------------------------------------------------------------------------
// (c) legitimate full-theme publish still succeeds.
// ---------------------------------------------------------------------------

describe("legitimate publishes are not blocked", () => {
  test("a complete-map publish with one changed token writes through", async () => {
    const live = improntaLiveTheme();
    const draft = { ...live, "color.secondary": "#101010" };

    const { supabase, calls, version } = makeSupabase({ liveTheme: live, draftTheme: draft });
    const res = await runPublish(supabase, version);

    assert.notEqual(res.code, "PUBLISH_NOT_READY", "guard stayed out of the way");
    const next = themeUpdate(calls)?.payload?.theme_json as Record<string, string>;
    assert.ok(next, "write landed");
    assert.equal(next["color.secondary"], "#101010", "the edit published");
    assert.equal(tokenKeys(next).length, 55, "token count preserved");
  });

  test("a SCOPED publish (header inspector / card design) is never blocked — it starts from live", async () => {
    const live = improntaLiveTheme();
    const { supabase, calls, version } = makeSupabase({
      liveTheme: live,
      // Post-fix the draft is a merge, but even the pathological one-key draft
      // is harmless once the publish is scoped.
      draftTheme: { "shell.header-brand-layout": "stacked" },
    });

    const res = await runPublish(supabase, version, {
      scopeKeys: new Set(["shell.header-brand-layout"]),
    });

    assert.notEqual(res.code, "PUBLISH_NOT_READY");
    const next = themeUpdate(calls)?.payload?.theme_json as Record<string, string>;
    assert.ok(next, "write landed");
    assert.equal(next["shell.header-brand-layout"], "stacked", "the chip edit published");
    assert.equal(next["color.primary"], BRAND_GOLD, "every other live token untouched");
    assert.equal(tokenKeys(next).length, 55);
  });
});

// ---------------------------------------------------------------------------
// (d) a legitimately small theme (new tenant) is not falsely blocked.
// ---------------------------------------------------------------------------

describe("small / new tenants are outside the guard", () => {
  test("live {} + a 3-token draft publishes normally", async () => {
    const { supabase, calls, version } = makeSupabase({
      liveTheme: {},
      draftTheme: registryTokens(3),
    });

    const res = await runPublish(supabase, version);

    assert.notEqual(res.code, "PUBLISH_NOT_READY", "a first publish is never blocked");
    const next = themeUpdate(calls)?.payload?.theme_json as Record<string, string>;
    assert.equal(tokenKeys(next).length, 3);
  });

  test("live with 12 tokens (below the established floor) can drop to 2", async () => {
    const live = registryTokens(12);
    const { supabase, calls, version } = makeSupabase({
      liveTheme: live,
      draftTheme: { "color.primary": "#222222", "color.secondary": "#333333" },
    });

    const res = await runPublish(supabase, version);

    assert.notEqual(
      res.code,
      "PUBLISH_NOT_READY",
      "under 20 live tokens the guard does not engage",
    );
    assert.ok(themeUpdate(calls), "write landed");
  });
});

// ---------------------------------------------------------------------------
// (e) audit trail — the pre-image revision precedes the mutation.
// ---------------------------------------------------------------------------

describe("audit trail ordering", () => {
  test("a PRE-PUBLISH revision carrying the old live theme is inserted BEFORE the row update", async () => {
    const live = improntaLiveTheme();
    const { supabase, calls, version } = makeSupabase({
      liveTheme: live,
      draftTheme: { ...live, "color.primary": "#ffffff" },
    });

    await runPublish(supabase, version);

    const order = calls.filter(
      (c) =>
        (c.table === "agency_branding" && c.method === "update") ||
        (c.table === "agency_branding_revisions" && c.method === "insert"),
    );
    assert.ok(order.length >= 2, "revision + update both recorded");
    assert.equal(
      order[0]?.table,
      "agency_branding_revisions",
      "the pre-image revision is written FIRST — recoverability is guaranteed, not coincidental",
    );

    const pre = revisionInserts(calls)[0]?.payload as
      | { snapshot?: { pre_publish?: boolean; theme_json?: Record<string, string> } }
      | undefined;
    assert.equal(pre?.snapshot?.pre_publish, true, "flagged as the pre-publish snapshot");
    assert.equal(
      pre?.snapshot?.theme_json?.["color.primary"],
      BRAND_GOLD,
      "the pre-image holds the OLD live theme, which is what a restore needs",
    );
  });

  test("a BLOCKED publish writes no revision and no row update", async () => {
    const { supabase, calls, version } = makeSupabase({
      liveTheme: improntaLiveTheme(),
      draftTheme: { "shell.header-brand-layout": "stacked" },
    });

    await runPublish(supabase, version);

    assert.equal(revisionInserts(calls).length, 0, "no revision row");
    assert.equal(themeUpdate(calls), undefined, "no branding write");
  });
});
