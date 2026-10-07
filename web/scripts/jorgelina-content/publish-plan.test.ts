import assert from "node:assert/strict";
import test from "node:test";

import {
  assertMode,
  assertProfileCode,
  assertSiteSlug,
  diffLeaves,
  findAnchors,
  flatten,
  parseArgs,
  run,
  type Io,
  type PageRow,
  type Snapshot,
} from "./publish-plan";

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

/** The shape these tests edit: a page tree node (children always present in the fixtures). */
interface TestNode { id?: string; kind?: string; props: Record<string, unknown>; children: TestNode[] }

const PUBLISHED_HOME = [
  {
    id: "hero",
    kind: "section",
    props: {},
    children: [
      { id: "h1", kind: "heading", props: { level: 1, text: "{{displayName}}", liveText: "hero_title" } },
      { id: "lede", kind: "paragraph", props: { text: "{{tagline}}", liveText: "hero_tagline", layerLabel: "Hero lede" } },
      { id: "cta", kind: "button", props: { label: "Reservar" } },
    ],
  },
  { id: "tick", kind: "marquee", props: { items: [{ text: "Uno" }, { text: "Dos" }, { text: "Tres" }] } },
];

function approvedDraft() {
  const d = clone(PUBLISHED_HOME) as unknown as TestNode[];
  const [h1, lede] = d[0].children;
  h1.props.text = "Pestañas que enmarcan tu mirada.";
  h1.props.i18n = { es: { text: "Pestañas que enmarcan tu mirada." }, en: { text: "Lashes that frame your look." } };
  delete h1.props.liveText;
  lede.props.text = "Lashista en Playa del Carmen";
  lede.props.i18n = { es: { text: "Lashista en Playa del Carmen" }, en: { text: "Lash artist in Playa del Carmen" } };
  delete lede.props.liveText;
  d[1].props.items = [{ text: "Clásicas" }, { text: "Volumen" }];
  return d;
}

function snapshot(over: { draft?: unknown; published?: unknown; slug?: string; code?: string; extraPage?: Partial<PageRow>; shellDraft?: unknown; status?: string } = {}): Snapshot {
  const pages: PageRow[] = [
    {
      id: "home-1",
      is_home: true,
      status: over.status ?? "published",
      blocks: over.draft ?? approvedDraft(),
      blocks_published: over.published ?? clone(PUBLISHED_HOME),
      updated_at: "2026-10-07T10:00:00Z",
    },
    { id: "about-1", is_home: false, status: "published", blocks: [{ id: "a", kind: "paragraph", props: { text: "Hola" } }], blocks_published: [{ id: "a", kind: "paragraph", props: { text: "Hola" } }], updated_at: "2026-10-01T00:00:00Z" },
  ];
  if (over.extraPage) pages[1] = { ...pages[1]!, ...over.extraPage };
  return {
    profile: { id: "prof-1", profile_code: over.code ?? "TAL-93938" },
    site: {
      id: "site-1",
      site_slug: over.slug ?? "book-jorgelina",
      shell_tree: [{ id: "nav", kind: "nav", props: { a: 1 } }],
      shell_published: [{ id: "nav", kind: "nav", props: { a: 1 } }],
      design_tokens_draft: { "--c": "#fff" },
      design_tokens: { "--c": "#fff" },
    },
    pages,
  };
}

interface Fake {
  io: Io;
  logs: string[];
  state: { snap: Snapshot };
  calls: { publish: number; bust: number; backups: string[]; load: number };
}

function fake(snap: Snapshot, opts: { bustOk?: boolean; matched?: boolean; corruptAfter?: (s: Snapshot) => void } = {}): Fake {
  const state = { snap: clone(snap) };
  const logs: string[] = [];
  const calls = { publish: 0, bust: 0, backups: [] as string[], load: 0 };
  const io: Io = {
    async load(code) {
      calls.load++;
      return state.snap.profile.profile_code === code || code === "TAL-93938" ? clone(state.snap) : null;
    },
    async publishHome({ pageId, expectedUpdatedAt, blocks, now }) {
      calls.publish++;
      if (opts.matched === false) return { ok: true, matched: false };
      const p = state.snap.pages.find((x) => x.id === pageId)!;
      if (p.updated_at !== expectedUpdatedAt) return { ok: true, matched: false };
      p.blocks_published = clone(blocks);
      p.updated_at = now;
      opts.corruptAfter?.(state.snap);
      return { ok: true, matched: true };
    },
    async bust() {
      calls.bust++;
      return opts.bustOk === false ? { ok: false, error: "no secret" } : { ok: true };
    },
    backup(name) {
      const path = `/tmp/${name}.json`;
      calls.backups.push(path);
      return path;
    },
    log: (l) => logs.push(l),
    now: () => "2026-10-07T12:00:00Z",
  };
  return { io, logs, state, calls };
}

