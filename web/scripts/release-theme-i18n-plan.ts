/**
 * Pure planning helpers (types, arg parsing, guards) for the theme release scripts. The i18n
 * overlay entrypoint is RETIRED: Builder Lab publishes copy-only drafts as a `copy` release
 * item. release-theme-patch-cta still imports this module.
 *
 * Releases the seeded Spanish + English copy as new theme versions through
 * Builder Lab's OWN release path. Nothing here touches a database: every
 * effect goes through the injected `Ports`, which a script entrypoint binds to the same
 * functions Builder Lab's Release button calls (drafts.server.ts,
 * publish.server.ts, release-manager.server.ts). Tests inject fakes.
 *
 * Exit codes: 0 ok, 1 error, 2 REFUSED (a guard fired, nothing unsafe done).
 */
import { isDeepStrictEqual } from "node:util";

import { localizablePropsForKind } from "../src/lib/i18n/builder-i18n-props";
import type { BuilderNodeKind } from "../src/lib/site-admin/builder-node/types";

export const ALLOWED_SLUGS = [
  "maison-v2",
  "maison",
  "folio",
  "solace",
  "mono",
  "frame",
  "gridline",
] as const;
export type AllowedSlug = (typeof ALLOWED_SLUGS)[number];

/** Same list as seed-i18n.ts MODE_DEPENDENT_LABELS (injected so tests need no builders). */
export const DEFAULT_MODE_LABELS: readonly string[] = [
  "Inquire for bookings",
  "Book a session",
  "Book",
  "Reserve a time",
  "Booking",
  "Book an appointment",
];

/** The one design whose unreleased open draft is pre-approved by the Project Manager. */
export const APPROVED_OPEN_DRAFT_SLUG = "maison-v2";

// ── Tree helpers ─────────────────────────────────────────────────────────────
/** A tree node from the authored DB JSON: the fields the script reads are typed, anything else stays `unknown`. */
export interface TNode {
  id?: string;
  kind?: string;
  props?: Record<string, unknown>;
  children?: TNode[];
  slides?: TNode[];
  i18n?: unknown;
  [key: string]: unknown;
}
export type Pair = { es: string; en: string };
export type PayloadLike = { homeTree?: TNode[]; shellTree?: TNode[]; optionalBlocks?: TNode[] } & Record<
  string,
  unknown
>;
export const TREES = ["shellTree", "homeTree"] as const;

export function isTokenOnlyText(text: string): boolean {
  return !/\p{L}/u.test(text.replace(/\{\{[^}]*\}\}/g, ""));
}

function eachNode(
  nodes: unknown,
  path: string,
  visit: (path: string, node: TNode) => void,
): void {
  if (!Array.isArray(nodes)) return;
  nodes.forEach((raw, i) => {
    if (!raw || typeof raw !== "object") return;
    const node = raw as TNode;
    const here = `${path}/${String(node.kind)}[${i}]`;
    visit(here, node);
    eachNode(node.children, here, visit);
    eachNode(node.slides, `${here}/slides`, visit);
  });
}

function propsOf(node: TNode): Record<string, unknown> {
  return node.props && typeof node.props === "object" ? node.props : {};
}

