import test from "node:test";
import assert from "node:assert/strict";

import {
  AUTHORED_GATE_COPY,
  checkAuthoredChannelGate,
  decideAuthoredSync,
  isAuthoredReflected,
} from "./authored-sync-rule";
import { authoredOverlayVersion, loadAuthoredOverlay } from "./collection/authored";
import {
  hashBuiltinPayload,
  planBuiltinSync,
  type BuiltinThemeEntry,
  type DesignHistory,
  type ExistingBuiltinRow,
} from "./sync-builtins.server";
import { writeThemeVersionSnapshots } from "../theme-releases/theme-versions.server";
import { executeChannelChange, type ChannelDeps } from "../theme-releases/manager/channel";
import { buildDryRunReport } from "../theme-releases/manager/dry-run";
import type { ReleaseChannel, ThemeRelease } from "../theme-releases/types";

// ---- pure rule -------------------------------------------------------------

test("isAuthoredReflected: non-authored always; authored only once the overlay catches up", () => {
  assert.equal(isAuthoredReflected({ version: 5, source: "sync" }, 0), true);
  assert.equal(isAuthoredReflected({ version: 5, source: null }, 0), true);
  assert.equal(isAuthoredReflected({ version: 5, source: "authored" }, 4), false);
  assert.equal(isAuthoredReflected({ version: 5, source: "authored" }, 5), true);
  assert.equal(isAuthoredReflected({ version: 5, source: "authored" }, 6), true);
});

test("decideAuthoredSync: equal hash is unchanged even when authored and unreflected", () => {
  const d = decideAuthoredSync({ codeHash: "a", latestHash: "a", latest: { version: 3, source: "authored" }, overlayVersion: 0 });
  assert.deepEqual(d, { kind: "unchanged" });
});

test("decideAuthoredSync: authored + unreflected + differing is pending; conflict only with a differing meta.code_hash", () => {
  const base = { codeHash: "c", latestHash: "l", overlayVersion: 0 };
  assert.deepEqual(decideAuthoredSync({ ...base, latest: { version: 7, source: "authored" } }), {
    kind: "authored_pending",
    latestVersion: 7,
    conflict: false,
  });
  assert.deepEqual(
    decideAuthoredSync({ ...base, latest: { version: 7, source: "authored", meta: { code_hash: "c" } } }),
    { kind: "authored_pending", latestVersion: 7, conflict: false },
  );
  assert.deepEqual(
    decideAuthoredSync({ ...base, latest: { version: 7, source: "authored", meta: { code_hash: "old" } } }),
    { kind: "authored_pending", latestVersion: 7, conflict: true },
  );
});

test("decideAuthoredSync: reflected authored or non-authored latest is a normal code change", () => {
  const base = { codeHash: "c", latestHash: "l" };
  assert.deepEqual(decideAuthoredSync({ ...base, latest: { version: 7, source: "authored" }, overlayVersion: 7 }), {
    kind: "code_change",
  });
  assert.deepEqual(decideAuthoredSync({ ...base, latest: { version: 7, source: "sync" }, overlayVersion: 0 }), {
    kind: "code_change",
  });
});

test("overlay loader: absent and malformed overlays read as null / version 0", () => {
  assert.equal(loadAuthoredOverlay("maison-v2"), null);
  assert.equal(authoredOverlayVersion("maison-v2"), 0);
  assert.deepEqual(loadAuthoredOverlay("x", { x: { authoredVersion: 4 } }), { authoredVersion: 4 });
  assert.equal(loadAuthoredOverlay("x", { x: { authoredVersion: "4" } }), null);
  assert.equal(loadAuthoredOverlay("x", { x: { authoredVersion: -1 } }), null);
  assert.equal(loadAuthoredOverlay("toString", {}), null);
});

// ---- planBuiltinSync wiring -------------------------------------------------

