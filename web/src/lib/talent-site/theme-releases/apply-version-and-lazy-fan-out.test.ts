import test from "node:test";
import assert from "node:assert/strict";

import { loadApplyDesignRow, pickApplyDesign } from "./release-design.server";
import { ensureUpdatesWithPorts, isOpenRelease } from "./lazy-fan-out.server";
import type { FanOutPorts } from "./manager/fan-out";
import type { TalentThemeDesignRow } from "../theme-catalog/types";

const row = { slug: "maison-v2", version: 14, payload: { tag: "v14" } } as unknown as TalentThemeDesignRow;
const snap16 = { tag: "v16" } as never;

// ── F109 ─────────────────────────────────────────────────────────────────────

test("pickApplyDesign: newest released version wins over the gated catalog row, payload from the snapshot", () => {
  const d = pickApplyDesign(row, 16, snap16);
  assert.equal(d.version, 16);
  assert.deepEqual(d.payload, snap16);
});

test("pickApplyDesign: no release, no snapshot, or catalog already there = the catalog row", () => {
  assert.equal(pickApplyDesign(row, null, snap16), row);
  assert.equal(pickApplyDesign(row, 16, null), row);
  assert.equal(pickApplyDesign(row, 14, snap16), row);
});

function releaseAdmin(releases: Array<{ to_version: number }>, snapshot: unknown) {
  const catalogRow = {
    id: "1", kind: "design", slug: "maison-v2", title: "M", summary: "s", category: null, tags: [],
    payload: { shellTree: [], homeTree: [], tokenDefaults: {} }, preview: {}, required_talent_tier: "talent_basic",
    status: "published", source: "builtin", version: 14, schema_version: 1, sort_order: 1, is_new_until: null,
    created_by: null, updated_by: null, created_at: "", updated_at: "",
  };
  const filters: Array<[string, unknown]> = [];
  const admin = {
    from(table: string) {
      const q: Record<string, unknown> = {
        select: () => q,
        eq: (c: string, v: unknown) => (filters.push([c, v]), q),
        in: (c: string, v: unknown) => (filters.push([c, v]), q),
        order: () => q,
        limit: () => Promise.resolve({ data: releases, error: null }),
        maybeSingle: () =>
          Promise.resolve({
            data: table === "talent_theme_catalog" ? catalogRow : snapshot ? { payload: snapshot } : null,
            error: null,
          }),
      };
      return q;
    },
  };
  return { admin: admin as never, filters };
}

test("loadApplyDesignRow: gallery preview and apply share one version (newest open release)", async () => {
  const snap = { shellTree: [], homeTree: [], tokenDefaults: { x: "1" } };
  const a = releaseAdmin([{ to_version: 16 }], snap);
  const d = await loadApplyDesignRow(a.admin, "maison-v2");
  assert.equal(d?.version, 16);
  assert.deepEqual(d?.payload, snap);
  // only open, published releases are asked for (paused / draft / demos never count)
  assert.ok(a.filters.some(([c, v]) => c === "status" && v === "published"));
  assert.ok(a.filters.some(([c, v]) => c === "channel" && JSON.stringify(v) === JSON.stringify(["optin", "default"])));
  const none = await loadApplyDesignRow(releaseAdmin([], null).admin, "maison-v2");
  assert.equal(none?.version, 14);
});

// ── F108 ─────────────────────────────────────────────────────────────────────

function fakePorts(existingUpdates: string[] = [], existingBells: string[] = []) {
  const inserted: { updates: Array<{ release_id: string; talent_site_id: string }>; bells: Array<{ user_id: string }> } = {
    updates: [],
    bells: [],
  };
  const ports: FanOutPorts = {
    existingUpdateSiteIds: async () => new Set(existingUpdates),
    existingBellUserIds: async () => new Set(existingBells),
    insertUpdates: async (rows) => void inserted.updates.push(...rows),
    insertBells: async (rows) => void inserted.bells.push(...(rows as never[])),
  };
  return { ports, inserted };
}

const site = (over: Partial<{ pinnedVersion: number | null; isDemo: boolean; siteId: string }> = {}) => ({
  siteId: over.siteId ?? "site-1",
  talentProfileId: "p1",
  userId: "u1",
  designTitle: "Maison v2",
  locale: null,
  pinnedVersion: over.pinnedVersion === undefined ? 14 : over.pinnedVersion,
  isDemo: over.isDemo ?? false,
});
const rel = (id: string, to: number, over: Record<string, unknown> = {}) =>
  ({ id, design_slug: "maison-v2", to_version: to, rollout_pct: 100, channel: "optin", status: "published", ...over }) as never;

test("lazy fan-out: a site below every open release gets a row for each (2.1 and 2.2)", async () => {
  const { ports, inserted } = fakePorts();
  const r = await ensureUpdatesWithPorts(ports, site({ pinnedVersion: 14 }), [rel("r15", 15), rel("r16", 16)]);
  assert.equal(r.updates, 2);
  assert.deepEqual(inserted.updates.map((u) => u.release_id).sort(), ["r15", "r16"]);
});

test("lazy fan-out: skips releases at or below the pin, demos, closed channels, paused, and out-of-bucket", async () => {
  const cases = [
    [site({ pinnedVersion: 16 }), [rel("r16", 16)]],
    [site({ isDemo: true }), [rel("r16", 16)]],
    [site(), [rel("d", 16, { channel: "draft", status: "draft" })]],
    [site(), [rel("demos", 16, { channel: "demos" })]],
    [site(), [rel("p", 16, { status: "paused" })]],
    [site(), [rel("z", 16, { rollout_pct: 0 })]],
  ] as const;
  for (const [s, rs] of cases) {
    const { ports, inserted } = fakePorts();
    const r = await ensureUpdatesWithPorts(ports, s, rs);
    assert.equal(r.updates, 0);
    assert.equal(inserted.updates.length, 0);
  }
});

test("lazy fan-out is idempotent: an existing row is not duplicated", async () => {
  const { ports, inserted } = fakePorts(["site-1"], ["u1"]);
  const r = await ensureUpdatesWithPorts(ports, site(), [rel("r16", 16)]);
  assert.equal(r.updates, 0);
  assert.equal(inserted.updates.length, 0);
  assert.equal(inserted.bells.length, 0);
});

test("a site with no pin (null) counts as below any open release", async () => {
  const { ports, inserted } = fakePorts();
  await ensureUpdatesWithPorts(ports, site({ pinnedVersion: null }), [rel("r15", 15)]);
  assert.equal(inserted.updates.length, 1);
});

test("isOpenRelease", () => {
  assert.equal(isOpenRelease({ channel: "default", status: "published" }), true);
  assert.equal(isOpenRelease({ channel: "optin", status: "paused" }), false);
  assert.equal(isOpenRelease({ channel: "draft", status: "draft" }), false);
});