// ------------------------------------------------------------ guards

test("guards: only TAL-93938 on book-jorgelina", () => {
  assertProfileCode("TAL-93938");
  assert.throws(() => assertProfileCode("TAL-93900"), /QA talent/);
  assert.throws(() => assertProfileCode("TAL-93001"), /only TAL-93938/);
  assertSiteSlug("book-jorgelina");
  assert.throws(() => assertSiteSlug("jorg-beauty-qa"), /QA site/);
  assert.throws(() => assertSiteSlug("other"), /expected book-jorgelina/);
  assert.throws(() => assertSiteSlug(null), /expected book-jorgelina/);
});

test("guards: mode flags", () => {
  assert.doesNotThrow(() => assertMode(parseArgs([])));
  assert.doesNotThrow(() => assertMode(parseArgs(["--publish", "--yes"])));
  assert.throws(() => assertMode(parseArgs(["--publish"])), /needs --yes/);
  assert.throws(() => assertMode(parseArgs(["--yes"])), /without --publish/);
  assert.throws(() => parseArgs(["--force"]), /unknown argument/);
});

test("refuses a forbidden profile before reading anything", async () => {
  const f = fake(snapshot());
  const r = await run(["--profile", "TAL-93900"], f.io);
  assert.equal(r.status, "refused");
  assert.equal(r.exitCode, 2);
  assert.equal(f.calls.load, 0);
});

test("refuses when the resolved site is the QA site", async () => {
  const f = fake(snapshot({ slug: "jorg-beauty-qa" }));
  const r = await run(["--publish", "--yes"], f.io);
  assert.equal(r.status, "refused");
  assert.equal(f.calls.publish, 0);
});

test("--publish without --yes is refused and reads nothing", async () => {
  const f = fake(snapshot());
  const r = await run(["--publish"], f.io);
  assert.equal(r.status, "refused");
  assert.equal(f.calls.load, 0);
  assert.equal(f.calls.publish, 0);
});

// ------------------------------------------------------------ diff

test("flatten + diffLeaves yield leaf paths", () => {
  assert.deepEqual([...flatten([{ a: { b: 1 } }, 2]).entries()], [["[0].a.b", 1], ["[1]", 2]]);
  assert.deepEqual(diffLeaves({ a: 1 }, { a: 2, b: 3 }, "x:").map((c) => c.path), ["x:.a", "x:.b"]);
});

test("dry run prints the approved diff and writes nothing", async () => {
  const f = fake(snapshot());
  const r = await run([], f.io);
  assert.equal(r.status, "dry-run");
  assert.equal(r.exitCode, 0);
  assert.equal(f.calls.publish, 0);
  assert.equal(f.calls.backups.length, 0);
  const out = f.logs.join("\n");
  assert.match(out, /home:\[0\]\.children\[0\]\.props\.i18n\.en\.text/);
  assert.match(out, /home:\[0\]\.children\[1\]\.props\.liveText/);
  assert.match(out, /home:\[1\]\.props\.items\[0\]\.text/);
  assert.match(out, /DRY RUN/);
});

test("allow-listed diff publishes, backs up first, verifies, busts cache", async () => {
  const f = fake(snapshot());
  const r = await run(["--publish", "--yes"], f.io);
  assert.equal(r.status, "published");
  assert.equal(r.exitCode, 0);
  assert.equal(f.calls.publish, 1);
  assert.equal(f.calls.backups.length, 1);
  assert.equal(f.calls.bust, 1);
  assert.equal(f.calls.load, 2, "re-read after publishing");
  assert.deepEqual(f.state.snap.pages[0]!.blocks_published, approvedDraft());
  assert.match(f.logs.join("\n"), /Verified/);
});

test("a removed marquee item (draft shorter than published) is still approved", async () => {
  const f = fake(snapshot());
  const r = await run([], f.io);
  assert.equal(r.status, "dry-run");
  assert.match(f.logs.join("\n"), /home:\[1\]\.props\.items\[2\]\.text/);
});

test("no diff is a no-op", async () => {
  const f = fake(snapshot({ draft: clone(PUBLISHED_HOME) }));
  const r = await run(["--publish", "--yes"], f.io);
  assert.equal(r.status, "no-op");
  assert.equal(r.exitCode, 0);
  assert.equal(f.calls.publish, 0);
  assert.equal(f.calls.backups.length, 0);
});

// ------------------------------------------------------------ unexpected diffs refuse

test("an unrelated edit on the home page refuses and lists the path", async () => {
  const d = approvedDraft();
  d[0].children[2].props.label = "Compra ya";
  const f = fake(snapshot({ draft: d }));
  const r = await run(["--publish", "--yes"], f.io);
  assert.equal(r.status, "refused");
  assert.equal(r.exitCode, 2);
  assert.equal(f.calls.publish, 0);
  assert.match(f.logs.join("\n"), /home:\[0\]\.children\[2\]\.props\.label/);
});