function nonEmpty(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

/** Text fields of one node that carry copy: [overlay key, base text]. */
export function textFields(node: TNode): Array<[string, string]> {
  const props = propsOf(node);
  const out: Array<[string, string]> = [];
  for (const prop of localizablePropsForKind((node.kind ?? "") as BuilderNodeKind)) {
    const v = props[prop];
    if (typeof v === "string") out.push([prop, v]);
  }
  if (node.kind === "marquee" && Array.isArray(props.items)) {
    props.items.forEach((it: unknown, n: number) => {
      const t = it && typeof it === "object" ? (it as { text?: unknown }).text : null;
      if (typeof t === "string") out.push([`items.${n}.text`, t]);
    });
  }
  return out;
}

// ── Lookup from the code seeds ───────────────────────────────────────────────
export interface Lookup {
  pairs: Map<string, Pair>;
  /** Base texts that had two different translations across designs; never applied. */
  ambiguous: string[];
}

export function buildLookup(
  payloads: ReadonlyArray<{ slug: string; payload: PayloadLike }>,
  modeLabels: readonly string[] = DEFAULT_MODE_LABELS,
): Lookup {
  const pairs = new Map<string, Pair>();
  const ambiguous = new Set<string>();
  for (const { payload } of payloads) {
    for (const tree of ["homeTree", "shellTree", "optionalBlocks"] as const) {
      eachNode(payload[tree], tree, (_p, node) => {
        const i18n = propsOf(node).i18n as Record<string, Record<string, unknown>> | undefined;
        if (!i18n) return;
        for (const [key, base] of textFields(node)) {
          const text = base.trim();
          if (!text || isTokenOnlyText(text) || modeLabels.includes(text)) continue;
          const es = i18n.es?.[key];
          const en = i18n.en?.[key];
          if (!nonEmpty(es) || !nonEmpty(en)) continue;
          const prev = pairs.get(text);
          if (prev && (prev.es !== es || prev.en !== en)) ambiguous.add(text);
          else pairs.set(text, { es, en });
        }
      });
    }
  }
  for (const a of ambiguous) pairs.delete(a);
  return { pairs, ambiguous: [...ambiguous].sort() };
}

// ── Overlay application ──────────────────────────────────────────────────────
export interface NodeChange {
  path: string;
  nodeId: string | null;
  key: string;
  base: string;
  addedEs: string | null;
  addedEn: string | null;
}
export interface Unmatched {
  path: string;
  nodeId: string | null;
  key: string;
  base: string;
}

type Bag = Record<string, Record<string, string>>;

function mergeAdd(existing: unknown, add: { es: Record<string, string>; en: Record<string, string> }): Bag {
  const out: Bag = {};
  if (existing && typeof existing === "object") {
    for (const [loc, bag] of Object.entries(existing as Record<string, unknown>)) {
      out[loc] = bag && typeof bag === "object" ? { ...(bag as Record<string, string>) } : {};
    }
  }
  for (const loc of ["es", "en"] as const) {
    for (const [k, v] of Object.entries(add[loc])) {
      const bag = (out[loc] ??= {});
      if (!nonEmpty(bag[k])) bag[k] = v; // never overwrite
    }
  }
  return out;
}

/** Pure: returns a NEW tree with es/en added where the base text matches exactly. */
export function overlayTree(
  tree: readonly TNode[],
  lookup: Lookup,
  treeName: string,
  modeLabels: readonly string[] = DEFAULT_MODE_LABELS,
): { tree: TNode[]; changes: NodeChange[]; unmatched: Unmatched[] } {
  const changes: NodeChange[] = [];
  const unmatched: Unmatched[] = [];
  const walk = (nodes: readonly TNode[], path: string): TNode[] =>
    nodes.map((raw, i) => {
      if (!raw || typeof raw !== "object") return raw;
      const here = `${path}/${String(raw.kind)}[${i}]`;
      const props = propsOf(raw);
      const have = (props.i18n && typeof props.i18n === "object" ? props.i18n : {}) as Record<
        string,
        Record<string, unknown> | undefined
      >;
      const add = { es: {} as Record<string, string>, en: {} as Record<string, string> };
      const nodeId = typeof raw.id === "string" ? raw.id : null;
      for (const [key, base] of textFields(raw)) {
        const text = base.trim();
        if (!text || isTokenOnlyText(text) || modeLabels.includes(text)) continue;
        const pair = lookup.pairs.get(text);
        const hasEs = nonEmpty(have.es?.[key]);
        const hasEn = nonEmpty(have.en?.[key]);
        if (!pair) {
          if (!hasEs) unmatched.push({ path: `${here}.${key}`, nodeId, key, base: text });
          continue;
        }
        const addEs = !hasEs ? pair.es : null;
        const addEn = !hasEn ? pair.en : null;
        if (addEs) add.es[key] = addEs;
        if (addEn) add.en[key] = addEn;
        if (addEs || addEn) changes.push({ path: `${here}.${key}`, nodeId, key, base: text, addedEs: addEs, addedEn: addEn });
      }
      const touched = Object.keys(add.es).length + Object.keys(add.en).length > 0;
      const next: TNode = { ...raw };
      if (touched) {
        next.props = { ...props, i18n: mergeAdd(props.i18n, add) };
        next.i18n = mergeAdd(raw.i18n, add); // mirror, the app-placement convention
      }
      if (Array.isArray(raw.children)) next.children = walk(raw.children, here);
      if (Array.isArray(raw.slides)) next.slides = walk(raw.slides, `${here}/slides`);
      return next;
    });
  return { tree: walk(tree, treeName), changes, unmatched };
}

/** The editor stamps `props.designKey` on every node of a saved draft; it is not a content change (TUL-222). */
export function stripDesignKey<T>(value: T): T {
  if (Array.isArray(value)) return value.map(stripDesignKey) as unknown as T;
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (k === "designKey") continue;
      out[k] = stripDesignKey(v);
    }
    return out as T;
  }
  return value;
}

