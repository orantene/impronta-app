import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { transformSync } from "esbuild";

import { sameJson } from "./guards";
import {
  findMarquees,
  planTicker,
  planTree,
  run,
  type DraftWriteInput,
  type Io,
  type Node,
  type PageRow,
  type Snapshot,
} from "./ticker-plan";

const HERE = dirname(fileURLToPath(import.meta.url));
const PID = "11111111-1111-4111-8111-111111111111";
const OTHER_PID = "22222222-2222-4222-8222-222222222222";
const SITE_ID = "site-1";

const marquee = (id: string, props: Record<string, unknown> = {}): Node => ({
  id,
  kind: "marquee",
  props: { items: [{ text: "Extensiones clásicas" }, { text: "Lifting de pestañas" }], speed: "slow", separator: "star", ...props },
});

function homeTree(extra: Node[] = []): Node[] {
  return [
    { id: "hero", kind: "section", children: [{ id: "h1", kind: "heading", props: { level: 1, text: "Hola" } }] },
    { id: "band", kind: "section", children: [marquee("m-home")] },
    { id: "para", kind: "paragraph", props: { text: "texto" } },
    ...extra,
  ];
}
const shellTree = (): Node[] => [{ id: "hdr", kind: "header", props: { logo: "x" } }];

function snapshot(over: { home?: Node[]; homePub?: Node[] | null; shell?: Node[]; shellPub?: Node[]; extraPages?: PageRow[]; sitePublished?: boolean; homeStatus?: string; userId?: string | null } = {}): Snapshot {
  const home = over.home ?? homeTree();
  const shell = over.shell ?? shellTree();
  return {
    profile: { id: PID, profile_code: "TAL-93900", user_id: over.userId === undefined ? "user-1" : over.userId },
    site: {
      id: SITE_ID,
      site_slug: "jorg-beauty-qa",
      shell_tree: shell,
      shell_published: over.shellPub ?? JSON.parse(JSON.stringify(shell)),
      design_tokens_draft: { "--color-bg": "#fff" },
      design_tokens: { "--color-bg": "#fff" },
      draft_rev: 7,
      site_published_at: over.sitePublished === false ? null : "2026-10-01T00:00:00Z",
    },
    pages: [
      { id: "page-home", is_home: true, status: over.homeStatus ?? "published", blocks: home, blocks_published: over.homePub === undefined ? JSON.parse(JSON.stringify(home)) : over.homePub, updated_at: "2026-10-01T00:00:00Z" },
      ...(over.extraPages ?? []),
    ],
  };
}

interface Calls { drafts: DraftWriteInput[]; publishes: number; backups: Array<{ label: string; data: unknown; path: string }> }

function fakeIo(
  state: { snap: Snapshot; other?: Snapshot; files: Record<string, unknown> },
  opts: { conflict?: boolean; publishFails?: boolean; corruptDraft?: boolean } = {},
): { io: Io; calls: Calls; lines: string[] } {
  const calls: Calls = { drafts: [], publishes: 0, backups: [] };
  const lines: string[] = [];
  const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
  const io: Io = {
    async load(code) {
      if (code === "TAL-93900") return clone(state.snap);
      if (code === "TAL-93938" && state.other) return clone(state.other);
      return null;
    },
    async writeDraft(input) {
      calls.drafts.push(clone(input));
      if (opts.conflict || input.expectedDraftRev !== state.snap.site.draft_rev) return { ok: false, conflict: true, error: "Updated in another tab" };
      if (input.shell) state.snap.site.shell_tree = opts.corruptDraft ? [] : clone(input.shell);
      if (input.home) {
        const page = state.snap.pages.find((p) => p.id === input.home!.pageId);
        if (!page) return { ok: false, conflict: false, error: "page not found" };
        page.blocks = clone(input.home.blocks);
      }
      state.snap.site.draft_rev = (state.snap.site.draft_rev ?? 0) + 1;
      return { ok: true, draftRev: state.snap.site.draft_rev };
    },
    async publish() {
      calls.publishes++;
      if (opts.publishFails) return { ok: false, error: "boom" };
      state.snap.site.shell_published = clone(state.snap.site.shell_tree);
      for (const p of state.snap.pages) p.blocks_published = clone(p.blocks);
      return { ok: true };
    },
    backup(label, data) {
      const path = `/tmp/ticker-${label}-${calls.backups.length}.json`;
      calls.backups.push({ label, data: clone(data), path });
      state.files[path] = clone(data);
      return path;
    },
    readBackup(path) {
      if (!(path in state.files)) throw new Error("no such file");
      return clone(state.files[path]);
    },
    log: (l) => lines.push(l),
    now: () => "2026-10-08T00:00:00.000Z",
  };
  return { io, calls, lines };
}