function entry(slug: string): BuiltinThemeEntry {
  return {
    kind: "design",
    slug,
    title: `Title ${slug}`,
    summary: "Summary",
    category: "classic",
    tags: [],
    required_talent_tier: "talent_basic",
    sort_order: 10,
    is_new_until: null,
    preview: {},
    buildPayload: () => ({}) as never,
  } as BuiltinThemeEntry;
}

const CODE = { v: "code" };
const AUTH = { v: "authored" };
const row4: ExistingBuiltinRow = { kind: "design", slug: "d", version: 4, payload: { v: 4 }, source: "builtin" };
const authoredHistory = (meta: Record<string, unknown> | null = null): Map<string, DesignHistory> =>
  new Map([
    [
      "d",
      {
        snapshots: [
          { version: 4, payload: { v: 4 }, source: "sync" },
          { version: 5, payload: AUTH, source: "authored", meta },
        ],
        releaseToVersions: [],
      },
    ],
  ]);

test("authored latest is never reverted: no upsert, no snapshot change, no release", () => {
  const plan = planBuiltinSync([{ entry: entry("d"), payload: CODE }], [row4], null, authoredHistory(), () => 0);
  assert.equal(plan.upserts.length, 0);
  assert.equal(plan.designChanges.length, 0);
  assert.deepEqual(plan.authoredPending, [{ slug: "d", version: 5 }]);
  assert.deepEqual(plan.authoredConflict, []);
  assert.equal(plan.updated, 0);
});

test("authored latest with a stale code_hash base reports a conflict", () => {
  const plan = planBuiltinSync(
    [{ entry: entry("d"), payload: CODE }],
    [row4],
    null,
    authoredHistory({ code_hash: "not-the-current-code" }),
    () => 0,
  );
  assert.deepEqual(plan.authoredConflict, [{ slug: "d", version: 5 }]);
  const same = planBuiltinSync(
    [{ entry: entry("d"), payload: CODE }],
    [row4],
    null,
    authoredHistory({ code_hash: hashBuiltinPayload(CODE) }),
    () => 0,
  );
  assert.deepEqual(same.authoredConflict, []);
  assert.equal(same.authoredPending.length, 1);
});

test("code equal to the authored payload: unchanged, held state, no write", () => {
  const plan = planBuiltinSync([{ entry: entry("d"), payload: AUTH }], [row4], null, authoredHistory(), () => 0);
  assert.equal(plan.upserts.length, 0);
  assert.equal(plan.unchanged, 1);
  assert.deepEqual(plan.authoredPending, []);
});

test("once the overlay reflects the authored version, code changes flow as before", () => {
  const plan = planBuiltinSync([{ entry: entry("d"), payload: CODE }], [row4], null, authoredHistory(), () => 5);
  assert.deepEqual(plan.authoredPending, []);
  assert.deepEqual(plan.designChanges, [{ slug: "d", fromVersion: 5, toVersion: 6, basePayload: AUTH }]);
  assert.equal(plan.upserts[0]!.version, 6);
});

test("code-only designs: behaviour unchanged by the default overlay lookup", () => {
  const h = new Map([["d", { snapshots: [{ version: 4, payload: { v: 4 } }], releaseToVersions: [] }]]);
  const plan = planBuiltinSync([{ entry: entry("d"), payload: CODE }], [row4], null, h);
  assert.deepEqual(plan.designChanges, [{ slug: "d", fromVersion: 4, toVersion: 5, basePayload: { v: 4 } }]);
  assert.deepEqual(plan.authoredPending, []);
});

// ---- snapshot conflict detection ---------------------------------------------

function snapshotAdmin(error: { code: string; message: string } | null) {
  const calls: string[] = [];
  const admin = {
    from: () => ({
      insert: () => {
        calls.push("insert");
        return Promise.resolve({ error });
      },
      upsert: () => {
        calls.push("upsert");
        return Promise.resolve({ error: null });
      },
    }),
  };
  return { admin: admin as never, calls };
}

const SNAP = [{ design: "d", version: 5, payload: {} as never, source: "authored" }];

