import assert from "node:assert/strict";
import { test } from "node:test";

import { localizablePropsForKind } from "../../src/lib/i18n/builder-i18n-props";
import { glossFor, norm, profileGloss, seedGloss } from "./content";
import {
  FLAT_PROPS,
  hasNoCopy,
  looksSpanish,
  planProfile,
  planTree,
  run,
  TARGETS,
  type DemoSnapshot,
  type Io,
} from "./plan";
import type { DraftWriteInput, Node } from "../en-content-fill/ticker-plan";

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

// ---------------------------------------------------------------- trees

function homeTree(): Node[] {
  return [
    {
      id: "root",
      kind: "container",
      props: {},
      children: [
        { id: "rev", kind: "reviews", props: { eyebrow: "Reseñas", title: "Lo que dicen", items: [] } },
        { id: "vis", kind: "visit", props: { eyebrow: "Tu visita", title: "Dónde encontrarme", titleAccent: "", mapCaption: "Zona aproximada", extraFacts: [{ label: "Dónde", value: "García Ginerés, Mérida", note: "La dirección exacta llega al confirmar." }] } },
        { id: "cc", kind: "comp_card", props: { eyebrow: "", title: "Medidas · Ficha" } },
        { id: "sp", kind: "spec_table", props: { eyebrow: "Cómo trabajo", title: "Especificaciones", rows: [{ label: "Garantía", value: "6 meses por escrito en mano de obra" }, { label: "Voltaje", value: "127 V" }] } },
        { id: "st", kind: "stats", props: { variant: "spec", items: [{ label: "Respuesta", value: "En 1 o 2 días" }, { label: "Visita", value: "$400" }] } },
        { id: "h", kind: "heading", props: { level: 2, text: "Reseñas" } },
      ],
    },
  ];
}

function snapshot(code: string, over: Partial<DemoSnapshot["profile"]> = {}): DemoSnapshot {
  const t = TARGETS.find((x) => x.profileCode === code)!;
  const home = homeTree();
  return {
    profile: { id: `id-${code}`, profile_code: code, user_id: "user-1", is_demo: true, ...over },
    site: {
      id: `site-${code}`,
      site_slug: t.siteSlug,
      shell_tree: [],
      shell_published: [],
      design_tokens_draft: {},
      design_tokens: {},
      draft_rev: 3,
      site_published_at: "2026-10-01T00:00:00Z",
    },
    pages: [{ id: `page-${code}`, is_home: true, status: "published", blocks: home, blocks_published: clone(home), updated_at: "2026-10-01T00:00:00Z" }],
  };
}

// ---------------------------------------------------------------- a fake database

interface Db { snaps: Record<string, DemoSnapshot>; files: Record<string, unknown> }
interface Calls { drafts: DraftWriteInput[]; publishes: string[]; backups: string[] }

function fakeIo(db: Db, opts: { failPublish?: boolean; corrupt?: boolean } = {}): { io: Io; calls: Calls; logs: string[] } {
  const calls: Calls = { drafts: [], publishes: [], backups: [] };
  const logs: string[] = [];
  const io: Io = {
    async load(code) { return db.snaps[code] ? clone(db.snaps[code]!) : null; },
    async writeDraft(input) {
      calls.drafts.push(clone(input));
      const snap = Object.values(db.snaps).find((s) => s.site.id === input.siteId);
      if (!snap) return { ok: false, conflict: false, error: "no site" };
      if (snap.site.draft_rev !== input.expectedDraftRev) return { ok: false, conflict: true, error: "conflict" };
      if (input.shell) snap.site.shell_tree = clone(input.shell);
      if (input.home) {
        const page = snap.pages.find((p) => p.id === input.home!.pageId)!;
        page.blocks = opts.corrupt ? [] : clone(input.home.blocks);
      }
      snap.site.draft_rev = (snap.site.draft_rev ?? 0) + 1;
      return { ok: true, draftRev: snap.site.draft_rev };
    },
    async publish({ profileCode }) {
      calls.publishes.push(profileCode);
      if (opts.failPublish) return { ok: false, error: "boom" };
      const snap = db.snaps[profileCode]!;
      for (const p of snap.pages) p.blocks_published = clone(p.blocks);
      snap.site.shell_published = clone(snap.site.shell_tree);
      return { ok: true };
    },
    backup(label, data) {
      const path = `/tmp/backup-${label}-${calls.backups.length}.json`;
      calls.backups.push(path);
      db.files[path] = clone(data);
      return path;
    },
    readBackup(path) {
      if (!(path in db.files)) throw new Error(`no such file ${path}`);
      return clone(db.files[path]);
    },
    log: (l) => logs.push(l),
    now: () => "2026-10-08T00:00:00Z",
  };
  return { io, calls, logs };
}