const state = (snap: Snapshot) => ({ snap, files: {} as Record<string, unknown> });

// ---------------------------------------------------------------- pure planner

test("planTree: patches a marquee with no source or source custom, keeps items and every other prop", () => {
  for (const props of [{}, { source: "custom" }]) {
    const tree = homeTree();
    (tree[1]!.children![0]! as Node).props = { ...(marquee("m-home", props).props) };
    const p = planTree("home", tree);
    assert.deepEqual(p.candidates, [{ path: "[1].children[0]", id: "m-home" }]);
    const m = (p.after[1]!.children![0]! as Node);
    assert.equal(m.props!.source, "services");
    assert.deepEqual(m.props!.items, (tree[1]!.children![0]! as Node).props!.items, "typed words kept as the fallback");
    assert.equal(m.props!.speed, "slow");
    assert.equal(m.props!.separator, "star");
    assert.equal(m.id, "m-home");
    // The input is not mutated.
    assert.equal((tree[1]!.children![0]! as Node).props!.source, props.source);
  }
});

test("planTree: leaves a ticker that already has a source, a ticker with no items, and every other kind of node alone", () => {
  const tree: Node[] = [
    marquee("a", { source: "services" }),
    marquee("b", { source: "mystery" }),
    marquee("c", { items: [] }),
    { id: "d", kind: "paragraph", props: { text: "x", source: "custom" } },
    { id: "e", kind: "heading", props: { level: 2 } },
  ];
  const p = planTree("home", tree);
  assert.equal(p.candidates.length, 0);
  assert.deepEqual(p.already.map((a) => a.id), ["a"]);
  assert.deepEqual(p.skipped.map((s) => s.id).sort(), ["b", "c"]);
  assert.ok(sameJson(p.after, tree), "tree unchanged");
});

test("planTree: the change set is exactly one source leaf per candidate", () => {
  const p = planTree("home", homeTree());
  assert.equal(p.candidates.length, 1);
  assert.equal(findMarquees(p.after).length, 1);
});

test("planTicker: more than the expected tickers in one tree refuses", () => {
  const home = homeTree([{ id: "band2", kind: "section", children: [marquee("m2")] }]);
  assert.throws(() => planTicker(snapshot({ home })), /at most 1 is expected/);
});

test("planTicker: not exactly one home page refuses", () => {
  const snap = snapshot();
  snap.pages.push({ id: "p2", is_home: true, status: "published", blocks: [], blocks_published: [], updated_at: "x" });
  assert.throws(() => planTicker(snap), /exactly 1 home page/);
});

test("planTicker: a ticker in the shell is found too; live-equals-draft is computed strictly", () => {
  const shell: Node[] = [{ id: "ftr", kind: "footer", children: [marquee("m-shell")] }];
  const plan = planTicker(snapshot({ shell }));
  assert.equal(plan.shell.candidates.length, 1);
  assert.equal(plan.home.candidates.length, 1);
  assert.equal(plan.liveEqualsDraft, true);
  const unpublishedPage = planTicker(snapshot({ extraPages: [{ id: "p2", is_home: false, status: "draft", blocks: [{ id: "x", kind: "paragraph" }], blocks_published: null, updated_at: "x" }] }));
  assert.equal(unpublishedPage.liveEqualsDraft, false);
  assert.match(unpublishedPage.liveEqualsDraftWhy.join(), /page p2/);
  assert.equal(planTicker(snapshot({ sitePublished: false })).liveEqualsDraft, false);
});

// ---------------------------------------------------------------- guards

