/**
 * TUL-890 / TUL-537 A3: staging-code aliases. TAL-97001/2/3 are registry entries
 * whose CONTENT comes from the canonical demo (copyFrom) while every identity
 * lookup (guard, rows, backups, cache bust) keeps the staging code. Fakes only,
 * no DB, no network.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { appsForDemo } from "@/lib/site-admin/add-gallery/apps-registry";
import { DEMO_BATCH } from "@/lib/talent-site/theme-catalog/demo-account";
import { MAISON_V2_DEMO_STYLES } from "@/lib/talent-site/theme-catalog/theme-demos";
import { defaultFixtureFor } from "./content-fixture.server";
import { rebuildDemos, selectEntries, specFor, type RebuildPorts } from "./demo-rebuild.server";
import type { DemoSpec } from "./design-step.server";
import { demoSiteSwitchColumns } from "./demo-site-settings";
import { folioSiteCopyFor } from "./folio-site-copy";
import { DEMO_REGISTRY, STAGING_ALIASES, demoContentCode, demosFor, findDemo } from "./registry";
import type { DemoRegistryEntry } from "./types";

const PAIRS = [
  ["TAL-97001", "TAL-93011"],
  ["TAL-97002", "TAL-93020"],
  ["TAL-97003", "TAL-93103"],
] as const;

const alias = (code: string): DemoRegistryEntry => {
  const d = findDemo(code);
  assert.ok(d, `${code} in registry`);
  return d;
};

// ── registry ─────────────────────────────────────────────────────────────────

test("registry: the three staging aliases carry copyFrom and the canonical design, palette and content fixture", () => {
  assert.deepEqual(
    STAGING_ALIASES.map((a) => [a.profileCode, a.copyFrom]),
    PAIRS.map((p) => [...p]),
  );
  for (const [staging, canonical] of PAIRS) {
    const a = alias(staging);
    const c = alias(canonical);
    assert.equal(a.copyFrom, canonical);
    assert.equal(a.design, c.design, staging);
    assert.equal(a.palette, c.palette, staging);
    assert.equal(a.contentFixture, c.contentFixture, staging);
    assert.equal(a.keepLook, c.keepLook, staging);
    assert.equal(a.reference, false, staging);
    assert.equal(c.copyFrom, undefined, `${canonical} is not an alias`);
  }
  assert.equal(alias("TAL-97001").design, "folio");
  assert.equal(alias("TAL-97001").contentFixture, "folio");
  assert.equal(alias("TAL-97002").design, "maison-v2");
  assert.equal(alias("TAL-97002").palette, "rose");
  assert.equal(alias("TAL-97002").contentFixture, "maison-v2");
  assert.equal(alias("TAL-97003").design, "maison-v2");
  assert.equal(alias("TAL-97003").contentFixture, undefined);
  assert.equal(DEMO_REGISTRY.filter((d) => d.copyFrom).length, 3);
});

test("registry: findDemo(TAL-97001).copyFrom is TAL-93011; Jor is never aliased", () => {
  assert.equal(findDemo("TAL-97001")?.copyFrom, "TAL-93011");
  assert.equal(findDemo("TAL-93938"), undefined);
  for (const d of DEMO_REGISTRY) assert.notEqual(d.copyFrom, "TAL-93938");
  const codes = DEMO_REGISTRY.map((d) => d.profileCode);
  assert.equal(new Set(codes).size, codes.length);
});

test("registry: aliases stay out of demosFor (pickers, counts, full rebuilds); one reference per design", () => {
  for (const d of demosFor()) assert.equal(d.copyFrom, undefined, d.profileCode);
  for (const design of ["maison-v2", "folio", "gridline"] as const) {
    assert.equal(demosFor(design).filter((d) => d.reference).length, 1, design);
  }
});

test("selectEntries: an alias is rebuilt only when named in only; design filter still applies", () => {
  assert.ok(selectEntries({}).entries.every((d) => !d.copyFrom));
  const one = selectEntries({ only: ["TAL-97001"] });
  assert.deepEqual(one.entries.map((d) => d.profileCode), ["TAL-97001"]);
  assert.deepEqual(one.unknown, []);
  assert.deepEqual(selectEntries({ design: "folio", only: ["TAL-97001", "TAL-97002"] }).entries.map((d) => d.profileCode), ["TAL-97001"]);
  assert.deepEqual(selectEntries({ design: "maison-v2", only: ["TAL-97002", "TAL-97003"] }).entries.map((d) => d.profileCode), ["TAL-97002", "TAL-97003"]);
  // Canonical codes behave exactly as before.
  assert.deepEqual(selectEntries({ only: ["TAL-93020"] }).entries.map((d) => d.profileCode), ["TAL-93020"]);
});

// ── DemoSpec ─────────────────────────────────────────────────────────────────

test("specFor: an alias spec carries copyFrom and keeps its own profileCode; a canonical spec has none", () => {
  for (const [staging, canonical] of PAIRS) {
    const s = specFor(alias(staging), true);
    assert.equal(s.profileCode, staging);
    assert.equal(s.copyFrom, canonical);
    const c = specFor(alias(canonical), true);
    assert.equal(c.copyFrom, undefined);
    assert.ok(!("copyFrom" in c));
    const identityless = (x: DemoSpec): DemoSpec => ({ ...x, profileCode: "", copyFrom: "" });
    assert.deepEqual(identityless(s), identityless(c), `${staging} spec equals ${canonical} apart from identity`);
  }
});

test("rebuild: identity ports get the staging code, the design step gets copyFrom", async () => {
  const seen: { target: string[]; rows: string[]; bust: string[]; specs: DemoSpec[]; entries: DemoRegistryEntry[] } = {
    target: [],
    rows: [],
    bust: [],
    specs: [],
    entries: [],
  };
  const writes: string[] = [];
  const q: Record<string, unknown> = {
    insert: () => (writes.push("insert"), q),
    update: () => (writes.push("update"), q),
    select: () => q,
    eq: () => q,
    single: () => Promise.resolve({ data: { id: "run-1" }, error: null }),
    then: (res: (v: unknown) => unknown) => Promise.resolve({ data: null, error: null }).then(res),
  };
  const ports: RebuildPorts = {
    assertTarget: async (_a, code) => (seen.target.push(code), { ok: true, talentProfileId: "tp9", siteId: "s9", userId: "u9" }),
    loadRows: async (_a, code) => {
      seen.rows.push(code);
      return { tp: { id: "tp9", profile_code: code, user_id: "u9", display_name: "D" }, email: "e", demoBatch: DEMO_BATCH, site: { id: "s9" }, pages: [], home: { id: "h9" } };
    },
    plan: async (_a, spec) => {
      seen.specs.push(spec);
      return { design: { version: 3 }, draftSame: false, publishedInSync: false, trees: { shellTree: [], homeTree: [] }, nextTokens: {}, nextCustom: null } as never;
    },
    content: async (_a, entry) => (seen.entries.push(entry), []),
    writeDraft: async () => undefined,
    publish: async () => undefined,
    bust: (_tp, code) => void seen.bust.push(code),
  };
  const res = await rebuildDemos({ from: () => q } as never, { only: ["TAL-97003"], dryRun: false }, undefined, ports);
  assert.equal(res.rows.length, 1);
  assert.equal(res.rows[0]!.profileCode, "TAL-97003");
  assert.equal(res.rows[0]!.status, "wrote");
  assert.deepEqual(seen.target, ["TAL-97003"]);
  assert.deepEqual(seen.rows, ["TAL-97003"]);
  assert.deepEqual(seen.bust, ["TAL-97003"]);
  assert.ok(seen.specs.length > 0);
  for (const s of seen.specs) {
    assert.equal(s.profileCode, "TAL-97003");
    assert.equal(s.copyFrom, "TAL-93103");
  }
  assert.ok(seen.entries.every((e) => e.profileCode === "TAL-97003" && e.copyFrom === "TAL-93103"));
});

test("rebuild: on production the staging code is not found, so the guard refuses it before any read", async () => {
  const loads: string[] = [];
  const ports: RebuildPorts = {
    assertTarget: async (_a, code) => ({ ok: false, reason: `${code}: profile not found.` }),
    loadRows: async (_a, code) => (loads.push(code), {} as never),
    plan: async () => ({}) as never,
    content: async () => [],
    writeDraft: async () => undefined,
    publish: async () => undefined,
    bust: () => undefined,
  };
  const res = await rebuildDemos({ from: () => ({}) } as never, { only: ["TAL-97001"], dryRun: false }, undefined, ports);
  assert.equal(res.rows[0]!.status, "refused");
  assert.deepEqual(loads, []);
});

// ── content lookups resolve via copyFrom ─────────────────────────────────────

test("demoContentCode: copyFrom when set, the own code otherwise", () => {
  for (const [staging, canonical] of PAIRS) {
    assert.equal(demoContentCode(alias(staging)), canonical);
    assert.equal(demoContentCode(alias(canonical)), canonical);
  }
  assert.equal(demoContentCode({ profileCode: "TAL-93003" }), "TAL-93003");
});

test("content: Folio copy for TAL-97001 equals TAL-93011's", () => {
  assert.deepEqual(folioSiteCopyFor(demoContentCode(alias("TAL-97001"))), folioSiteCopyFor("TAL-93011"));
});

test("content: Maison v2 style for TAL-97002 equals TAL-93020's, TAL-97003 gets Linh's style", () => {
  assert.equal(MAISON_V2_DEMO_STYLES[demoContentCode(alias("TAL-97002"))], MAISON_V2_DEMO_STYLES["TAL-93020"]);
  const linh = MAISON_V2_DEMO_STYLES["TAL-93103"];
  assert.ok(linh, "Linh has a Maison v2 demo style");
  assert.equal(MAISON_V2_DEMO_STYLES["TAL-97003"], undefined, "the staging code alone has no style");
  assert.equal(MAISON_V2_DEMO_STYLES[demoContentCode(alias("TAL-97003"))], linh);
});

test("content: site switches, trade apps and the default fixture (hero facts, Location) follow the canonical demo", () => {
  for (const [staging, canonical] of PAIRS) {
    const a = alias(staging);
    assert.deepEqual(demoSiteSwitchColumns(demoContentCode(a)), demoSiteSwitchColumns(canonical), staging);
    assert.deepEqual(
      appsForDemo({ profileCode: demoContentCode(a) }).map((x) => x.nativeKind),
      appsForDemo({ profileCode: canonical }).map((x) => x.nativeKind),
      staging,
    );
    assert.deepEqual(defaultFixtureFor(a), defaultFixtureFor(alias(canonical)), staging);
  }
  // Linh: request-only with chat off, and her hero facts + Location reach the alias.
  assert.equal(demoSiteSwitchColumns(demoContentCode(alias("TAL-97003"))).chat_enabled, false);
  const linhFixture = defaultFixtureFor(alias("TAL-97003"));
  assert.ok(linhFixture.heroFacts, "Linh hero facts");
  assert.ok(linhFixture.location, "Linh Location");
});

// ── guard unchanged ──────────────────────────────────────────────────────────

test("static: the guard and the demo-account check never read copyFrom (identity stays the own code)", () => {
  const root = process.cwd();
  for (const rel of ["src/lib/talent-site/demos/guard.server.ts", "src/lib/talent-site/theme-catalog/demo-account.ts"]) {
    const src = fs.readFileSync(path.join(root, rel), "utf8");
    assert.ok(!src.includes("copyFrom"), `${rel} must not reference copyFrom`);
    assert.ok(!src.includes("demoContentCode"), `${rel} must not reference demoContentCode`);
  }
});
