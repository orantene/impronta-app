import test from "node:test";
import assert from "node:assert/strict";

import {
  buildLookup,
  isI18nOnlyAdditive,
  overlayTree,
  parseArgs,
  planDesign,
  stripDesignKey,
  run,
  type Args,
  type DraftInfo,
  type PayloadLike,
  type Ports,
  type ReleaseRow,
  type TNode,
} from "./release-theme-i18n-plan";

const h = (id: string, text: string, i18n?: unknown): TNode => ({
  id,
  kind: "heading",
  props: { text, ...(i18n ? { i18n } : {}) },
});
const seedPayload: PayloadLike = {
  homeTree: [
    h("s1", "Sessions", { es: { text: "Sesiones" }, en: { text: "Sessions" } }),
    h("s2", "Book", { es: { text: "Reservar" }, en: { text: "Book" } }),
    {
      id: "s3",
      kind: "marquee",
      props: {
        items: [{ text: "Lashes" }, { text: "{{x}}" }],
        i18n: { es: { "items.0.text": "Pestañas" }, en: { "items.0.text": "Lashes" } },
      },
    },
  ],
  shellTree: [],
};
const lookup = buildLookup([{ slug: "folio", payload: seedPayload }]);

const dbHome = (): TNode[] => [
  h("a1", "  Sessions "),
  h("a2", "Sessions now"),
  h("a3", "Book"),
  h("a4", "Sessions", { es: { text: "Mis sesiones" } }),
  { id: "a5", kind: "marquee", props: { items: [{ text: "Lashes" }, { text: "Brows" }] } },
];
const dbPayload = (): PayloadLike => ({ homeTree: dbHome(), shellTree: [], tokenDefaults: { a: "1" } });

test("lookup: exact text, skips mode-dependent labels and marquee pair is keyed", () => {
  assert.ok(lookup.pairs.has("Sessions"));
  assert.ok(!lookup.pairs.has("Book"));
  assert.deepEqual(lookup.pairs.get("Lashes"), { es: "Pestañas", en: "Lashes" });
});

test("overlay: exact match only (trimmed), never overwrites, adds missing en", () => {
  const r = overlayTree(dbHome(), lookup, "homeTree");
  const byId = Object.fromEntries(r.tree.map((n) => [n.id, n]));
  assert.deepEqual(byId.a1.props.i18n, { es: { text: "Sesiones" }, en: { text: "Sessions" } });
  assert.deepEqual(byId.a1.i18n, byId.a1.props.i18n, "node mirror written too");
  assert.equal(byId.a2.props.i18n, undefined, "no fuzzy match");
  assert.equal(byId.a3.props.i18n, undefined, "mode-dependent label skipped");
  assert.deepEqual(byId.a4.props.i18n, { es: { text: "Mis sesiones" }, en: { text: "Sessions" } });
  assert.ok(r.unmatched.some((u) => u.base === "Sessions now"));
  assert.ok(!r.unmatched.some((u) => u.base === "Book"));
});

test("overlay: marquee items.N.text; unmatched item reported", () => {
  const r = overlayTree(dbHome(), lookup, "homeTree");
  const m = r.tree.find((n) => n.id === "a5")!;
  assert.deepEqual(m.props!.i18n, { es: { "items.0.text": "Pestañas" }, en: { "items.0.text": "Lashes" } });
  assert.ok(r.unmatched.some((u) => u.key === "items.1.text" && u.base === "Brows"));
});

test("additive guard: refuses non-i18n diffs and dropped translations", () => {
  const before = dbHome();
  const ok = overlayTree(before, lookup, "homeTree").tree;
  assert.equal(isI18nOnlyAdditive(before, ok), true);
  const tampered = structuredClone(ok);
  tampered[1]!.props!.text = "Changed";
  assert.equal(isI18nOnlyAdditive(before, tampered), false);
  const dropped = structuredClone(ok);
  delete (dropped[3]!.props!.i18n as Record<string, unknown>).es;
  assert.equal(isI18nOnlyAdditive(before, dropped), false);
});

const draftOf = (payload: PayloadLike, rev = 5): DraftInfo => ({
  id: "d1",
  rev,
  baseVersion: 23,
  updatedAt: "2026-10-07T00:00:00Z",
  updatedBy: "u1",
  payload,
});
const released = { version: 23, payload: dbPayload() };
const changedDraft = (): PayloadLike => ({ ...dbPayload(), tokenDefaults: { a: "2" } });

test("open draft: allowed for maison-v2, refused for others unless flagged", () => {
  const d = draftOf(changedDraft());
  assert.deepEqual(planDesign("maison-v2", released, d, lookup, { includeOpenDraft: [] }).refusals, []);
  const refused = planDesign("folio", released, d, lookup, { includeOpenDraft: [] });
  assert.equal(refused.refusals.length, 1);
  assert.match(refused.refusals[0], /rev 5/);
  assert.deepEqual(planDesign("folio", released, d, lookup, { includeOpenDraft: ["folio"] }).refusals, []);
  // an open draft identical to released has no changes: no flag needed
  assert.deepEqual(planDesign("folio", released, draftOf(dbPayload()), lookup, { includeOpenDraft: [] }).refusals, []);
});