for (const argv of [
  ["--apply"],
  ["--apply", "--site", "TAL-93938"],
  ["--site", "TAL-93938"],
  ["--apply", "--all"],
  ["--apply", "--site", "TAL-93901"],
  ["--apply", "--site", "TAL-12345"],
  ["--publish"],
  ["--yes"],
]) {
  test(`refused with exit non-zero before any read or write: ${argv.join(" ")}`, async () => {
    const st = { ...state(snapshot()), other: snapshot() };
    const { io, calls, lines } = fakeIo(st);
    let loads = 0;
    const counted: Io = { ...io, load: async (c) => { loads++; return io.load(c); } };
    const res = await run(argv, counted);
    assert.notEqual(res.exitCode, 0);
    assert.equal(res.status, "refused");
    assert.equal(loads, 0);
    assert.equal(calls.drafts.length + calls.publishes + calls.backups.length, 0);
    assert.ok(lines.some((l) => l.startsWith("REFUSED")));
  });
}

test("a profile resolving to the wrong site slug is refused", async () => {
  const snap = snapshot();
  snap.site.site_slug = "book-jorgelina";
  const { io, calls } = fakeIo(state(snap));
  const res = await run(["--apply", "--site", "TAL-93900"], io);
  assert.equal(res.exitCode, 2);
  assert.equal(calls.drafts.length, 0);
});

// ---------------------------------------------------------------- dry run

test("dry run: prints code, id, slug, the nodes by path and id, writes nothing", async () => {
  const st = state(snapshot());
  const { io, calls, lines } = fakeIo(st);
  const res = await run([], io);
  assert.equal(res.exitCode, 0);
  assert.equal(res.status, "dry-run");
  assert.equal(lines[0], `Target: code=TAL-93900 id=${PID} site=jorg-beauty-qa`);
  const text = lines.join("\n");
  assert.match(text, /~ \[1\]\.children\[0\] \(id m-home\): props\.source \(absent or custom\) -> "services"; typed items kept/);
  assert.match(text, /Live site equals the draft/);
  assert.match(text, /will PUBLISH/);
  assert.equal(calls.drafts.length + calls.publishes + calls.backups.length, 0);
});

test("dry run on a site where live differs from the draft says needs publish", async () => {
  const st = state(snapshot({ homePub: homeTree([{ id: "old", kind: "paragraph" }]) }));
  const { io, lines } = fakeIo(st);
  await run([], io);
  assert.match(lines.join("\n"), /NEEDS PUBLISH/);
});

// ---------------------------------------------------------------- apply

test("apply: backup first, draft written with the CAS rev, verified, then published when live equalled the draft", async () => {
  const st = state(snapshot());
  const { io, calls, lines } = fakeIo(st);
  const res = await run(["--apply", "--site", "TAL-93900"], io);
  assert.equal(res.exitCode, 0, lines.join("\n"));
  assert.equal(res.status, "applied");
  assert.equal(res.published, true);
  assert.equal(calls.backups.length, 1);
  assert.equal(calls.drafts.length, 1);
  assert.equal(calls.drafts[0]!.expectedDraftRev, 7);
  assert.equal(calls.drafts[0]!.kind, "edit");
  assert.equal(calls.drafts[0]!.siteId, SITE_ID);
  assert.equal(calls.drafts[0]!.shell, undefined, "no shell ticker, the shell is not written");
  const home = st.snap.pages[0]!;
  const m = findMarquees(home.blocks)[0]!.node;
  assert.equal(m.props!.source, "services");
  assert.equal(m.props!.items && (m.props!.items as unknown[]).length, 2);
  assert.ok(sameJson(home.blocks_published, home.blocks));
  assert.equal(calls.publishes, 1);
  const backup = calls.backups[0]!.data as { home: { before: Node[] }; profile: { code: string }; willPublish: boolean };
  assert.equal(backup.profile.code, "TAL-93900");
  assert.equal(backup.willPublish, true);
  assert.equal(findMarquees(backup.home.before)[0]!.node.props!.source, undefined, "the backup holds the OLD tree");
});