// ── Safety: the diff must be added i18n keys and nothing else ────────────────
export function stripI18n<T>(value: T): T {
  if (Array.isArray(value)) return value.map(stripI18n) as unknown as T;
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (k === "i18n") continue;
      out[k] = stripI18n(v);
    }
    return out as T;
  }
  return value;
}

/** Every i18n value present before must still be present, unchanged, after. */
function i18nRetained(before: unknown, after: unknown): boolean {
  if (Array.isArray(before)) {
    if (!Array.isArray(after) || after.length !== before.length) return false;
    return before.every((b, i) => i18nRetained(b, after[i]));
  }
  if (before && typeof before === "object") {
    if (!after || typeof after !== "object") return false;
    const b = before as Record<string, unknown>;
    const a = after as Record<string, unknown>;
    if (b.i18n && typeof b.i18n === "object") {
      for (const [loc, bag] of Object.entries(b.i18n as Record<string, unknown>)) {
        for (const [k, v] of Object.entries((bag ?? {}) as Record<string, unknown>)) {
          const av = ((a.i18n as Record<string, Record<string, unknown>> | undefined)?.[loc] ?? {})[k];
          if (av !== v) return false;
        }
      }
    }
    return Object.keys(b).every((k) => (k === "i18n" ? true : i18nRetained(b[k], a[k])));
  }
  return true;
}

export function isI18nOnlyAdditive(before: unknown, after: unknown): boolean {
  return isDeepStrictEqual(stripI18n(before), stripI18n(after)) && i18nRetained(before, after);
}

// ── Plan per design ──────────────────────────────────────────────────────────
export interface DraftInfo {
  id: string;
  rev: number;
  baseVersion: number;
  updatedAt: string;
  updatedBy: string | null;
  payload: PayloadLike;
}
export interface Released {
  version: number;
  payload: PayloadLike;
}
export interface DesignPlan {
  slug: string;
  releasedVersion: number | null;
  draft: { rev: number; updatedAt: string; updatedBy: string | null; baseVersion: number; hasChanges: boolean } | null;
  willOpenDraft: boolean;
  changes: NodeChange[];
  unmatched: Unmatched[];
  /** optionalBlocks text that would match; saveThemeDraftTree cannot write them. */
  optionalBlocksNotApplied: number;
  trees: Record<(typeof TREES)[number], TNode[]>;
  refusals: string[];
}

export interface PlanOptions {
  includeOpenDraft: readonly string[];
  modeLabels?: readonly string[];
}