test("writeThemeVersionSnapshots failOnConflict: 23505 returns conflict; default stays upsert-ignore", async () => {
  const dup = snapshotAdmin({ code: "23505", message: "duplicate key" });
  assert.deepEqual(await writeThemeVersionSnapshots(dup.admin, SNAP, { failOnConflict: true }), {
    ok: false,
    code: "conflict",
  });
  assert.deepEqual(dup.calls, ["insert"]);
  const fresh = snapshotAdmin(null);
  assert.deepEqual(await writeThemeVersionSnapshots(fresh.admin, SNAP, { failOnConflict: true }), { ok: true });
  const legacy = snapshotAdmin(null);
  assert.deepEqual(await writeThemeVersionSnapshots(legacy.admin, SNAP), { ok: true });
  assert.deepEqual(legacy.calls, ["upsert"]);
});

// ---- release manager channel gate --------------------------------------------

test("checkAuthoredChannelGate: optin/default refused for unreflected authored; draft/demos allowed", () => {
  const snap = { version: 5, source: "authored" };
  assert.deepEqual(checkAuthoredChannelGate("demos", snap, 0), { ok: true });
  assert.deepEqual(checkAuthoredChannelGate("draft", snap, 0), { ok: true });
  for (const t of ["optin", "default"] as const) {
    const g = checkAuthoredChannelGate(t, snap, 0);
    assert.equal(g.ok, false);
    if (!g.ok) {
      assert.equal(g.error, AUTHORED_GATE_COPY.en);
      assert.equal(g.errorEs, AUTHORED_GATE_COPY.es);
    }
    assert.deepEqual(checkAuthoredChannelGate(t, snap, 5), { ok: true });
    assert.deepEqual(checkAuthoredChannelGate(t, { version: 5, source: "sync" }, 0), { ok: true });
    assert.deepEqual(checkAuthoredChannelGate(t, null, 0), { ok: true });
  }
});

function release(channel: ReleaseChannel): ThemeRelease {
  const base = { id: "r1", to_version: 5, items: [] } as unknown as ThemeRelease;
  return {
    ...base,
    channel,
    status: "published",
    rollout_pct: 100,
    dry_run_report: buildDryRunReport(base, []),
  } as ThemeRelease;
}

function deps(state: Awaited<ReturnType<NonNullable<ChannelDeps["authoredState"]>>>, effects: string[]): ChannelDeps {
  return {
    applyToDemos: async () => (effects.push("demos"), { ok: true, applied: 0 }),
    fanOut: async () => (effects.push("fanOut"), { updates: 0, bells: 0 }),
    persist: async (c) => (effects.push(`persist:${c}`), { ok: true }),
    flipCatalog: async () => (effects.push("flip"), { ok: true }),
    authoredState: async () => state,
  };
}

test("executeChannelChange: authored gate refuses optin and default before any effect", async () => {
  const pending = { ok: true as const, snapshot: { version: 5, source: "authored" }, overlayVersion: 0 };
  for (const [from, to] of [["demos", "optin"], ["optin", "default"]] as const) {
    const effects: string[] = [];
    const r = await executeChannelChange(release(from), to, deps(pending, effects));
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.code, "authored_pending");
    assert.deepEqual(effects, []);
  }
});

test("executeChannelChange: demos still allowed; a failed snapshot read fails closed", async () => {
  const pending = { ok: true as const, snapshot: { version: 5, source: "authored" }, overlayVersion: 0 };
  const effects: string[] = [];
  const r = await executeChannelChange(release("draft"), "demos", deps(pending, effects));
  assert.equal(r.ok, true);
  const e2: string[] = [];
  const failed = await executeChannelChange(release("demos"), "optin", deps({ ok: false, error: "read failed" }, e2));
  assert.deepEqual(failed, { ok: false, error: "read failed" });
  assert.deepEqual(e2, []);
  const e3: string[] = [];
  const reflected = { ok: true as const, snapshot: { version: 5, source: "authored" }, overlayVersion: 5 };
  assert.equal((await executeChannelChange(release("demos"), "optin", deps(reflected, e3))).ok, true);
});
