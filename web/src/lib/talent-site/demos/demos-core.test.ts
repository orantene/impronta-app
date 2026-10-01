import test from "node:test";
import assert from "node:assert/strict";

import { DEMO_BATCH } from "@/lib/talent-site/theme-catalog/demo-account";
import { THEME_DEMOS } from "@/lib/talent-site/theme-catalog/theme-demos";
import { decideDemoTarget } from "./guard.server";
import { DEMO_REGISTRY, demosFor, findDemo } from "./registry";
import { sameStable, stableJson } from "./stable";
import { isPublishedInSync } from "./design-step.server";
import {
  afterHash,
  plannedSteps,
  rebuildDemos,
  restoreDemoRun,
  type RebuildPorts,
} from "./demo-rebuild.server";
import type { DemoRegistryEntry } from "./types";

// ── registry ─────────────────────────────────────────────────────────────────

test("registry: exactly one reference per design, codes unique", () => {
  for (const design of ["maison-v2", "folio", "gridline"] as const) {
    const refs = demosFor(design).filter((d) => d.reference);
    assert.equal(refs.length, 1, `${design} references`);
    assert.ok(refs[0]!.contentFixture === design);
  }
  const codes = DEMO_REGISTRY.map((d) => d.profileCode);
  assert.equal(new Set(codes).size, codes.length);
  assert.equal(findDemo("TAL-93020")?.palette, "rose");
  assert.equal(findDemo("TAL-93011")?.design, "folio");
});

test("registry: Andres and Sofia are rebuilt in their current look, never recoloured", () => {
  const andres = findDemo("TAL-93006");
  const sofia = findDemo("TAL-93007");
  assert.equal(andres?.design, "maison-v2");
  assert.equal(sofia?.design, "folio");
  for (const d of [andres, sofia]) {
    assert.equal(d?.keepLook, true);
    assert.equal(d?.reference, false);
  }
  assert.equal(DEMO_REGISTRY.filter((d) => d.keepLook).length, 2);
});

test("registry: every THEME_DEMOS entry is present", () => {
  for (const d of THEME_DEMOS) assert.ok(findDemo(d.profileCode), d.profileCode);
});

// ── guard ────────────────────────────────────────────────────────────────────

const demoEmail = "demo-alba-unas@impronta.test";

test("guard: a registry demo with is_demo + demo account is allowed", () => {
  const d = decideDemoTarget({ profileCode: "TAL-93020", inRegistry: true, isDemoFlag: true, email: demoEmail, demoBatch: DEMO_BATCH });
  assert.equal(d.ok, true);
});

test("guard: Jor, QA users and real talents are refused", () => {
  for (const code of ["TAL-JORGBEAUTY", "TAL-93900", "TAL-93901", "TAL-QAFIXFREE"]) {
    assert.equal(findDemo(code), undefined, `${code} must not be in the registry`);
    const d = decideDemoTarget({ profileCode: code, inRegistry: !!findDemo(code), isDemoFlag: true, email: demoEmail, demoBatch: DEMO_BATCH });
    assert.equal(d.ok, false, code);
  }
});

test("guard: each of the three conditions is required", () => {
  const ok = { profileCode: "TAL-93020", inRegistry: true, isDemoFlag: true, email: demoEmail, demoBatch: DEMO_BATCH };
  assert.equal(decideDemoTarget({ ...ok, isDemoFlag: false }).ok, false);
  assert.equal(decideDemoTarget({ ...ok, isDemoFlag: null }).ok, false);
  assert.equal(decideDemoTarget({ ...ok, email: "real@person.com" }).ok, false);
  assert.equal(decideDemoTarget({ ...ok, demoBatch: undefined }).ok, false);
  assert.equal(decideDemoTarget({ ...ok, inRegistry: false }).ok, false);
});

// ── stable compare ───────────────────────────────────────────────────────────