test("unknown slug is refused by the plan", () => {
  assert.ok(planDesign("evil", released, null, lookup, { includeOpenDraft: [] }).refusals[0].includes("allow-list"));
});

// ── run() with fakes ─────────────────────────────────────────────────────────
interface Fake {
  ports: Ports;
  calls: string[];
  out: string[];
  state: { draft: DraftInfo | null; rev: number; release: ReleaseRow | null };
}
function fake(opts: { draft?: DraftInfo | null; casBump?: boolean; release?: ReleaseRow | null; optinFail?: boolean } = {}): Fake {
  const calls: string[] = [];
  const out: string[] = [];
  const state = { draft: opts.draft ?? null, rev: opts.draft?.rev ?? 0, release: opts.release ?? null };
  let reads = 0;
  const ports: Ports = {
    findActor: async () => ({ id: "11111111-1111-1111-1111-111111111111", label: "fake admin" }),
    loadReleased: async () => released,
    loadDraft: async () => {
      reads++;
      if (opts.casBump && reads >= 2 && state.draft) return { ...state.draft, rev: state.draft.rev + 1 };
      return state.draft;
    },
    openDraft: async () => {
      calls.push("open");
      state.draft = draftOf(dbPayload(), 1);
      return { ok: true, value: state.draft };
    },
    saveTree: async (i) => {
      calls.push(`save:${i.tree}:${i.expectedRev}`);
      const d = state.draft!;
      const next = { ...d, rev: d.rev + 1, payload: { ...d.payload, [i.tree === "home" ? "homeTree" : "shellTree"]: i.nodes } };
      state.draft = next;
      return { ok: true, value: next };
    },
    preview: async () => {
      calls.push("preview");
      return { ok: true, value: { nextVersion: 24, itemCount: 1, notes: { en: "n", es: "n" }, items: [] } };
    },
    publishDemos: async (i) => {
      calls.push(`publishDemos:${i.expectedRev}`);
      return { ok: true, value: { version: 24, releaseId: "rel-1", demosApplied: 2, warnings: [] } };
    },
    findRelease: async () => state.release,
    setRollout: async (_r, pct) => {
      calls.push(`rollout:${pct}`);
      return { ok: true, value: null };
    },
    openToTalents: async () => {
      calls.push("optin");
      return opts.optinFail ? { ok: false, error: "authored gate" } : { ok: true, value: { updates: 3, bells: 3, demosApplied: 0, warnings: [] } };
    },
    lookup: () => lookup,
    log: (l) => out.push(l),
  };
  return { ports, calls, out, state };
}
const base: Args = { designs: ["folio"], apply: false, yes: false, releaseToTalents: false, includeOpenDraft: [], actor: null, rollout: null };
const WRITES = ["open", "save", "publishDemos", "optin", "rollout"];
const wrote = (calls: string[]) => calls.some((c) => WRITES.some((w) => c.startsWith(w)));

test("dry run writes nothing and prints the diff", async () => {
  const f = fake();
  assert.equal(await run(base, f.ports), 0);
  assert.equal(wrote(f.calls), false);
  assert.ok(f.out.join("\n").includes("DRY RUN"));
  assert.ok(f.out.join("\n").includes("unmatched"));
});

test("dry run with a refused design exits 2", async () => {
  const f = fake({ draft: draftOf(changedDraft()) });
  assert.equal(await run(base, f.ports), 2);
  assert.equal(wrote(f.calls), false);
});

test("--apply without --yes is refused; unknown slug refused; multi-design apply refused", async () => {
  let f = fake();
  assert.equal(await run({ ...base, apply: true }, f.ports), 2);
  f = fake();
  assert.equal(await run({ ...base, designs: ["nope"], apply: true, yes: true }, f.ports), 2);
  f = fake();
  assert.equal(await run({ ...base, designs: ["folio", "mono"], apply: true, yes: true }, f.ports), 2);
  assert.equal(wrote(f.calls), false);
});

test("apply: open, save shell+home, preview, publish to demos only", async () => {
  const f = fake();
  assert.equal(await run({ ...base, apply: true, yes: true }, f.ports), 0);
  assert.deepEqual(f.calls, ["open", "save:shell:1", "save:home:2", "preview", "publishDemos:3"]);
  assert.ok(!f.calls.includes("optin"));
  const text = f.out.join("\n");
  assert.ok(text.includes("v24") && text.includes("rel-1") && text.includes("pull-authored.mts --design folio"));
});

test("apply on maison-v2 layers on the open draft (no open call)", async () => {
  const f = fake({ draft: draftOf(changedDraft()) });
  assert.equal(await run({ ...base, designs: ["maison-v2"], apply: true, yes: true }, f.ports), 0);
  assert.ok(!f.calls.includes("open"));
  assert.ok(f.calls[0].startsWith("save:shell:5"));
});