test("liveText may only be removed, not changed", async () => {
  const d = approvedDraft();
  d[0].children[0].props.liveText = "something_else";
  const f = fake(snapshot({ draft: d }));
  assert.equal((await run(["--publish", "--yes"], f.io)).status, "refused");
});

test("a changed marquee item prop other than text refuses", async () => {
  const d = approvedDraft();
  d[1].props.items[0].icon = "star";
  const f = fake(snapshot({ draft: d }));
  const r = await run([], f.io);
  assert.equal(r.status, "refused");
  assert.match(f.logs.join("\n"), /items\[0\]\.icon/);
});

test("another page with an unpublished draft refuses", async () => {
  const f = fake(snapshot({ extraPage: { blocks: [{ id: "a", kind: "paragraph", props: { text: "Cambio" } }] } }));
  const r = await run(["--publish", "--yes"], f.io);
  assert.equal(r.status, "refused");
  assert.match(f.logs.join("\n"), /page\(about-1\)/);
});

test("a draft shell or token difference refuses", async () => {
  const s = snapshot();
  s.site.shell_tree = [{ id: "nav", kind: "nav", props: { a: 2 } }];
  assert.match((await (async () => { const f = fake(s); await run([], f.io); return f.logs.join("\n"); })()), /shell:/);
  const t = snapshot();
  t.site.design_tokens_draft = { "--c": "#000" };
  const f = fake(t);
  assert.equal((await run([], f.io)).status, "refused");
  assert.match(f.logs.join("\n"), /tokens:/);
});

test("ambiguous headline (two h1 in the draft) is not approved", async () => {
  const d = approvedDraft();
  d[0].children.push({ id: "h1b", kind: "heading", props: { level: 1, text: "extra" } });
  const f = fake(snapshot({ draft: d }));
  assert.equal((await run([], f.io)).status, "refused");
});

test("home page that is not live is refused", async () => {
  const f = fake(snapshot({ status: "draft" }));
  assert.equal((await run(["--publish", "--yes"], f.io)).status, "refused");
});

// ------------------------------------------------------------ write and verify failures

test("compare-and-swap miss writes nothing and fails", async () => {
  const f = fake(snapshot(), { matched: false });
  const r = await run(["--publish", "--yes"], f.io);
  assert.equal(r.status, "failed");
  assert.equal(r.exitCode, 1);
  assert.equal(f.calls.bust, 0);
});

test("verification catches a side effect on another row", async () => {
  const f = fake(snapshot(), { corruptAfter: (s) => { s.site.design_tokens = { "--c": "#123" }; } });
  const r = await run(["--publish", "--yes"], f.io);
  assert.equal(r.status, "failed");
  assert.equal(r.exitCode, 1);
  assert.match(f.logs.join("\n"), /something other than the home page/);
  assert.equal(f.calls.bust, 0);
});

test("a failed cache bust is a warning; the publish stands", async () => {
  const f = fake(snapshot(), { bustOk: false });
  const r = await run(["--publish", "--yes"], f.io);
  assert.equal(r.status, "published");
  assert.equal(r.exitCode, 0);
  assert.match(f.logs.join("\n"), /WARN: cache not cleared/);
});

test("the hero lede is anchored by path even when the page has many other paragraphs (dry-run refusal regression)", () => {
  const extra = (n: number): TestNode => ({ id: `p${n}`, kind: "paragraph", props: { text: `Parrafo ${n}` }, children: [] });
  const published = clone(PUBLISHED_HOME) as unknown as TestNode[];
  published[0].children.push(extra(1), extra(2));
  published.splice(1, 0, { id: "about", kind: "section", props: {}, children: [extra(3), extra(4)] });
  const draft = clone(published) as unknown as TestNode[];
  const lede = draft[0].children[1];
  lede.props.text = "Lashista en Playa del Carmen";
  lede.props.i18n = { es: { text: "Lashista en Playa del Carmen" }, en: { text: "Lash artist in Playa del Carmen" } };
  delete lede.props.liveText;
  const a = findAnchors(published, draft);
  assert.equal(a.lede, "[0].children[1]");
  // If the draft node at that path is not a paragraph, nothing is approved.
  const broken = clone(draft) as unknown as TestNode[];
  broken[0].children[1] = { id: "lede", kind: "button", props: { label: "x" }, children: [] };
  assert.equal(findAnchors(published, broken).lede, null);
  // A different node id at the same path is not the same node.
  const swapped = clone(draft) as unknown as TestNode[];
  swapped[0].children[1].id = "other";
  assert.equal(findAnchors(published, swapped).lede, null);
});
