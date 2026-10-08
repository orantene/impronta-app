import test from "node:test";
import assert from "node:assert/strict";

import { buildMaisonV2Payload } from "../src/lib/talent-site/theme-catalog/collection/maison-v2";
import type { DraftInfo, PayloadLike, TNode } from "./release-theme-i18n-plan";
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
  a!.props = {
    ...props(a!),
    label: "See services",
    layerLabel: "See services",
    i18n: { es: { label: "Ver servicios" }, en: { label: "See services" } },
  };
  b!.props = {
    ...props(b!),
    label: "See work",
    href: "#gallery",
    layerLabel: "See work",
    i18n: { es: { label: "Ver trabajos" }, en: { label: "See work" } },
  };
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
  assert.equal(
    props(find(base.homeTree!, (n) => props(n).layerLabel === "Hero actions")!.children![0]!).label,
    "See services",
  );
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
  assert.deepEqual(right.find((i) => i.type === "cta"), {
    type: "cta",
    label: BOOK_LABEL,
    href: "#services",
    responsive: { mobile: "hide" },
  });
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

/** An i18n overlay as release-theme-i18n-overlay.mts saves it: added to props.i18n and the node mirror. */
function withOverlay(payload: PayloadLike): PayloadLike {
  const p = clone(payload);
  const sub = find(p.homeTree ?? [], (n) => n.kind === "heading" || n.kind === "text");
  assert.ok(sub, "fixture has a text-ish node to overlay");
  const bag = { es: { text: "Hola" }, en: { text: "Hello" } };
  sub!.props = { ...props(sub!), i18n: bag };
  sub!.i18n = bag;
  return p;
}
const strip = (v: unknown) => JSON.parse(JSON.stringify(v, (k, x) => (k === "i18n" ? undefined : x)));

test("plan: a draft carrying an additive i18n overlay is accepted and the overlay survives the patch", () => {
  const released = { version: 24, payload: oldPayload() };
  const draft = withOverlay(released.payload);
  const p = planCta("maison-v2", released, draftOf(draft), seedTrees());
  assert.deepEqual(p.refusals, []);
  assert.equal(p.draftDiffersByAdditiveI18nOnly, true);
  assert.equal(p.patch.edits.length, 3);
  // Patch is computed on the draft: the overlaid node is byte-identical, the rest matches the plain patch.
  const overlaid = find(draft.homeTree!, (n) => n.kind === "heading" || n.kind === "text")!;
  const after = find(p.patch.trees.homeTree, (n) => n.id === overlaid.id)!;
  assert.equal(JSON.stringify(after), JSON.stringify(overlaid));
  const plain = patchTrees(released.payload, seedTrees());
  assert.deepEqual(strip(p.patch.trees), strip(plain.trees));
});

test("plan: a draft with a non-i18n change (or a changed i18n value) is refused", () => {
  const released = { version: 24, payload: oldPayload() };
  const bad = withOverlay(released.payload);
  bad.tokenDefaults = { a: "1" };
  assert.match(planCta("maison-v2", released, draftOf(bad), seedTrees()).refusals.join("|"), /differs from released v24/);

  const rewritten = clone(released.payload);
  const btn = find(rewritten.homeTree!, (n) => n.kind === "button")!;
  (props(btn).i18n as Rec) = { es: { label: "Cambiado" }, en: { label: "Changed" } };
  assert.match(planCta("maison-v2", released, draftOf(rewritten), seedTrees()).refusals.join("|"), /differs from released/);
});

test("plan: overlay-free draft reports i18n-only: no and behaves as before", () => {
  const released = { version: 24, payload: oldPayload() };
  const p = planCta("maison-v2", released, draftOf(clone(released.payload)), seedTrees());
  assert.deepEqual(p.refusals, []);
  assert.equal(p.draftDiffersByAdditiveI18nOnly, false);
  assert.equal(p.patch.edits.length, 3);
});