test("stable compare: key order never matters, values do", () => {
  assert.equal(sameStable({ a: 1, b: { c: [1, { y: 1, x: 2 }] } }, { b: { c: [1, { x: 2, y: 1 }] }, a: 1 }), true);
  assert.equal(sameStable({ a: 1 }, { a: 2 }), false);
  assert.equal(stableJson(undefined), "null");
});

test("published in sync: null and empty list are the same, tokens compare as strings only", () => {
  const site = { id: "s", shell_tree: [{ a: 1 }], shell_published: [{ a: 1 }], design_tokens: { x: "1" }, design_tokens_draft: { x: "1", y: 2 } };
  assert.equal(isPublishedInSync(site, [{ id: "p", blocks: null, blocks_published: [] }]), true);
  assert.equal(isPublishedInSync({ ...site, shell_published: [] }, []), false);
  assert.equal(isPublishedInSync(site, [{ id: "p", blocks: [{ b: 1 }], blocks_published: [] }]), false);
});

test("plannedSteps: an identical demo plans nothing, a publish-only drift plans publish", () => {
  assert.deepEqual(plannedSteps([], { draftSame: true, publishedInSync: true }, true), { changed: [], needsPublish: false });
  assert.deepEqual(plannedSteps([], { draftSame: true, publishedInSync: false }, true), { changed: ["publish"], needsPublish: true });
  assert.deepEqual(plannedSteps([], { draftSame: true, publishedInSync: false }, false), { changed: [], needsPublish: false });
  assert.deepEqual(plannedSteps(["location"], { draftSame: false, publishedInSync: true }, true).changed, ["location", "design", "publish"]);
});

// ── orchestrator with injected ports and a recording fake admin ──────────────

function fakeAdmin() {
  const writes: string[] = [];
  const q: Record<string, unknown> = {
    insert: () => (writes.push("insert"), q),
    update: () => (writes.push("update"), q),
    upsert: () => (writes.push("upsert"), q),
    delete: () => (writes.push("delete"), q),
    select: () => q,
    eq: () => q,
    single: () => Promise.resolve({ data: { id: "run-1" }, error: null }),
    maybeSingle: () => Promise.resolve({ data: null, error: null }),
    then: (res: (v: unknown) => unknown) => Promise.resolve({ data: null, error: null }).then(res),
  };
  return { admin: { from: () => q } as never, writes };
}

type Flags = { draftSame: boolean; publishedInSync: boolean; contentChanged?: boolean };

function fakePorts(flags: Flags, calls: string[] = []): RebuildPorts {
  const rows = { tp: { id: "tp1", profile_code: "X", user_id: "u1", display_name: "D" }, email: "e", demoBatch: DEMO_BATCH, site: { id: "s1" }, pages: [], home: { id: "h1" } };
  return {
    assertTarget: async (_a, code) => (code === "TAL-93020" ? { ok: true, talentProfileId: "tp1", siteId: "s1", userId: "u1" } : { ok: false, reason: "no" }),
    loadRows: async () => rows as never,
    plan: async () =>
      ({ design: { version: 21 }, draftSame: flags.draftSame, publishedInSync: flags.publishedInSync, trees: { shellTree: [], homeTree: [] }, nextTokens: {}, nextCustom: null }) as never,
    content: async (_a, _e, _t, write) => {
      calls.push(`content:${write}`);
      return flags.contentChanged ? ["location"] : [];
    },
    writeDraft: async () => void calls.push("writeDraft"),
    publish: async () => void calls.push("publish"),
    bust: () => void calls.push("bust"),
  };
}

test("rebuild: an identical rerun is unchanged and writes nothing (no backup row either)", async () => {
  const { admin, writes } = fakeAdmin();
  const calls: string[] = [];
  const res = await rebuildDemos(admin, { design: "maison-v2", only: ["TAL-93020"], dryRun: false }, undefined, fakePorts({ draftSame: true, publishedInSync: true }, calls));
  assert.equal(res.rows[0]!.status, "unchanged");
  assert.equal(res.ok, true);
  assert.deepEqual(writes, []);
  assert.ok(!calls.includes("writeDraft") && !calls.includes("publish") && !calls.includes("bust"));
});