export function planDesign(
  slug: string,
  released: Released | null,
  draft: DraftInfo | null,
  lookup: Lookup,
  opts: PlanOptions,
): DesignPlan {
  const refusals: string[] = [];
  if (!(ALLOWED_SLUGS as readonly string[]).includes(slug)) {
    refusals.push(`"${slug}" is not on the allow-list (${ALLOWED_SLUGS.join(", ")}).`);
  }
  if (!released && !draft) refusals.push("No released version and no open draft found for this design.");
  const base: PayloadLike = (draft?.payload ?? released?.payload ?? {}) as PayloadLike;
  const hasChanges = draft && released ? !isDeepStrictEqual(stripDesignKey(draft.payload), stripDesignKey(released.payload)) : !!draft && !released;
  if (draft) {
    const approved = slug === APPROVED_OPEN_DRAFT_SLUG || opts.includeOpenDraft.includes(slug);
    if (hasChanges && !approved) {
      refusals.push(
        `Open draft with changes (rev ${draft.rev}, updated ${draft.updatedAt} by ${draft.updatedBy ?? "unknown"}, ` +
          `base v${draft.baseVersion}). Layering on it needs --include-open-draft ${slug}.`,
      );
    }
  }
  const changes: NodeChange[] = [];
  const unmatched: Unmatched[] = [];
  const trees = { shellTree: [] as TNode[], homeTree: [] as TNode[] };
  for (const t of TREES) {
    const r = overlayTree(base[t] ?? [], lookup, t, opts.modeLabels);
    trees[t] = r.tree;
    changes.push(...r.changes);
    unmatched.push(...r.unmatched);
    if (!isI18nOnlyAdditive(base[t] ?? [], r.tree)) {
      refusals.push(`Computed change in ${t} is not limited to added i18n keys.`);
    }
  }
  const optional = overlayTree(base.optionalBlocks ?? [], lookup, "optionalBlocks", opts.modeLabels);
  return {
    slug,
    releasedVersion: released?.version ?? null,
    draft: draft
      ? { rev: draft.rev, updatedAt: draft.updatedAt, updatedBy: draft.updatedBy, baseVersion: draft.baseVersion, hasChanges: !!hasChanges }
      : null,
    willOpenDraft: !draft,
    changes,
    unmatched,
    optionalBlocksNotApplied: optional.changes.length,
    trees,
    refusals,
  };
}

// ── Arguments ────────────────────────────────────────────────────────────────
export interface Args {
  designs: string[];
  apply: boolean;
  yes: boolean;
  releaseToTalents: boolean;
  includeOpenDraft: string[];
  actor: string | null;
  rollout: number | null;
}

export function parseArgs(argv: readonly string[]): { ok: true; args: Args } | { ok: false; error: string } {
  const get = (name: string): string[] => {
    const out: string[] = [];
    argv.forEach((a, i) => {
      if (a === name && argv[i + 1]) out.push(argv[i + 1]);
    });
    return out;
  };
  const designs = get("--design").map((s) => s.trim().toLowerCase());
  const rolloutRaw = get("--rollout")[0];
  const rollout = rolloutRaw === undefined ? null : Number(rolloutRaw);
  if (rollout !== null && (!Number.isInteger(rollout) || rollout < 1 || rollout > 100)) {
    return { ok: false, error: "--rollout must be an integer 1-100." };
  }
  const actor = get("--actor")[0] ?? null;
  if (actor && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(actor)) {
    return { ok: false, error: "--actor must be a uuid." };
  }
  return {
    ok: true,
    args: {
      designs,
      apply: argv.includes("--apply"),
      yes: argv.includes("--yes"),
      releaseToTalents: argv.includes("--release-to-talents"),
      includeOpenDraft: get("--include-open-draft").map((s) => s.trim().toLowerCase()),
      actor,
      rollout,
    },
  };
}

// ── Orchestration with injected ports ────────────────────────────────────────
type Res<T> = { ok: true; value: T } | { ok: false; code?: string; error: string };

