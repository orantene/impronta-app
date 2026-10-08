import test from "node:test";
import assert from "node:assert/strict";

import { buildMaisonV2Payload } from "../src/lib/talent-site/theme-catalog/collection/maison-v2";
import type { DraftInfo, PayloadLike, ReleaseRow, TNode } from "./release-theme-i18n-plan";
import {
  BOOK_LABEL,
  diffLeaves,
  patchTrees,
  planCta,
  run,
  stripDesignKey,
  type CtaPorts,
  type SeedTrees,
} from "./release-theme-cta-plan";
import type { Args } from "./release-theme-i18n-plan";

type Rec = Record<string, unknown>;
const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
const props = (n: TNode): Rec => (n.props ?? {}) as Rec;

function seedTrees(): SeedTrees {
  const p = buildMaisonV2Payload() as unknown as PayloadLike;
  return { shellTree: clone(p.shellTree ?? []), homeTree: clone(p.homeTree ?? []) };
}

function find(nodes: TNode[], pred: (n: TNode) => boolean): TNode | null {
  for (const n of nodes) {
    if (pred(n)) return n;
    const hit = find(n.children ?? [], pred);
    if (hit) return hit;
  }
  return null;
}

/** The released DB shape before #88: See services (primary) + See work (secondary), header "Menu and prices". */
function oldPayload(): PayloadLike {
  const p = clone(buildMaisonV2Payload() as unknown as PayloadLike);
  const row = find(p.homeTree ?? [], (n) => props(n).layerLabel === "Hero actions")!;
  const [a, b] = row.children!;
  a!.props = { ...props(a!), label: "See services", layerLabel: "See services", i18n: { es: { label: "Ver servicios" }, en: { label: "See services" } } };
  b!.props = { ...props(b!), label: "See work", href: "#gallery", layerLabel: "See work", i18n: { es: { label: "Ver trabajos" }, en: { label: "See work" } } };
  const header = (p.shellTree ?? []).find((n) => props(n).sectionTypeKey === "site_header")!;
  const sp = props(header).sectionProps as Rec;
  (sp.primaryCta as Rec).label = "Menu and prices";
  const right = (sp.regions as { right: Rec[] }).right;
  right.find((i) => i.type === "cta")!.label = "Menu and prices";
  return p;
}

const draftOf = (payload: PayloadLike, rev = 3): DraftInfo => ({
  id: "d1",
  rev,
  baseVersion: 24,
  updatedAt: "2026-10-07T00:00:00Z",
  updatedBy: "u1",
  payload,
});

test("patch: hero primary becomes the mode-aware booking button, old primary the ghost", () => {
  const r = patchTrees(oldPayload(), seedTrees());
  assert.deepEqual(r.refusals, []);
  const row = find(r.trees.homeTree, (n) => props(n).layerLabel === "Hero actions")!;
  const [a, b] = row.children!.map(props);
  assert.deepEqual([a!.label, a!.href, a!.tone, a!.i18n], [BOOK_LABEL, "#services", "primary", undefined]);
  assert.deepEqual([b!.label, b!.href, b!.tone], ["See services", "#services", "secondary"]);
  assert.deepEqual((b!.i18n as { es: Rec }).es, { label: "Ver servicios" });
});

test("patch: header cta + primaryCta say Book an appointment, other items untouched", () => {
  const r = patchTrees(oldPayload(), seedTrees());
  const header = r.trees.shellTree.find((n) => props(n).sectionTypeKey === "site_header")!;
  const sp = props(header).sectionProps as { primaryCta: Rec; regions: { right: Rec[] } };
  assert.equal(sp.primaryCta.label, BOOK_LABEL);
  assert.equal(sp.primaryCta.href, "#services");
  assert.deepEqual(sp.regions.right.map((i) => i.type), ["language", "cta"]);
  assert.equal(sp.regions.right[1]!.label, BOOK_LABEL);
  assert.equal(r.edits.length, 3);
});

test("patch: only the CTA nodes change (diff leaves live under the edit prefixes)", () => {
  const base = oldPayload();
  const r = patchTrees(base, seedTrees());
  assert.deepEqual(r.refusals, []);
  const leaves = [
    ...diffLeaves(base.homeTree, r.trees.homeTree, "homeTree"),
    ...diffLeaves(base.shellTree, r.trees.shellTree, "shellTree"),
  ];
  assert.ok(leaves.length > 0);
  for (const l of leaves) assert.ok(/Hero|children\[[01]\]|sectionProps/.test(l) || l.includes("["), l);
  // Input is not mutated.
  assert.equal(props(find(base.homeTree!, (n) => props(n).layerLabel === "Hero actions")!.children![0]!).label, "See services");
});