const only = (code: string) => ["--only", code];
const find = (tree: Node[], id: string): Node | undefined => {
  for (const n of tree) {
    if (n.id === id) return n;
    const c = n.children ? find(n.children, id) : undefined;
    if (c) return c;
  }
  return undefined;
};
const enOf = (tree: Node[], id: string): Record<string, string> => ((find(tree, id)?.props?.i18n as { en?: Record<string, string> } | undefined)?.en) ?? {};

// ---------------------------------------------------------------- glossary

test("every flat prop the script writes is a registered localizable prop", () => {
  for (const [kind, props] of Object.entries(FLAT_PROPS)) {
    const reg = localizablePropsForKind(kind as never) as readonly string[];
    for (const p of props) assert.ok(reg.includes(p), `${kind}.${p} is not in builder-i18n-props`);
  }
});

test("seed glossary reads the dictionary backwards and drops ambiguous Spanish", () => {
  const g = seedGloss();
  assert.equal(g.get(norm("Reseñas"))?.en, "Reviews");
  assert.equal(g.get(norm("Garantía"))?.en, "Warranty");
  assert.equal(g.has(norm("Escríbeme")), false, "Escríbeme maps to two English seeds");
});

test("generic headings win and a demo's own typed English is matched cell by cell", () => {
  assert.equal(glossFor("TAL-93212").get(norm("Tu visita"))?.en, "Your visit");
  const g = profileGloss("TAL-93212");
  assert.equal(g.get(norm("Respuesta"))?.en, "Response");
  assert.equal(g.get(norm("En 1 o 2 días"))?.en, "Within 1 or 2 days");
  assert.equal(g.has(norm("Garantía")), false);
  assert.equal(profileGloss("TAL-93020").size, 0, "a demo without its own English adds nothing");
});

test("text helpers", () => {
  assert.equal(hasNoCopy("$400"), true);
  assert.equal(hasNoCopy("{{city}}"), true);
  assert.equal(hasNoCopy("Zona"), false);
  assert.equal(looksSpanish("Fuera de esta zona"), true);
  assert.equal(looksSpanish("Reviews"), false);
});

// ---------------------------------------------------------------- planner

test("planTree adds only en leaves, lists no-source Spanish, and ignores other kinds and numbers", () => {
  const plan = planTree("home", homeTree(), glossFor("TAL-93212"));
  const keys = plan.changes.map((c) => `${c.id}:${c.key}`).sort();
  assert.deepEqual(keys, [
    "cc:title",
    "rev:eyebrow",
    "rev:title",
    "sp:eyebrow",
    "sp:rows.0.label",
    "sp:rows.1.label",
    "sp:title",
    "st:items.0.label",
    "st:items.0.value",
    "st:items.1.label",
    "vis:extraFacts.0.label",
    "vis:eyebrow",
    "vis:mapCaption",
    "vis:title",
  ]);
  assert.equal(enOf(plan.after, "rev").title, "What they say");
  assert.equal(enOf(plan.after, "st")["items.0.value"], "Within 1 or 2 days");
  // not translated: the demo's own claims have no English source
  const needs = plan.needs.map((n) => `${n.id}:${n.key}`).sort();
  assert.deepEqual(needs, ["sp:rows.0.value", "vis:extraFacts.0.note", "vis:extraFacts.0.value"]);
  // the heading node (not one of the five kinds) and the "$400" cell are untouched
  assert.equal(find(plan.after, "h")?.props?.i18n, undefined);
  assert.equal(enOf(plan.after, "st")["items.1.value"], undefined);
  // base props and es are never touched
  assert.deepEqual({ ...find(plan.after, "rev")!.props, i18n: undefined }, { ...find(homeTree(), "rev")!.props, i18n: undefined });
});

test("a non-empty en is never overwritten and an existing es overlay is the source text", () => {
  const tree = homeTree();
  const rev = find(tree, "rev")!;
  rev.props = { ...rev.props, i18n: { en: { title: "Kind words" }, es: { eyebrow: "Reseñas" } } };
  const vis = find(tree, "vis")!;
  vis.props = { ...vis.props, eyebrow: "Your visit", i18n: { es: { eyebrow: "Tu visita" } } };
  const plan = planTree("home", tree, glossFor("TAL-93020"));
  assert.equal(enOf(plan.after, "rev").title, "Kind words");
  assert.equal(enOf(plan.after, "rev").eyebrow, "Reviews");
  assert.deepEqual((find(plan.after, "rev")!.props!.i18n as { es: unknown }).es, { eyebrow: "Reseñas" });
  assert.equal(enOf(plan.after, "vis").eyebrow, "Your visit");
  assert.ok(plan.enExists >= 1);
});