test("rebuild: a dry run (the default) never writes, even when everything differs", async () => {
  const { admin, writes } = fakeAdmin();
  const calls: string[] = [];
  const res = await rebuildDemos(admin, { only: ["TAL-93020"] }, undefined, fakePorts({ draftSame: false, publishedInSync: false, contentChanged: true }, calls));
  assert.equal(res.dryRun, true);
  assert.equal(res.rows[0]!.status, "would_write");
  assert.deepEqual(res.rows[0]!.changed, ["location", "design", "publish"]);
  assert.deepEqual(writes, []);
  assert.deepEqual(calls, ["content:false"]);
});

test("rebuild: a real write saves a backup row first, then writes, publishes and busts", async () => {
  const { admin, writes } = fakeAdmin();
  const calls: string[] = [];
  const res = await rebuildDemos(admin, { only: ["TAL-93020"], dryRun: false }, "actor", fakePorts({ draftSame: false, publishedInSync: false, contentChanged: true }, calls));
  const row = res.rows[0]!;
  assert.equal(row.status, "wrote");
  assert.equal(row.runId, "run-1");
  assert.equal(writes[0], "insert");
  assert.deepEqual(calls, ["content:false", "content:true", "writeDraft", "publish", "bust"]);
});

test("rebuild: publish=false skips the publish step", async () => {
  const { admin } = fakeAdmin();
  const calls: string[] = [];
  const res = await rebuildDemos(admin, { only: ["TAL-93020"], dryRun: false, publish: false }, undefined, fakePorts({ draftSame: false, publishedInSync: false }, calls));
  assert.equal(res.rows[0]!.status, "wrote");
  assert.ok(!calls.includes("publish"));
});

test("rebuild: one failing demo is marked failed and the run continues", async () => {
  const { admin } = fakeAdmin();
  const ports = fakePorts({ draftSame: false, publishedInSync: true });
  ports.assertTarget = async (_a, code) => {
    if (code === "TAL-93020") throw new Error("boom");
    return { ok: true, talentProfileId: "tp1", siteId: "s1", userId: "u1" };
  };
  const res = await rebuildDemos(admin, { design: "maison-v2", only: ["TAL-93020", "TAL-93003"] }, undefined, ports);
  const byCode = Object.fromEntries(res.rows.map((r) => [r.profileCode, r.status]));
  assert.equal(byCode["TAL-93020"], "failed");
  assert.equal(byCode["TAL-93003"], "would_write");
  assert.equal(res.ok, false);
});

test("rebuild: a code outside the registry is refused and nothing is read", async () => {
  const { admin, writes } = fakeAdmin();
  const res = await rebuildDemos(admin, { only: ["TAL-JORGBEAUTY"], dryRun: false }, undefined, fakePorts({ draftSame: false, publishedInSync: false }));
  assert.equal(res.rows[0]!.status, "refused");
  assert.deepEqual(writes, []);
});

test("restore: refused for a non-demo target before any write", async () => {
  const writes: string[] = [];
  const q: Record<string, unknown> = {
    select: () => q,
    eq: () => q,
    update: () => (writes.push("update"), q),
    maybeSingle: () => Promise.resolve({ data: { id: "r", profile_code: "TAL-JORGBEAUTY", status: "wrote", before: { talent_sites: { id: "s" }, talent_pages: [] } }, error: null }),
  };
  const res = await restoreDemoRun({ from: () => q } as never, "r", { assertTarget: async () => ({ ok: false, reason: "not a demo" }), bust: () => undefined });
  assert.equal(res.ok, false);
  assert.deepEqual(writes, []);
});

test("afterHash is stable for the same plan", () => {
  const plan = { trees: { shellTree: [{ a: 1 }], homeTree: [] }, nextTokens: { x: "1" }, nextCustom: null } as never;
  assert.equal(afterHash(plan), afterHash(plan));
});

test("registry entries are typed demos", () => {
  const e: DemoRegistryEntry = DEMO_REGISTRY[0]!;
  assert.ok(e.profileCode.startsWith("TAL-"));
});