test("patch: idempotent on an already patched tree", () => {
  const once = patchTrees(oldPayload(), seedTrees());
  const again = patchTrees({ homeTree: once.trees.homeTree, shellTree: once.trees.shellTree }, seedTrees());
  assert.equal(again.alreadyDone, true);
  assert.deepEqual(again.edits, []);
});

test("patch: refuses an edited header label and an unexpected hero shape", () => {
  const edited = oldPayload();
  const header = edited.shellTree!.find((n) => props(n).sectionTypeKey === "site_header")!;
  const right = ((props(header).sectionProps as Rec).regions as { right: Rec[] }).right;
  right.find((i) => i.type === "cta")!.label = "Reserva ya";
  assert.match(patchTrees(edited, seedTrees()).refusals.join("|"), /edited label/);

  const odd = oldPayload();
  const row = find(odd.homeTree!, (n) => props(n).layerLabel === "Hero actions")!;
  row.children!.push({ id: "x", kind: "button", props: { label: "Extra" } });
  assert.match(patchTrees(odd, seedTrees()).refusals.join("|"), /exactly 2 buttons/);
});

test("patch: adds the seed cta item when the live header has none", () => {
  const p = oldPayload();
  const header = p.shellTree!.find((n) => props(n).sectionTypeKey === "site_header")!;
  const regions = (props(header).sectionProps as Rec).regions as { right: Rec[] };
  regions.right = regions.right.filter((i) => i.type !== "cta");
  const r = patchTrees(p, seedTrees());
  assert.deepEqual(r.refusals, []);
  const out = r.trees.shellTree.find((n) => props(n).sectionTypeKey === "site_header")!;
  const right = ((props(out).sectionProps as Rec).regions as { right: Rec[] }).right;
  assert.deepEqual(right.find((i) => i.type === "cta"), { type: "cta", label: BOOK_LABEL, href: "#services", responsive: { mobile: "hide" } });
});

test("plan: draft must equal released apart from props.designKey", () => {
  const released = { version: 24, payload: oldPayload() };
  const withKey = clone(released.payload);
  (props(withKey.homeTree![0]!) as Rec).designKey = "maison-v2-draft";
  assert.equal(planCta("maison-v2", released, draftOf(withKey), seedTrees()).refusals.length, 0);
  assert.deepEqual(stripDesignKey(withKey), stripDesignKey(released.payload));

  const changed = clone(released.payload);
  changed.tokenDefaults = { a: "1" };
  const p = planCta("maison-v2", released, draftOf(changed), seedTrees());
  assert.match(p.refusals.join("|"), /differs from released v24/);
});

test("plan: only maison-v2 is allowed", () => {
  const p = planCta("folio", { version: 1, payload: oldPayload() }, null, seedTrees());
  assert.match(p.refusals.join("|"), /not on the allow-list/);
});

// ── orchestration with fakes ─────────────────────────────────────────────────
const baseArgs = (over: Partial<Args> = {}): Args => ({
  designs: ["maison-v2"],
  apply: false,
  yes: false,
  releaseToTalents: false,
  includeOpenDraft: [],
  actor: null,
  rollout: null,
  ...over,
});

function fakePorts(opts: { draft?: DraftInfo | null; staleOnLoad?: boolean; release?: ReleaseRow | null; released?: PayloadLike } = {}) {
  const calls: string[] = [];
  const logs: string[] = [];
  const released = { version: 24, payload: opts.released ?? oldPayload() };
  let draft: DraftInfo | null = opts.draft === undefined ? null : opts.draft;
  let loads = 0;
  const ports: CtaPorts = {
    seed: seedTrees,
    log: (l) => logs.push(l),
    findActor: async () => ({ id: "actor-1", label: "fake" }),
    loadReleased: async () => released,
    loadDraft: async () => {
      loads += 1;
      if (opts.staleOnLoad && draft && loads > 1) return { ...draft, rev: draft.rev + 1 };
      return draft;
    },
    openDraft: async () => {
      calls.push("openDraft");
      draft = draftOf(clone(released.payload), 1);
      return { ok: true, value: draft };
    },
    saveTree: async (input) => {
      calls.push(`save:${input.tree}@${input.expectedRev}`);
      const cur = draft!;
      const key = input.tree === "home" ? "homeTree" : "shellTree";
      draft = { ...cur, rev: cur.rev + 1, payload: { ...cur.payload, [key]: input.nodes } };
      return { ok: true, value: draft };
    },
    preview: async () => {
      calls.push("preview");
      return { ok: true, value: { nextVersion: 25, itemCount: 3, notes: { en: "n", es: "n" }, items: [] } };
    },
    publishDemos: async () => {
      calls.push("publishDemos");
      return { ok: true, value: { version: 25, releaseId: "r1", demosApplied: 2, warnings: [] } };
    },
    findRelease: async () => opts.release ?? null,
    setRollout: async () => {
      calls.push("setRollout");
      return { ok: true, value: null };
    },
    openToTalents: async () => {
      calls.push("openToTalents");
      return { ok: true, value: { updates: 4, bells: 4, demosApplied: 0, warnings: [] } };
    },
  };
  return { ports, calls, logs };
}