test("planning an already-patched tree is a no-op (idempotent)", () => {
  const first = planTree("home", homeTree(), glossFor("TAL-93212"));
  const second = planTree("home", first.after, glossFor("TAL-93212"));
  assert.equal(second.changes.length, 0);
  assert.deepEqual(second.after, first.after);
});

test("the shell tree is planned too", () => {
  const snap = snapshot("TAL-93212");
  snap.site.shell_tree = [{ id: "r", kind: "reviews", props: { title: "Reseñas" } }];
  const plan = planProfile(snap, TARGETS.find((t) => t.profileCode === "TAL-93212")!);
  assert.equal(plan.shell.changes.length, 1);
});

// ---------------------------------------------------------------- runner

test("dry run writes nothing and prints profile code, id and slug first", async () => {
  const db: Db = { snaps: { "TAL-93212": snapshot("TAL-93212") }, files: {} };
  const { io, calls, logs } = fakeIo(db);
  const r = await run(only("TAL-93212"), io);
  assert.equal(r.exitCode, 0);
  assert.equal(r.mode, "dry-run");
  assert.equal(calls.drafts.length + calls.publishes.length + calls.backups.length, 0);
  assert.ok(logs.some((l) => l.startsWith("TAL-93212 id=id-TAL-93212 site=ramon-gutierrez-pacheco is_demo=true")));
  assert.ok(logs.some((l) => l.includes("NEEDS ENGLISH")));
});

test("apply needs --yes and --yes needs --apply", async () => {
  const db: Db = { snaps: { "TAL-93212": snapshot("TAL-93212") }, files: {} };
  for (const argv of [["--apply"], ["--yes"]]) {
    const { io, calls } = fakeIo(db);
    const r = await run([...argv, ...only("TAL-93212")], io);
    assert.equal(r.exitCode, 2);
    assert.equal(calls.drafts.length, 0);
  }
});

test("refuses the real and test talents, off-list codes, non-demo profiles, slug mismatch and unknown flags", async () => {
  for (const code of ["TAL-93938", "TAL-93900", "TAL-90000"]) {
    const db: Db = { snaps: {}, files: {} };
    const { io, calls } = fakeIo(db);
    const r = await run(["--apply", "--yes", ...only(code)], io);
    assert.equal(r.exitCode, 2, code);
    assert.equal(calls.drafts.length, 0);
  }
  const notDemo: Db = { snaps: { "TAL-93212": snapshot("TAL-93212", { is_demo: false }) }, files: {} };
  const a = fakeIo(notDemo);
  assert.equal((await run(["--apply", "--yes", ...only("TAL-93212")], a.io)).exitCode, 2);
  assert.equal(a.calls.drafts.length, 0);

  const wrong = snapshot("TAL-93212");
  wrong.site.site_slug = "book-jorgelina";
  const b = fakeIo({ snaps: { "TAL-93212": wrong }, files: {} });
  assert.equal((await run(["--apply", "--yes", ...only("TAL-93212")], b.io)).exitCode, 2);

  const c = fakeIo({ snaps: {}, files: {} });
  assert.equal((await run(["--all"], c.io)).exitCode, 2);
});

test("apply: backup first, only en added, published because live equalled the draft, then idempotent", async () => {
  const db: Db = { snaps: { "TAL-93212": snapshot("TAL-93212") }, files: {} };
  const originalHome = clone(db.snaps["TAL-93212"]!.pages[0]!.blocks) as Node[];
  const { io, calls } = fakeIo(db);
  const r = await run(["--apply", "--yes", ...only("TAL-93212")], io);
  assert.equal(r.exitCode, 0);
  assert.equal(r.wrote, 1);
  assert.equal(r.published, 1);
  assert.equal(calls.backups.length, 1);
  assert.equal(calls.drafts.length, 1);
  assert.deepEqual(calls.publishes, ["TAL-93212"]);
  const live = db.snaps["TAL-93212"]!.pages[0]!;
  assert.deepEqual(live.blocks, live.blocks_published);
  assert.equal(enOf(live.blocks as Node[], "rev").title, "What they say");
  // everything but the en leaves is unchanged
  const stripped = clone(live.blocks) as Node[];
  const strip = (nodes: Node[]) => nodes.forEach((n) => { if (n.props?.i18n) delete n.props.i18n; if (n.children) strip(n.children); });
  strip(stripped);
  const strippedOrig = clone(originalHome);
  strip(strippedOrig);
  assert.deepEqual(stripped, strippedOrig);

  const again = fakeIo(db);
  const r2 = await run(["--apply", "--yes", ...only("TAL-93212")], again.io);
  assert.equal(r2.exitCode, 0);
  assert.equal(r2.wrote, 0);
  assert.equal(again.calls.drafts.length, 0);
  assert.equal(again.calls.backups.length, 0);
});