test("plan: idempotent on an i18n draft that already carries the CTA", () => {
  const released = { version: 24, payload: oldPayload() };
  const once = planCta("maison-v2", released, draftOf(withOverlay(released.payload)), seedTrees());
  const layered = { ...withOverlay(released.payload), ...once.patch.trees };
  const again = planCta("maison-v2", released, draftOf(layered, 5), seedTrees());
  assert.deepEqual(again.refusals, []);
  assert.equal(again.patch.alreadyDone, true);
});

test("run --apply: layers on an i18n draft, saves trees keeping the overlay, publishes once", async () => {
  const draft = draftOf(withOverlay(oldPayload()));
  const f = fakePorts({ draft });
  assert.equal(await run(baseArgs({ apply: true, yes: true }), f.ports), 0);
  assert.deepEqual(f.calls, ["save:shell@3", "save:home@4", "preview", "publishDemos"]);
  assert.ok(!f.calls.includes("openDraft"));
});

test("run: dry run prints the additive-i18n line; rerun on an already patched i18n draft writes nothing", async () => {
  const f = fakePorts({ draft: draftOf(withOverlay(oldPayload())) });
  assert.equal(await run(baseArgs(), f.ports), 0);
  assert.match(f.logs.join("\n"), /additive i18n only: yes/);
  assert.deepEqual(f.calls, []);

  const done = patchTrees(withOverlay(oldPayload()), seedTrees());
  const g = fakePorts({ draft: draftOf({ ...withOverlay(oldPayload()), ...done.trees }, 5) });
  assert.equal(await run(baseArgs({ apply: true, yes: true }), g.ports), 0);
  assert.deepEqual(g.calls, []);
  assert.match(g.logs.join("\n"), /Nothing to patch/);
});

test("plan: only maison-v2 is allowed", () => {
  const p = planCta("folio", { version: 1, payload: oldPayload() }, null, seedTrees());
  assert.match(p.refusals.join("|"), /not on the allow-list/);
});

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

function fakePorts(opts: { draft?: DraftInfo | null; released?: PayloadLike } = {}) {
  const calls: string[] = [];
  const logs: string[] = [];
  const released = { version: 24, payload: opts.released ?? oldPayload() };
  let draft: DraftInfo | null = opts.draft === undefined ? null : opts.draft;
  const ports: CtaPorts = {
    seed: seedTrees,
    log: (l) => logs.push(l),
    findActor: async () => ({ id: "actor-1", label: "fake" }),
    loadReleased: async () => released,
    loadDraft: async () => draft,
    openDraft: async () => {
      calls.push("openDraft");
      return { ok: false, error: "retired" };
    },
    saveTree: async () => {
      calls.push("save");
      return { ok: false, error: "retired" };
    },
    preview: async () => {
      calls.push("preview");
      return { ok: false, error: "retired" };
    },
    publishDemos: async () => {
      calls.push("publishDemos");
      return { ok: false, error: "retired" };
    },
    findRelease: async () => null,
    setRollout: async () => ({ ok: false, error: "retired" }),
    openToTalents: async () => {
      calls.push("openToTalents");
      return { ok: false, error: "retired" };
    },
  };
  return { ports, calls, logs };
}

test("run: retired — always refuses and never writes (TUL-366)", async () => {
  const f = fakePorts();
  assert.equal(await run(baseArgs(), f.ports), 2);
  assert.equal(await run(baseArgs({ apply: true, yes: true }), f.ports), 2);
  assert.equal(await run(baseArgs({ apply: true, yes: true, releaseToTalents: true, rollout: 100 }), f.ports), 2);
  assert.deepEqual(f.calls, []);
  assert.match(f.logs.join("\n"), /retired/i);
  assert.match(f.logs.join("\n"), /Builder Lab/);
});

test("run: still prints a diagnostic plan before refusing", async () => {
  const f = fakePorts();
  assert.equal(await run(baseArgs(), f.ports), 2);
  assert.match(f.logs.join("\n"), /hero primary|already patched|edits:/);
});