test("apply: when live differs from the draft the draft is patched and it is NOT published (needs publish)", async () => {
  const st = state(snapshot({ homePub: homeTree([{ id: "x", kind: "paragraph" }]) }));
  const { io, calls, lines } = fakeIo(st);
  const res = await run(["--apply", "--site", "TAL-93900"], io);
  assert.equal(res.exitCode, 0, lines.join("\n"));
  assert.equal(res.status, "needs-publish");
  assert.equal(res.published, false);
  assert.equal(calls.publishes, 0);
  assert.equal(findMarquees(st.snap.pages[0]!.blocks_published)[0]!.node.props!.source, undefined, "live untouched");
  assert.match(lines.join("\n"), /NEEDS PUBLISH/);
});

test("apply with --no-publish never publishes", async () => {
  const st = state(snapshot());
  const { io, calls } = fakeIo(st);
  const res = await run(["--apply", "--site", "TAL-93900", "--no-publish"], io);
  assert.equal(res.status, "needs-publish");
  assert.equal(calls.publishes, 0);
});

test("apply: a site that was never published, or a draft home, is not published", async () => {
  for (const snap of [snapshot({ sitePublished: false }), snapshot({ homeStatus: "draft" }), snapshot({ userId: null })]) {
    const { io, calls } = fakeIo(state(snap));
    const res = await run(["--apply", "--site", "TAL-93900"], io);
    assert.equal(res.exitCode, 0);
    assert.equal(calls.publishes, 0);
    assert.equal(res.status, "needs-publish");
  }
});

test("apply: a draft_rev conflict writes nothing and exits 1", async () => {
  const st = state(snapshot());
  const { io, calls, lines } = fakeIo(st, { conflict: true });
  const res = await run(["--apply", "--site", "TAL-93900"], io);
  assert.equal(res.exitCode, 1);
  assert.equal(calls.publishes, 0);
  assert.match(lines.join("\n"), /draft_rev moved/);
  assert.equal(findMarquees(st.snap.pages[0]!.blocks)[0]!.node.props!.source, undefined);
});

test("apply: a draft that does not read back as planned fails verification and does not publish", async () => {
  const shell: Node[] = [{ id: "ftr", kind: "footer", children: [marquee("m-shell")] }];
  const st = state(snapshot({ shell }));
  const { io, calls, lines } = fakeIo(st, { corruptDraft: true });
  const res = await run(["--apply", "--site", "TAL-93900"], io);
  assert.equal(res.exitCode, 1);
  assert.equal(calls.publishes, 0);
  assert.match(lines.join("\n"), /FAILED VERIFICATION/);
});

test("apply: a failing publish exits 1 and says the draft is patched but live is not", async () => {
  const st = state(snapshot());
  const { io, lines } = fakeIo(st, { publishFails: true });
  const res = await run(["--apply", "--site", "TAL-93900"], io);
  assert.equal(res.exitCode, 1);
  assert.match(lines.join("\n"), /Needs publish/);
});

test("apply twice: the second run is a no-op", async () => {
  const st = state(snapshot());
  const { io, calls } = fakeIo(st);
  await run(["--apply", "--site", "TAL-93900"], io);
  const drafts = calls.drafts.length;
  const again = await run(["--apply", "--site", "TAL-93900"], io);
  assert.equal(again.status, "no-op");
  assert.equal(calls.drafts.length, drafts);
});

test("already patched in the draft but not live: reports needs publish and writes nothing", async () => {
  const patched = homeTree();
  (patched[1]!.children![0]! as Node).props!.source = "services";
  const st = state(snapshot({ home: patched, homePub: homeTree() }));
  const { io, calls } = fakeIo(st);
  const res = await run(["--apply", "--site", "TAL-93900"], io);
  assert.equal(res.status, "needs-publish");
  assert.equal(calls.drafts.length, 0);
});

test("a ticker in the shell is patched through the same writer, home untouched when it has none", async () => {
  const home: Node[] = [{ id: "hero", kind: "section" }];
  const shell: Node[] = [{ id: "ftr", kind: "footer", children: [marquee("m-shell")] }];
  const st = state(snapshot({ home, shell }));
  const { io, calls } = fakeIo(st);
  const res = await run(["--apply", "--site", "TAL-93900"], io);
  assert.equal(res.exitCode, 0);
  assert.equal(calls.drafts[0]!.home, undefined);
  assert.ok(calls.drafts[0]!.shell);
  assert.equal(findMarquees(st.snap.site.shell_tree)[0]!.node.props!.source, "services");
});