test("apply does not publish when live differed from the draft; --no-publish never publishes", async () => {
  const diff = snapshot("TAL-93212");
  (diff.pages[0]!.blocks_published as Node[]) = [];
  const a = fakeIo({ snaps: { "TAL-93212": diff }, files: {} });
  const r = await run(["--apply", "--yes", ...only("TAL-93212")], a.io);
  assert.equal(r.exitCode, 0);
  assert.equal(r.published, 0);
  assert.equal(a.calls.publishes.length, 0);

  const b = fakeIo({ snaps: { "TAL-93212": snapshot("TAL-93212") }, files: {} });
  const r2 = await run(["--apply", "--yes", "--no-publish", ...only("TAL-93212")], b.io);
  assert.equal(r2.published, 0);
  assert.equal(b.calls.publishes.length, 0);
});

test("a draft_rev conflict, a failed publish and a corrupt write all exit 1", async () => {
  const db: Db = { snaps: { "TAL-93212": snapshot("TAL-93212") }, files: {} };
  const conflict = fakeIo(db);
  const real = conflict.io.writeDraft;
  conflict.io.writeDraft = async (input) => real({ ...input, expectedDraftRev: 99 });
  assert.equal((await run(["--apply", "--yes", ...only("TAL-93212")], conflict.io)).exitCode, 1);

  const pub = fakeIo({ snaps: { "TAL-93212": snapshot("TAL-93212") }, files: {} }, { failPublish: true });
  assert.equal((await run(["--apply", "--yes", ...only("TAL-93212")], pub.io)).exitCode, 1);

  const bad = fakeIo({ snaps: { "TAL-93212": snapshot("TAL-93212") }, files: {} }, { corrupt: true });
  assert.equal((await run(["--apply", "--yes", ...only("TAL-93212")], bad.io)).exitCode, 1);
});

test("restore: dry run writes nothing, apply puts the old trees back, a changed tree is not restored", async () => {
  const db: Db = { snaps: { "TAL-93212": snapshot("TAL-93212") }, files: {} };
  const original = clone(db.snaps["TAL-93212"]!.pages[0]!.blocks);
  const first = fakeIo(db);
  await run(["--apply", "--yes", ...only("TAL-93212")], first.io);
  const path = first.calls.backups[0]!;

  const dry = fakeIo(db);
  const rd = await run(["--restore", path, ...only("TAL-93212")], dry.io);
  assert.equal(rd.exitCode, 0);
  assert.equal(rd.mode, "restore-dry-run");
  assert.equal(dry.calls.drafts.length, 0);

  const real = fakeIo(db);
  const rr = await run(["--restore", path, "--apply", "--yes", ...only("TAL-93212")], real.io);
  assert.equal(rr.exitCode, 0);
  assert.deepEqual(db.snaps["TAL-93212"]!.pages[0]!.blocks, original);
  assert.deepEqual(db.snaps["TAL-93212"]!.pages[0]!.blocks_published, original);

  // someone edited after the script: refuse to overwrite
  const db2: Db = { snaps: { "TAL-93212": snapshot("TAL-93212") }, files: {} };
  const w = fakeIo(db2);
  await run(["--apply", "--yes", ...only("TAL-93212")], w.io);
  const edited = db2.snaps["TAL-93212"]!.pages[0]!.blocks as Node[];
  edited.push({ id: "extra", kind: "paragraph", props: { text: "mine" } });
  const r3 = fakeIo(db2);
  const res = await run(["--restore", w.calls.backups[0]!, "--apply", "--yes", ...only("TAL-93212")], r3.io);
  assert.equal(res.exitCode, 1);
  assert.equal(r3.calls.drafts.length, 0);
});

test("restore refuses a backup that names a forbidden or off-list profile", async () => {
  const db: Db = { snaps: {}, files: { "/tmp/x.json": { kind: "demo-block-en-overlays", entries: [{ profileCode: "TAL-93938", profileId: "p", siteSlug: "book-jorgelina", siteId: "s", home: null, shell: null }] } } };
  const { io, calls } = fakeIo(db);
  const r = await run(["--restore", "/tmp/x.json", "--apply", "--yes"], io);
  assert.equal(r.exitCode, 2);
  assert.equal(calls.drafts.length, 0);
});

test("the allow-list never contains the real or test talent", () => {
  for (const t of TARGETS) {
    assert.notEqual(t.profileCode, "TAL-93938");
    assert.notEqual(t.profileCode, "TAL-93900");
  }
});