export interface ReleaseRow {
  id: string;
  channel: string;
  status: string;
  rollout_pct: number;
  to_version: number;
  dry_run_report: unknown;
}

export interface Ports {
  findActor(): Promise<{ id: string; label: string } | null>;
  loadReleased(slug: string): Promise<Released | null>;
  loadDraft(slug: string): Promise<DraftInfo | null>;
  openDraft(slug: string, actorId: string): Promise<Res<DraftInfo>>;
  saveTree(input: {
    design: string;
    tree: "home" | "shell";
    nodes: TNode[];
    expectedRev: number;
    actorId: string;
  }): Promise<Res<DraftInfo>>;
  preview(slug: string): Promise<Res<{ nextVersion: number; itemCount: number; notes: { en: string; es: string }; items: unknown[] }>>;
  publishDemos(input: { design: string; expectedRev: number; actorId: string }): Promise<
    | { ok: true; value: { version: number; releaseId: string; demosApplied: number; warnings: string[] } }
    | { ok: false; error: string; releaseId?: string; version?: number }
  >;
  findRelease(slug: string): Promise<ReleaseRow | null>;
  setRollout(release: ReleaseRow, pct: number): Promise<Res<null>>;
  openToTalents(release: ReleaseRow): Promise<Res<{ updates: number; bells: number; demosApplied: number; warnings: string[] }>>;
  lookup(): Lookup;
  log(line: string): void;
}

export const PULL_AUTHORED_CMD = (slug: string) =>
  `cd web && NODE_PATH=scripts/demo-talents/stubs DEMO_SEED_TARGET_REF=<ref> npx tsx --tsconfig scripts/demo-talents/tsconfig.json --env-file=<env> scripts/theme-authoring/pull-authored.mts --design ${slug}`;

function failedDemoSites(report: unknown): number | null {
  const s = (report as { summary?: { errors?: number; demos?: { errors?: number } } } | null)?.summary;
  if (!s) return null;
  return (s.errors ?? 0) + (s.demos?.errors ?? 0);
}

export function printPlan(p: DesignPlan, log: (l: string) => void): void {
  log(`\n=== ${p.slug} ===`);
  log(`released version: ${p.releasedVersion === null ? "none found" : `v${p.releasedVersion}`}`);
  log(
    p.draft
      ? `open draft: yes, rev ${p.draft.rev}, base v${p.draft.baseVersion}, last change ${p.draft.updatedAt} by ${p.draft.updatedBy ?? "unknown"}, differs from released: ${p.draft.hasChanges}`
      : "open draft: none (apply would open one from the released version)",
  );
  log(`nodes to change: ${p.changes.length}`);
  for (const c of p.changes) {
    log(`  ${c.path} ${JSON.stringify(c.base)} + es=${JSON.stringify(c.addedEs)} en=${JSON.stringify(c.addedEn)}`);
  }
  log(`unmatched English text (left unchanged): ${p.unmatched.length}`);
  for (const u of p.unmatched) log(`  ${u.path} ${JSON.stringify(u.base)}`);
  if (p.optionalBlocksNotApplied > 0) {
    log(`optionalBlocks matches NOT applied (saveThemeDraftTree writes home/shell only): ${p.optionalBlocksNotApplied}`);
  }
  for (const r of p.refusals) log(`REFUSED: ${r}`);
  log(
    p.refusals.length
      ? "next step: none, fix the refusal first."
      : `next step (--apply --yes --design ${p.slug}): ${p.willOpenDraft ? "open draft, " : "layer on the open draft, "}saveThemeDraftTree (home+shell), previewThemeDraftPublish, publishAndUpdateDemos (demos only).`,
  );
}