// ---------------------------------------------------------------- restore

test("restore: dry run by default; apply puts the old tree back through the draft writer and republishes", async () => {
  const st = state(snapshot());
  const original = JSON.parse(JSON.stringify(st.snap)) as Snapshot;
  const { io, calls } = fakeIo(st);
  const applied = await run(["--apply", "--site", "TAL-93900"], io);
  const file = applied.backupPath as string;
  const drafts = calls.drafts.length;

  const dry = await run(["--restore", file], io);
  assert.equal(dry.status, "restore-dry-run");
  assert.equal(calls.drafts.length, drafts);
  assert.equal((await run(["--restore", file, "--apply"], io)).exitCode, 2);
  assert.equal(calls.drafts.length, drafts);

  const res = await run(["--restore", file, "--apply", "--site", "TAL-93900"], io);
  assert.equal(res.exitCode, 0);
  assert.equal(res.status, "restored");
  assert.equal(calls.drafts.at(-1)!.kind, "restore");
  assert.ok(calls.backups.some((b) => b.label === "restore-undo"));
  assert.ok(sameJson(st.snap.pages[0]!.blocks, original.pages[0]!.blocks));
  assert.ok(sameJson(st.snap.pages[0]!.blocks_published, original.pages[0]!.blocks_published), "live republished back too, since live equalled the draft");
});

test("restore: a draft edited after the patch is NOT overwritten", async () => {
  const st = state(snapshot());
  const { io, calls, lines } = fakeIo(st);
  const applied = await run(["--apply", "--site", "TAL-93900"], io);
  st.snap.pages[0]!.blocks = [...(st.snap.pages[0]!.blocks as Node[]), { id: "new", kind: "paragraph" }];
  st.snap.pages[0]!.blocks_published = JSON.parse(JSON.stringify(st.snap.pages[0]!.blocks));
  const drafts = calls.drafts.length;
  const res = await run(["--restore", applied.backupPath as string, "--apply", "--site", "TAL-93900"], io);
  assert.equal(res.exitCode, 1);
  assert.equal(calls.drafts.length, drafts);
  assert.match(lines.join("\n"), /changed since this script wrote it; NOT restored/);
});

test("restore: a backup for another profile, site or a garbage file is refused", async () => {
  const st = state(snapshot());
  const { io, calls } = fakeIo(st);
  const applied = await run(["--apply", "--site", "TAL-93900"], io);
  const good = st.files[applied.backupPath as string] as { profile: { id: string; code: string; siteSlug: string }; siteId: string };
  const drafts = calls.drafts.length;
  st.files["/x/id.json"] = { ...good, profile: { ...good.profile, id: OTHER_PID } };
  st.files["/x/code.json"] = { ...good, profile: { ...good.profile, code: "TAL-93938" } };
  st.files["/x/slug.json"] = { ...good, profile: { ...good.profile, siteSlug: "book-jorgelina" } };
  st.files["/x/site.json"] = { ...good, siteId: "other-site" };
  st.files["/x/garbage.json"] = { kind: "something-else" };
  for (const f of ["id", "code", "slug", "site", "garbage"]) {
    assert.equal((await run(["--restore", `/x/${f}.json`, "--apply", "--site", "TAL-93900"], io)).exitCode, 2, f);
  }
  assert.equal(calls.drafts.length, drafts);
});

// ---------------------------------------------------------------- the entry file

test("the entry file parses, writes only through the draft writer and the publish path", () => {
  const src = readFileSync(join(HERE, "patch-ticker-source.mts"), "utf8");
  const out = transformSync(src, { loader: "ts", format: "esm", target: "esnext" });
  assert.ok(out.code.length > 0);
  assert.doesNotMatch(src, /\.(update|insert|delete|upsert)\(/, "no direct table write: the app's draft writer and publish path only");
  assert.match(src, /writeSiteDraft/);
  assert.match(src, /publishDemoSite/);
  assert.match(src, /process\.exit\(result\.exitCode\)/);
});