test("apply on another design with a changed open draft is refused without the flag", async () => {
  const f = fake({ draft: draftOf(changedDraft()) });
  assert.equal(await run({ ...base, apply: true, yes: true }, f.ports), 2);
  assert.equal(wrote(f.calls), false);
});

test("CAS mismatch between read and write aborts with exit 2", async () => {
  const f = fake({ draft: draftOf(dbPayload()), casBump: true });
  assert.equal(await run({ ...base, designs: ["maison-v2"], apply: true, yes: true }, f.ports), 2);
  assert.equal(f.calls.some((c) => c.startsWith("save") || c.startsWith("publish")), false);
});

test("a save that changes more than i18n aborts before publish", async () => {
  const f = fake({ draft: draftOf(dbPayload()) });
  const orig = f.ports.saveTree;
  f.ports.saveTree = async (i) => {
    const r = await orig(i);
    if (r.ok) r.value.payload.homeTree![0]!.props!.text = "mutated";
    return r;
  };
  assert.equal(await run({ ...base, designs: ["maison-v2"], apply: true, yes: true }, f.ports), 2);
  assert.ok(!f.calls.includes("preview"));
});

const rel = (over: Partial<ReleaseRow> = {}): ReleaseRow => ({
  id: "rel-1",
  channel: "demos",
  status: "published",
  rollout_pct: 0,
  to_version: 24,
  dry_run_report: { summary: { errors: 0, demos: { errors: 0 } } },
  ...over,
});
const talents: Args = { ...base, apply: true, yes: true, releaseToTalents: true };

test("release-to-talents never runs from a plain apply, and needs --apply --yes", async () => {
  let f = fake({ release: rel({ rollout_pct: 50 }) });
  await run({ ...base, apply: true, yes: true }, f.ports);
  assert.ok(!f.calls.includes("optin"));
  f = fake({ release: rel() });
  assert.equal(await run({ ...base, releaseToTalents: true }, f.ports), 2);
  assert.equal(await run({ ...talents, yes: false }, f.ports), 2);
  assert.equal(f.calls.length, 0);
});

test("release-to-talents: refuses off-demos, failed sites, and rollout 0 without --rollout", async () => {
  for (const r of [
    rel({ channel: "draft" }),
    rel({ dry_run_report: { summary: { errors: 0, demos: { errors: 1 } } } }),
    rel({ dry_run_report: null }),
    rel(),
  ]) {
    const f = fake({ release: r });
    assert.equal(await run(talents, f.ports), 2);
    assert.ok(!f.calls.includes("optin"));
  }
});

test("release-to-talents: sets rollout then calls the manager opt-in; manager refusal exits 2", async () => {
  let f = fake({ release: rel() });
  assert.equal(await run({ ...talents, rollout: 100 }, f.ports), 0);
  assert.deepEqual(f.calls, ["rollout:100", "optin"]);
  f = fake({ release: rel({ rollout_pct: 20 }), optinFail: true });
  assert.equal(await run(talents, f.ports), 2);
});

test("parseArgs", () => {
  const p = parseArgs(["--apply", "--yes", "--design", "Folio", "--rollout", "100"]);
  assert.ok(p.ok && p.args.designs[0] === "folio" && p.args.rollout === 100);
  assert.equal(parseArgs(["--rollout", "0"]).ok, false);
  assert.equal(parseArgs(["--actor", "x"]).ok, false);
});

// The .mts entry is not imported by any test, and a stray ")" once made it fail to even
// parse (the PM's first dry-run). Parse it with esbuild, the same transformer tsx uses.
test("the release script entry (.mts) parses", async () => {
  const { readFileSync } = await import("node:fs");
  const { transformSync } = await import("esbuild");
  const src = readFileSync(new URL("./release-theme-i18n-overlay.mts", import.meta.url), "utf8");
  assert.doesNotThrow(() => transformSync(src, { loader: "ts", format: "esm" }));
});

test("TUL-222: an open draft that differs only by props.designKey has no changes (no flag needed)", () => {
  const stamped = JSON.parse(JSON.stringify(dbPayload())) as Record<string, unknown>;
  const stamp = (n: unknown): void => {
    if (Array.isArray(n)) return n.forEach(stamp);
    if (n && typeof n === "object") {
      const o = n as Record<string, unknown>;
      if (o.props && typeof o.props === "object") (o.props as Record<string, unknown>).designKey = "folio";
      Object.values(o).forEach(stamp);
    }
  };
  stamp(stamped);
  assert.notDeepEqual(stamped, dbPayload());
  assert.deepEqual(stripDesignKey(stamped), dbPayload());
  assert.deepEqual(planDesign("folio", released, draftOf(stamped as PayloadLike), lookup, { includeOpenDraft: [] }).refusals, []);
  // a real change next to a designKey is still refused
  const real = { ...stamped, tokenDefaults: { a: "2" } } as PayloadLike;
  assert.equal(planDesign("folio", released, draftOf(real), lookup, { includeOpenDraft: [] }).refusals.length, 1);
});