/** Returns the process exit code. */
export async function run(args: Args, ports: Ports): Promise<number> {
  const log = ports.log;
  if (args.designs.length === 0) {
    log("REFUSED: pass --design <slug> (one of: " + ALLOWED_SLUGS.join(", ") + ").");
    return 2;
  }
  const bad = args.designs.filter((d) => !(ALLOWED_SLUGS as readonly string[]).includes(d));
  if (bad.length) {
    log(`REFUSED: unknown design slug(s): ${bad.join(", ")}. Allowed: ${ALLOWED_SLUGS.join(", ")}.`);
    return 2;
  }
  if (args.apply && !args.yes) {
    log("REFUSED: --apply needs --yes.");
    return 2;
  }
  if (args.releaseToTalents && !args.apply) {
    log("REFUSED: --release-to-talents needs --apply --yes.");
    return 2;
  }
  if (args.apply && args.designs.length !== 1) {
    log("REFUSED: --apply takes exactly one --design per run.");
    return 2;
  }
  const lookup = ports.lookup();
  log(`lookup: ${lookup.pairs.size} exact English texts with es+en; ambiguous skipped: ${lookup.ambiguous.length}`);
  for (const a of lookup.ambiguous) log(`  ambiguous: ${JSON.stringify(a)}`);

  // Dry run: read-only, every requested design.
  if (!args.apply) {
    let code = 0;
    for (const slug of args.designs) {
      const [released, draft] = await Promise.all([ports.loadReleased(slug), ports.loadDraft(slug)]);
      const plan = planDesign(slug, released, draft, lookup, { includeOpenDraft: args.includeOpenDraft });
      printPlan(plan, log);
      if (plan.refusals.length) code = 2;
    }
    log("\nDRY RUN: nothing was written.");
    return code;
  }

  const slug = args.designs[0];
  const actor = args.actor ? { id: args.actor, label: "--actor override" } : await ports.findActor();
  if (!actor) {
    log("REFUSED: no platform admin (profiles.app_role = super_admin) found; pass --actor <uuid>.");
    return 2;
  }
  log(`actor: ${actor.id} (${actor.label})`);

  if (args.releaseToTalents) return releaseToTalents(slug, args, ports);

  const released = await ports.loadReleased(slug);
  const readDraft = await ports.loadDraft(slug);
  const plan = planDesign(slug, released, readDraft, lookup, { includeOpenDraft: args.includeOpenDraft });
  printPlan(plan, log);
  if (plan.refusals.length) return 2;
  if (plan.changes.length === 0) {
    log("Nothing to add: every matched node already has es+en. No release created.");
    return 0;
  }

  let draft = readDraft;
  if (!draft) {
    const opened = await ports.openDraft(slug, actor.id);
    if (!opened.ok) {
      log(`ERROR opening draft: ${opened.error}`);
      return 1;
    }
    draft = opened.value;
    // The opened draft is canonical; recompute and re-verify against IT.
    const again = planDesign(slug, released, draft, lookup, { includeOpenDraft: [slug] });
    if (again.refusals.length) {
      again.refusals.forEach((r) => log(`REFUSED: ${r}`));
      log("The freshly opened draft is left open; discard it in Builder Lab if unwanted.");
      return 2;
    }
    Object.assign(plan, { trees: again.trees, changes: again.changes });
  }

  // CAS: the rev we read must still be the rev in the database right before the write.
  const beforeStripped = { shell: stripI18n(draft.payload.shellTree ?? []), home: stripI18n(draft.payload.homeTree ?? []) };
  let rev = draft.rev;
  const check = await ports.loadDraft(slug);
  if (!check || check.rev !== rev) {
    log(`REFUSED: draft rev changed between read (${rev}) and write (${check?.rev ?? "gone"}). Nothing written.`);
    return 2;
  }
  let saved: DraftInfo = draft;
  for (const t of ["shell", "home"] as const) {
    const r = await ports.saveTree({ design: slug, tree: t, nodes: plan.trees[t === "shell" ? "shellTree" : "homeTree"], expectedRev: rev, actorId: actor.id });
    if (!r.ok) {
      const stale = r.code === "stale_rev";
      log(`${stale ? "REFUSED" : "ERROR"}: saveThemeDraftTree(${t}) failed: ${r.error}. Publish was not attempted.`);
      return stale ? 2 : 1;
    }
    saved = r.value;
    rev = saved.rev;
  }
  const afterStripped = { shell: stripI18n(saved.payload.shellTree ?? []), home: stripI18n(saved.payload.homeTree ?? []) };
  if (!isDeepStrictEqual(beforeStripped, afterStripped)) {
    log("REFUSED: the saved draft differs from the read draft beyond i18n keys. Not publishing; the draft is left open for review.");
    return 2;
  }
  log(`draft saved, rev ${rev}.`);

  const pv = await ports.preview(slug);
  if (!pv.ok) {
    log(`ERROR previewThemeDraftPublish: ${pv.error}`);
    return 1;
  }
  log(`preview: next version v${pv.value.nextVersion}, ${pv.value.itemCount} release item(s).`);
  log(`  notes en: ${pv.value.notes.en}`);
  log(`  notes es: ${pv.value.notes.es}`);

  const pub = await ports.publishDemos({ design: slug, expectedRev: rev, actorId: actor.id });
  if (!pub.ok) {
    log(`ERROR publishAndUpdateDemos: ${pub.error}${pub.releaseId ? ` (release ${pub.releaseId}, v${pub.version ?? "?"}; fix it on its Builder Lab page)` : ""}`);
    return 1;
  }
  const v = pub.value;
  log(`PUBLISHED ${slug} v${v.version}, release id ${v.releaseId}, demos updated: ${v.demosApplied}.`);
  if (v.version !== pv.value.nextVersion) log(`note: the RPC chose v${v.version}, the preview said v${pv.value.nextVersion}.`);
  v.warnings.forEach((w) => log(`warning: ${w}`));
  log("Channel is now `demos`. Talents are NOT touched.");
  log("Operator next (do not skip): run pull-authored, commit the overlay + index, then --release-to-talents:");
  log(`  ${PULL_AUTHORED_CMD(slug)}`);
  return 0;
}