test("run: dry run is default, prints the diff and writes nothing", async () => {
  const f = fakePorts();
  assert.equal(await run(baseArgs(), f.ports), 0);
  assert.deepEqual(f.calls, []);
  assert.match(f.logs.join("\n"), /hero primary/);
  assert.match(f.logs.join("\n"), /DRY RUN/);
});

test("run: guards refuse other slugs, --apply without --yes, talents without apply, include-open-draft", async () => {
  assert.equal(await run(baseArgs({ designs: ["folio"] }), fakePorts().ports), 2);
  assert.equal(await run(baseArgs({ designs: [] }), fakePorts().ports), 2);
  assert.equal(await run(baseArgs({ apply: true }), fakePorts().ports), 2);
  assert.equal(await run(baseArgs({ releaseToTalents: true }), fakePorts().ports), 2);
  assert.equal(await run(baseArgs({ includeOpenDraft: ["maison-v2"] }), fakePorts().ports), 2);
});

test("run --apply --yes: opens a draft, saves both trees on the CAS rev, previews, publishes to demos only", async () => {
  const f = fakePorts();
  assert.equal(await run(baseArgs({ apply: true, yes: true }), f.ports), 0);
  assert.deepEqual(f.calls, ["openDraft", "save:shell@1", "save:home@2", "preview", "publishDemos"]);
  assert.ok(!f.calls.includes("openToTalents"));
  assert.match(f.logs.join("\n"), /Talents are NOT touched/);
});

test("run --apply: refuses when the draft differs from released, writes nothing", async () => {
  const changed = oldPayload();
  changed.tokenDefaults = { a: "1" };
  const f = fakePorts({ draft: draftOf(changed) });
  assert.equal(await run(baseArgs({ apply: true, yes: true }), f.ports), 2);
  assert.deepEqual(f.calls, []);
});

test("run --apply: refuses when the draft rev moves before the write", async () => {
  const f = fakePorts({ draft: draftOf(oldPayload()), staleOnLoad: true });
  assert.equal(await run(baseArgs({ apply: true, yes: true }), f.ports), 2);
  assert.deepEqual(f.calls, []);
});

test("run --apply: an already patched released version creates no draft and no release", async () => {
  const done = patchTrees(oldPayload(), seedTrees());
  const f = fakePorts({ released: { ...oldPayload(), ...done.trees } });
  assert.equal(await run(baseArgs({ apply: true, yes: true }), f.ports), 0);
  assert.deepEqual(f.calls, []);
  assert.match(f.logs.join("\n"), /Nothing to patch/);
});

test("run --release-to-talents: needs a published demos release, clean dry run, rollout; then opens", async () => {
  const rel = (over: Partial<ReleaseRow> = {}): ReleaseRow => ({
    id: "r1",
    channel: "demos",
    status: "published",
    rollout_pct: 0,
    to_version: 25,
    dry_run_report: { summary: { errors: 0, demos: { errors: 0 } } },
    ...over,
  });
  const go = (release: ReleaseRow | null, over: Partial<Args> = {}) => {
    const f = fakePorts({ release });
    return run(baseArgs({ apply: true, yes: true, releaseToTalents: true, ...over }), f.ports).then((code) => ({ code, f }));
  };
  assert.equal((await go(null)).code, 2);
  assert.equal((await go(rel({ channel: "optin" }))).code, 2);
  assert.equal((await go(rel({ dry_run_report: { summary: { errors: 2 } } }))).code, 2);
  assert.equal((await go(rel())).code, 2, "rollout 0 needs --rollout");
  const ok = await go(rel(), { rollout: 100 });
  assert.equal(ok.code, 0);
  assert.deepEqual(ok.f.calls, ["setRollout", "openToTalents"]);
});