async function releaseToTalents(slug: string, args: Args, ports: Ports): Promise<number> {
  const log = ports.log;
  const release = await ports.findRelease(slug);
  if (!release) {
    log("REFUSED: no release found for this design.");
    return 2;
  }
  log(`release ${release.id}: v${release.to_version}, channel ${release.channel}, status ${release.status}, rollout ${release.rollout_pct}%`);
  if (release.channel !== "demos" || release.status !== "published") {
    log("REFUSED: the release must be published on `demos` first (run --apply without --release-to-talents).");
    return 2;
  }
  const failed = failedDemoSites(release.dry_run_report);
  if (failed === null) {
    log("REFUSED: no dry run report on the release.");
    return 2;
  }
  if (failed > 0) {
    log(`REFUSED: ${failed} site(s) failed the dry run. Fix in Builder Lab first.`);
    return 2;
  }
  if (release.rollout_pct <= 0) {
    if (args.rollout === null) {
      log("REFUSED: rollout is 0%. Pass --rollout <1-100> (Builder Lab requires it before opening to talents).");
      return 2;
    }
    const s = await ports.setRollout(release, args.rollout);
    if (!s.ok) {
      log(`ERROR setting rollout: ${s.error}`);
      return 1;
    }
    release.rollout_pct = args.rollout;
  }
  const res = await ports.openToTalents(release);
  if (!res.ok) {
    log(`REFUSED by the release manager: ${res.error}`);
    return 2;
  }
  log(`OPENED to talents (optin): updates ${res.value.updates}, bells ${res.value.bells}, demos ${res.value.demosApplied}.`);
  res.value.warnings.forEach((w) => log(`warning: ${w}`));
  log("Not done here: Make default (catalog flip). Per-site upgrade is the separate runner.");
  return 0;
}
