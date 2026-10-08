/**
 * TUL-209 (b): pure plan, guards and runner that add the ENGLISH node overlay
 * (`props.i18n.en.<key>`) to the Spanish text of five block kinds in the page
 * trees of the allow-listed Spanish-primary DEMO talents:
 *   comp_card  eyebrow, title
 *   visit      eyebrow, title, titleAccent, mapCaption, extraFacts.N.label|value|note
 *   reviews    eyebrow, title
 *   spec_table eyebrow, title, rows.N.label|value
 *   stats      items.N.label|value
 * No database client and no app imports beyond pure data: every read and write
 * goes through the injected `Io`, so the tests drive it with a fake and nothing
 * in here can reach production by itself.
 *
 * What it never does: overwrite a non-empty `en`, touch `es`, the base props or
 * any other node, translate anything that has no English source (those texts are
 * only listed), touch a profile that is not on the allow-list and flagged demo,
 * or write without `--apply --yes`.
 *
 * Writes go through the app's own DRAFT writer (history entry, draft_rev CAS).
 * A demo is published only when its live site already EQUALLED the draft before
 * the patch, so a publish can ship nothing but the overlays; otherwise the run
 * reports "needs publish".
 */
import { diffLeaves } from "../jorgelina-content/publish-plan";
import { FORBIDDEN_PROFILE_CODES, FORBIDDEN_SITE_SLUGS, ALLOWED_TARGETS, type DemoTarget } from "../demo-english-data/targets";
import { liveEqualsDraft, type DraftWriteInput, type Node, type Snapshot } from "../en-content-fill/ticker-plan";
import { isObj, sameJson } from "../en-content-fill/guards";
import { glossFor, norm, type Gloss } from "./content";

export class RefusedError extends Error {}

// ---------------------------------------------------------------- targets

/** The demo targets of TUL-207 plus the Spanish Gridline and Maison demos (slugs from theme-demos.ts). */
export const TARGETS: readonly DemoTarget[] = [
  ...ALLOWED_TARGETS,
  { profileCode: "TAL-93003", siteSlug: "camila-nails", hosts: ["camila-nails-demo"] },
  { profileCode: "TAL-93208", siteSlug: "saul-tapia-ortega", hosts: ["saul-tapia-ortega-demo"] },
  { profileCode: "TAL-93209", siteSlug: "karla-beltran", hosts: ["karla-beltran-demo"] },
];

/** Static guard over the constants: the allow-list can never include a forbidden target. */
export function assertStaticSafety(targets: readonly DemoTarget[] = TARGETS): void {
  const seen = new Set<string>();
  for (const t of targets) {
    if (FORBIDDEN_PROFILE_CODES.includes(t.profileCode)) throw new RefusedError(`allow-list contains forbidden profile ${t.profileCode}`);
    if (FORBIDDEN_SITE_SLUGS.includes(t.siteSlug)) throw new RefusedError(`allow-list contains forbidden site ${t.siteSlug}`);
    if (seen.has(t.profileCode)) throw new RefusedError(`allow-list lists ${t.profileCode} twice`);
    seen.add(t.profileCode);
  }
}

// ---------------------------------------------------------------- types

export interface DemoSnapshot extends Snapshot {
  profile: Snapshot["profile"] & { is_demo: boolean | null };
}

export interface Io {
  /** Everything the plan reads. `null` when the profile does not exist. */
  load(profileCode: string): Promise<DemoSnapshot | null>;
  /** DRAFT write through the app's own writer (history entry, draft_rev CAS). Never touches published state. */
  writeDraft(input: DraftWriteInput): Promise<{ ok: true; draftRev: number } | { ok: false; conflict: boolean; error: string }>;
  /** Service-role publish. Only called when the live site equalled the draft. */
  publish(input: { siteId: string; talentProfileId: string; profileCode: string; userId: string }): Promise<{ ok: true; warning?: string } | { ok: false; error: string }>;
  backup(label: string, data: unknown): string;
  readBackup(path: string): unknown;
  log(line: string): void;
  now(): string;
}

export interface Options { apply: boolean; yes: boolean; only: string[]; restore: string | null; noPublish: boolean }

export interface Change {
  scope: "home" | "shell";
  /** `[0].children[1]` path of the node. */
  path: string;
  id: string | undefined;
  kind: string;
  /** Overlay key: `title`, `rows.0.label`, ... */
  key: string;
  es: string;
  en: string;
  source: string;
}

export interface Need { scope: "home" | "shell"; path: string; id: string | undefined; kind: string; key: string; es: string }

export interface TreePlan {
  scope: "home" | "shell";
  /** Nodes of the five kinds found. */
  nodes: number;
  changes: Change[];
  /** Texts whose `en` overlay already exists (left alone). */
  enExists: number;
  needs: Need[];
  before: Node[];
  after: Node[];
}

export interface ProfilePlan {
  target: DemoTarget;
  home: TreePlan;
  shell: TreePlan;
  homePageId: string;
  liveEqualsDraft: boolean;
  liveEqualsDraftWhy: string[];
}

// ---------------------------------------------------------------- what is localised

/** Flat text props per kind (a subset of `builder-i18n-props.ts`; a test cross-checks them). */
export const FLAT_PROPS: Readonly<Record<string, readonly string[]>> = {
  comp_card: ["eyebrow", "title"],
  visit: ["eyebrow", "title", "titleAccent", "mapCaption"],
  reviews: ["eyebrow", "title"],
  spec_table: ["eyebrow", "title"],
};

/** List props per kind: dotted overlay keys `<list>.<i>.<field>`. */
export const LIST_PROPS: Readonly<Record<string, ReadonlyArray<{ list: string; fields: readonly string[] }>>> = {
  visit: [{ list: "extraFacts", fields: ["label", "value", "note"] }],
  spec_table: [{ list: "rows", fields: ["label", "value"] }],
  stats: [{ list: "items", fields: ["label", "value"] }],
};

export const KINDS: readonly string[] = [...new Set([...Object.keys(FLAT_PROPS), ...Object.keys(LIST_PROPS)])];

// ---------------------------------------------------------------- helpers

const clone = <T,>(v: T): T => (v === undefined ? v : (JSON.parse(JSON.stringify(v)) as T));
const asTree = (v: unknown): Node[] => (Array.isArray(v) ? (v as Node[]) : []);
const nonEmpty = (s: unknown): s is string => typeof s === "string" && s.trim().length > 0;
const clip = (s: string) => (s.length > 70 ? `${s.slice(0, 67)}...` : s);

/** Text with no letters once `{{tokens}}` are removed (numbers, prices, punctuation): profile data, never copy. */
export const hasNoCopy = (s: string): boolean => !/\p{L}/u.test(s.replace(/\{\{[^}]*\}\}/g, ""));

const SPANISH_MARK = /[áéíóúñ¿¡]|\b(de|del|la|el|los|las|con|para|por|tu|tus|una|antes|desde|en|y)\b/i;
/** Heuristic only, used to decide whether an unmatched text is worth listing as "needs English". */
export const looksSpanish = (s: string): boolean => SPANISH_MARK.test(s.normalize("NFC"));

function nodesOf(nodes: Node[], base = ""): Array<{ path: string; node: Node }> {
  const out: Array<{ path: string; node: Node }> = [];
  nodes.forEach((n, i) => {
    const path = `${base}[${i}]`;
    if (!n || typeof n !== "object") return;
    out.push({ path, node: n });
    if (Array.isArray(n.children)) out.push(...nodesOf(n.children, `${path}.children`));
  });
  return out;
}

/** The node at a `[0].children[1]` path, or null. */
function nodeAt(nodes: unknown, path: string): Node | null {
  const idx = [...path.matchAll(/\[(\d+)\]/g)].map((m) => Number(m[1]));
  let list: unknown = nodes;
  let node: Node | null = null;
  for (const i of idx) {
    if (!Array.isArray(list) || !list[i] || typeof list[i] !== "object") return null;
    node = list[i] as Node;
    list = node.children;
  }
  return node;
}

const overlayOf = (props: Record<string, unknown>, lang: string): Record<string, unknown> => {
  const all = props.i18n;
  if (!isObj(all)) return {};
  const bag = all[lang];
  return isObj(bag) ? bag : {};
};

/** Every (key, Spanish source text) a node can hold, in a stable order. */
function textsOf(node: Node): Array<{ key: string; text: string }> {
  const p = node.props ?? {};
  const kind = node.kind ?? "";
  const es = overlayOf(p, "es");
  const out: Array<{ key: string; text: string }> = [];
  const push = (key: string, base: unknown) => {
    const own = es[key];
    const text = nonEmpty(own) ? own : base;
    if (nonEmpty(text)) out.push({ key, text });
  };
  for (const k of FLAT_PROPS[kind] ?? []) push(k, p[k]);
  for (const spec of LIST_PROPS[kind] ?? []) {
    const list = p[spec.list];
    if (!Array.isArray(list)) continue;
    list.forEach((item, i) => {
      if (!isObj(item)) return;
      for (const f of spec.fields) push(`${spec.list}.${i}.${f}`, item[f]);
    });
  }
  return out;
}

// ---------------------------------------------------------------- plan

/** Plans one tree. The `after` tree differs from `before` ONLY by new `props.i18n.en.<key>` leaves. */
export function planTree(scope: "home" | "shell", tree: unknown, gloss: Gloss): TreePlan {
  const before = asTree(tree);
  const after = clone(before);
  const plan: TreePlan = { scope, nodes: 0, changes: [], enExists: 0, needs: [], before, after };
  for (const { path, node } of nodesOf(before)) {
    if (!node.kind || !KINDS.includes(node.kind)) continue;
    plan.nodes++;
    const en = overlayOf(node.props ?? {}, "en");
    for (const { key, text } of textsOf(node)) {
      if (nonEmpty(en[key])) { plan.enExists++; continue; }
      if (hasNoCopy(text)) continue;
      const hit = gloss.get(norm(text));
      if (!hit) {
        if (looksSpanish(text)) plan.needs.push({ scope, path, id: node.id, kind: node.kind, key, es: text });
        continue;
      }
      plan.changes.push({ scope, path, id: node.id, kind: node.kind, key, es: text, en: hit.en, source: hit.source });
    }
  }
  for (const c of plan.changes) {
    const n = nodeAt(after, c.path);
    if (!n || n.kind !== c.kind || n.id !== c.id) throw new RefusedError(`${scope}: anchor ${c.path} does not resolve to the planned ${c.kind}`);
    const props = n.props ?? {};
    const i18n = isObj(props.i18n) ? { ...props.i18n } : {};
    const enBag = isObj(i18n.en) ? { ...i18n.en } : {};
    enBag[c.key] = c.en;
    n.props = { ...props, i18n: { ...i18n, en: enBag } };
  }
  assertOnlyEnAdded(plan);
  return plan;
}

/** The only difference between before and after may be one new `en` leaf per change. Throws RefusedError otherwise. */
export function assertOnlyEnAdded(p: TreePlan): void {
  const want = new Map(p.changes.map((c) => [`${c.path}.props.i18n.en.${c.key}`, c.en]));
  for (const d of diffLeaves(p.before, p.after, "")) {
    if (!want.has(d.path)) throw new RefusedError(`${p.scope}: unexpected change at ${d.path}`);
    if (d.after !== want.get(d.path) || (d.before !== undefined && d.before !== "")) throw new RefusedError(`${p.scope}: unexpected value change at ${d.path}`);
    want.delete(d.path);
  }
  if (want.size > 0) throw new RefusedError(`${p.scope}: planned change missing for ${[...want.keys()].join(", ")}`);
}

export function planProfile(s: DemoSnapshot, target: DemoTarget, gloss: Gloss = glossFor(target.profileCode)): ProfilePlan {
  const homes = s.pages.filter((p) => p.is_home);
  if (homes.length !== 1) throw new RefusedError(`${target.profileCode}: expected exactly 1 home page, found ${homes.length}`);
  const home = planTree("home", homes[0]!.blocks, gloss);
  const shell = planTree("shell", s.site.shell_tree, gloss);
  const eq = liveEqualsDraft(s);
  return { target, home, shell, homePageId: homes[0]!.id, liveEqualsDraft: eq.equal, liveEqualsDraftWhy: eq.why };
}

const count = (p: ProfilePlan) => p.home.changes.length + p.shell.changes.length;

// ---------------------------------------------------------------- guards

export function parseArgs(argv: readonly string[]): Options {
  let apply = false, yes = false, noPublish = false;
  let restore: string | null = null;
  const only: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === "--apply") { apply = true; continue; }
    if (a === "--yes") { yes = true; continue; }
    if (a === "--no-publish") { noPublish = true; continue; }
    if (a === "--only") { only.push(...(argv[++i] ?? "").split(",").map((s) => s.trim()).filter(Boolean)); continue; }
    if (a.startsWith("--only=")) { only.push(...a.slice(7).split(",").map((s) => s.trim()).filter(Boolean)); continue; }
    if (a === "--restore") { restore = (argv[++i] ?? "").trim(); continue; }
    if (a.startsWith("--restore=")) { restore = a.slice(10).trim(); continue; }
    throw new RefusedError(`unknown argument ${a}`);
  }
  if (restore !== null && restore === "") throw new RefusedError("--restore needs a backup file path");
  if (yes && !apply) throw new RefusedError("--yes without --apply does nothing; refusing");
  if (apply && !yes) throw new RefusedError("--apply needs --yes as well (dry run is the default)");
  return { apply, yes, only, restore, noPublish };
}

/** Per-profile guard on what the database returned. Throws RefusedError on any mismatch. */
export function assertResolved(target: DemoTarget, s: DemoSnapshot): void {
  const code = target.profileCode;
  if (FORBIDDEN_PROFILE_CODES.includes(code) || FORBIDDEN_PROFILE_CODES.includes(s.profile.profile_code)) {
    throw new RefusedError(`refusing ${s.profile.profile_code}: a real or QA talent is never a target`);
  }
  if (s.profile.profile_code !== code) throw new RefusedError(`refusing: asked for ${code} but the database returned ${s.profile.profile_code}`);
  if (!TARGETS.some((t) => t.profileCode === code && t.siteSlug === target.siteSlug)) throw new RefusedError(`refusing ${code}: not on the allow-list`);
  if (s.profile.is_demo !== true) throw new RefusedError(`refusing ${code}: not flagged is_demo (a real talent is never a target)`);
  const slug = s.site.site_slug;
  if (slug && FORBIDDEN_SITE_SLUGS.includes(slug)) throw new RefusedError(`refusing site ${slug}: never a target`);
  if (slug !== target.siteSlug) throw new RefusedError(`refusing ${code}: site slug is ${JSON.stringify(slug)}, the allow-list expects ${target.siteSlug}`);
}

function selectTargets(only: readonly string[]): DemoTarget[] {
  for (const code of only) {
    if (FORBIDDEN_PROFILE_CODES.includes(code)) throw new RefusedError(`refusing ${code}: a real or QA talent is never a target`);
    if (!TARGETS.some((t) => t.profileCode === code)) throw new RefusedError(`refusing ${code}: not on the allow-list`);
  }
  return only.length ? TARGETS.filter((t) => only.includes(t.profileCode)) : [...TARGETS];
}

// ---------------------------------------------------------------- output

const fmtNode = (c: { path: string; id: string | undefined }) => `${c.path}${c.id ? ` (id ${c.id})` : ""}`;

export function formatPlan(p: ProfilePlan): string[] {
  const out: string[] = [];
  for (const t of [p.home, p.shell]) {
    out.push(`  ${t.scope} draft: ${t.nodes} node(s) of the five kinds; en exists on ${t.enExists} text(s)`);
    for (const c of t.changes) out.push(`    + ${c.kind} ${fmtNode(c)} ${c.key}: ES "${clip(c.es)}" -> add EN "${clip(c.en)}"  [${c.source}]`);
    for (const n of t.needs) out.push(`    ? ${n.kind} ${fmtNode(n)} ${n.key}: NEEDS ENGLISH, ES "${clip(n.es)}" (no English source)`);
  }
  out.push(p.liveEqualsDraft ? "  Live site equals the draft: a publish would ship only the overlays." : `  Live site differs from the draft (${p.liveEqualsDraftWhy.join("; ")}): the change would need publish.`);
  return out;
}

// ---------------------------------------------------------------- verification

/** Re-read check for one profile. `expect` is the draft trees that should now be stored (null = unchanged). */
export function verifySnapshots(before: DemoSnapshot, after: DemoSnapshot, expect: { home: Node[] | null; shell: Node[] | null; published: boolean }): string[] {
  const problems: string[] = [];
  const bHome = before.pages.find((p) => p.is_home);
  const aHome = after.pages.find((p) => p.is_home);
  if (!bHome || !aHome) return ["home page missing"];
  if (!sameJson(aHome.blocks, expect.home ?? bHome.blocks)) problems.push("home draft is not what was planned");
  if (!sameJson(after.site.shell_tree, expect.shell ?? before.site.shell_tree)) problems.push("shell draft is not what was planned");
  if (expect.published) {
    if (!sameJson(aHome.blocks_published, aHome.blocks)) problems.push("home live does not equal the draft after publish");
    if (!sameJson(after.site.shell_published, after.site.shell_tree)) problems.push("shell live does not equal the draft after publish");
  } else {
    if (!sameJson(aHome.blocks_published, bHome.blocks_published)) problems.push("home live changed but nothing was published");
    if (!sameJson(after.site.shell_published, before.site.shell_published)) problems.push("shell live changed but nothing was published");
  }
  for (const b of before.pages.filter((p) => !p.is_home)) {
    const a = after.pages.find((p) => p.id === b.id);
    if (!a) { problems.push(`page ${b.id} disappeared`); continue; }
    if (!sameJson(a.blocks, b.blocks) || !sameJson(a.blocks_published, b.blocks_published)) problems.push(`page ${b.id} changed`);
  }
  if (!sameJson(after.site.design_tokens_draft, before.site.design_tokens_draft) || !sameJson(after.site.design_tokens, before.site.design_tokens)) problems.push("design tokens changed");
  if (!expect.published) {
    for (const d of [...diffLeaves(bHome.blocks, aHome.blocks, "home:"), ...diffLeaves(before.site.shell_tree, after.site.shell_tree, "shell:")]) {
      if (!/\.props\.i18n\.en\./.test(d.path)) problems.push(`unexpected difference at ${d.path}`);
    }
  }
  return problems;
}

// ---------------------------------------------------------------- backup shape

export interface BackupEntry {
  profileCode: string;
  profileId: string;
  siteSlug: string;
  siteId: string;
  willPublish: boolean;
  home: { pageId: string; before: unknown; after: unknown; blocksPublishedBefore: unknown } | null;
  shell: { before: unknown; after: unknown; shellPublishedBefore: unknown } | null;
}

export interface Backup { ticket: "TUL-209"; kind: "demo-block-en-overlays"; label: string; createdAt: string; entries: BackupEntry[] }

export function parseBackup(raw: unknown): Backup {
  if (!isObj(raw) || raw.kind !== "demo-block-en-overlays" || !Array.isArray(raw.entries)) throw new RefusedError("not a demo-block-en-overlays backup file");
  const entries: BackupEntry[] = raw.entries.map((e: unknown) => {
    if (!isObj(e) || typeof e.profileCode !== "string" || typeof e.profileId !== "string" || typeof e.siteSlug !== "string" || typeof e.siteId !== "string") {
      throw new RefusedError("backup has a malformed entry");
    }
    const home = isObj(e.home) && typeof e.home.pageId === "string"
      ? { pageId: e.home.pageId, before: e.home.before, after: e.home.after, blocksPublishedBefore: e.home.blocksPublishedBefore }
      : null;
    const shell = isObj(e.shell) ? { before: e.shell.before, after: e.shell.after, shellPublishedBefore: e.shell.shellPublishedBefore } : null;
    return { profileCode: e.profileCode, profileId: e.profileId, siteSlug: e.siteSlug, siteId: e.siteId, willPublish: e.willPublish === true, home, shell };
  });
  return { ticket: "TUL-209", kind: "demo-block-en-overlays", label: typeof raw.label === "string" ? raw.label : "", createdAt: typeof raw.createdAt === "string" ? raw.createdAt : "", entries };
}

// ---------------------------------------------------------------- runner

export interface RunResult { exitCode: number; wrote: number; published: number; backupPath: string | null; mode: "dry-run" | "apply" | "restore-dry-run" | "restore" | "refused" }

const SUMMARY_PATCH = { en: "English text added to demo blocks", es: "Texto en inglés agregado a bloques de demo" };
const SUMMARY_RESTORE = { en: "Demo block English text restored", es: "Texto en inglés de bloques de demo restaurado" };

export async function run(argv: readonly string[], io: Io): Promise<RunResult> {
  const { log } = io;
  const refused = (msg: string): RunResult => {
    log(`REFUSED: ${msg}`);
    log("Nothing was written.");
    return { exitCode: 2, wrote: 0, published: 0, backupPath: null, mode: "refused" };
  };
  try {
    assertStaticSafety();
    const o = parseArgs(argv);
    const targets = selectTargets(o.only);
    return o.restore ? await runRestore(o, targets, io) : await runPatch(o, targets, io);
  } catch (e) {
    if (e instanceof RefusedError) return refused(e.message);
    throw e;
  }
}

async function loadResolved(target: DemoTarget, io: Io): Promise<DemoSnapshot> {
  const s = await io.load(target.profileCode);
  if (!s) throw new RefusedError(`profile ${target.profileCode} not found in this database`);
  assertResolved(target, s);
  io.log(`${target.profileCode} id=${s.profile.id} site=${s.site.site_slug} is_demo=true  (${target.hosts.join(", ")})`);
  return s;
}

async function runPatch(o: Options, targets: DemoTarget[], io: Io): Promise<RunResult> {
  const { log } = io;
  log(o.apply ? "MODE: APPLY (backup first, draft write, verify, publish only if live equalled the draft)" : "MODE: DRY RUN (nothing is written)");
  const loaded: Array<{ before: DemoSnapshot; plan: ProfilePlan; willPublish: boolean }> = [];
  let adds = 0, needs = 0, skips = 0;
  for (const t of targets) {
    const before = await loadResolved(t, io);
    const plan = planProfile(before, t);
    for (const l of formatPlan(plan)) log(l);
    const homeRow = before.pages.find((p) => p.is_home)!;
    const willPublish = !o.noPublish && plan.liveEqualsDraft && homeRow.status === "published" && !!before.profile.user_id;
    if (count(plan) > 0) log(willPublish ? "  After the draft write: will PUBLISH (live equalled the draft)." : "  After the draft write: NEEDS PUBLISH (the script will not publish).");
    adds += count(plan);
    needs += plan.home.needs.length + plan.shell.needs.length;
    skips += plan.home.enExists + plan.shell.enExists;
    loaded.push({ before, plan, willPublish });
  }
  log("");
  log(`TOTALS: add=${adds} skip(en exists)=${skips} needs-english=${needs} profiles with changes=${loaded.filter((l) => count(l.plan) > 0).length}`);
  if (!o.apply) {
    log("Dry run only. To write: add --apply --yes.");
    return { exitCode: 0, wrote: 0, published: 0, backupPath: null, mode: "dry-run" };
  }
  const work = loaded.filter((l) => count(l.plan) > 0);
  if (work.length === 0) { log("Nothing to write."); return { exitCode: 0, wrote: 0, published: 0, backupPath: null, mode: "apply" }; }

  const backup: Backup = {
    ticket: "TUL-209",
    kind: "demo-block-en-overlays",
    label: "patch",
    createdAt: io.now(),
    entries: work.map(({ before, plan, willPublish }) => ({
      profileCode: plan.target.profileCode,
      profileId: before.profile.id,
      siteSlug: before.site.site_slug as string,
      siteId: before.site.id,
      willPublish,
      home: plan.home.changes.length > 0 ? { pageId: plan.homePageId, before: plan.home.before, after: plan.home.after, blocksPublishedBefore: before.pages.find((p) => p.id === plan.homePageId)!.blocks_published } : null,
      shell: plan.shell.changes.length > 0 ? { before: plan.shell.before, after: plan.shell.after, shellPublishedBefore: before.site.shell_published } : null,
    })),
  };
  const backupPath = io.backup("patch", backup);
  log(`Backup of the old tree(s) of ${backup.entries.length} profile(s): ${backupPath}`);
  log(`Undo with: --restore ${backupPath} --apply --yes`);

  let wrote = 0, published = 0, failed = 0;
  for (const { before, plan, willPublish } of work) {
    const code = plan.target.profileCode;
    const res = await io.writeDraft({
      siteId: before.site.id,
      expectedDraftRev: before.site.draft_rev,
      ...(plan.shell.changes.length > 0 ? { shell: plan.shell.after } : {}),
      ...(plan.home.changes.length > 0 ? { home: { pageId: plan.homePageId, blocks: plan.home.after } } : {}),
      kind: "edit",
      summaryEn: SUMMARY_PATCH.en,
      summaryEs: SUMMARY_PATCH.es,
    });
    if (!res.ok) {
      log(res.conflict ? `FAILED ${code}: the site was saved by someone while this ran (draft_rev moved). Nothing was written for it. Re-run.` : `FAILED ${code}: draft write error: ${res.error}`);
      failed++;
      continue;
    }
    wrote++;
    const expect = { home: plan.home.changes.length > 0 ? plan.home.after : null, shell: plan.shell.changes.length > 0 ? plan.shell.after : null };
    const afterDraft = await io.load(code);
    const draftProblems = afterDraft ? verifySnapshots(before, afterDraft, { ...expect, published: false }) : ["could not re-read the profile"];
    if (draftProblems.length > 0) {
      log(`FAILED VERIFICATION ${code} after the draft write:`);
      for (const p of draftProblems) log(`  ! ${p}`);
      failed++;
      continue;
    }
    log(`${code}: draft written (draft_rev ${res.draftRev}) and verified: only English overlays were added.`);
    if (!willPublish) { log(`${code}: NEEDS PUBLISH (draft patched, live not).`); continue; }
    const pub = await io.publish({ siteId: before.site.id, talentProfileId: before.profile.id, profileCode: code, userId: before.profile.user_id as string });
    if (!pub.ok) { log(`FAILED ${code}: publish error: ${pub.error}. The draft is patched; the live site is not.`); failed++; continue; }
    if (pub.warning) log(`WARN ${code}: ${pub.warning}`);
    const afterPub = await io.load(code);
    const pubProblems = afterPub ? verifySnapshots(before, afterPub, { ...expect, published: true }) : ["could not re-read the profile"];
    if (pubProblems.length > 0) {
      log(`FAILED VERIFICATION ${code} after publish (the publish happened; use the backup to roll back):`);
      for (const p of pubProblems) log(`  ! ${p}`);
      failed++;
      continue;
    }
    published++;
    log(`${code}: published and verified.`);
  }
  log(`Done: drafts written=${wrote} published=${published} failed=${failed}.`);
  return { exitCode: failed > 0 ? 1 : 0, wrote, published, backupPath, mode: "apply" };
}

async function runRestore(o: Options, targets: DemoTarget[], io: Io): Promise<RunResult> {
  const { log } = io;
  const backup = parseBackup(io.readBackup(o.restore as string));
  log(o.apply ? "MODE: RESTORE (apply)" : "MODE: RESTORE DRY RUN (nothing is written)");
  type Item = { entry: BackupEntry; before: DemoSnapshot; homeBack: Node[] | null; shellBack: Node[] | null; willPublish: boolean };
  const items: Item[] = [];
  let skipped = 0;
  for (const entry of backup.entries) {
    const target = TARGETS.find((t) => t.profileCode === entry.profileCode);
    if (!target) throw new RefusedError(`backup names ${entry.profileCode}, which is not on the allow-list`);
    if (!targets.some((t) => t.profileCode === entry.profileCode)) continue;
    const before = await loadResolved(target, io);
    if (entry.profileId !== before.profile.id) throw new RefusedError(`backup is for profile ${entry.profileId}, this database resolved ${before.profile.id}`);
    if (entry.siteSlug !== before.site.site_slug) throw new RefusedError(`backup is for site ${entry.siteSlug}, resolved ${before.site.site_slug}`);
    if (entry.siteId !== before.site.id) throw new RefusedError("backup is for another site row");
    const homePage = before.pages.find((p) => p.is_home);
    if (!homePage) throw new RefusedError(`${entry.profileCode}: no home page`);
    if (entry.home && entry.home.pageId !== homePage.id) throw new RefusedError("backup is for another home page row");
    let homeBack: Node[] | null = null;
    let shellBack: Node[] | null = null;
    if (entry.home) {
      if (sameJson(homePage.blocks, entry.home.before)) log("  home draft: already at the backed-up tree; skip");
      else if (sameJson(homePage.blocks, entry.home.after)) { log("  home draft: restore the patched tree to the backed-up tree"); homeBack = asTree(entry.home.before); }
      else { log("  home draft: changed since this script wrote it; NOT restored"); skipped++; }
    }
    if (entry.shell) {
      if (sameJson(before.site.shell_tree, entry.shell.before)) log("  shell draft: already at the backed-up tree; skip");
      else if (sameJson(before.site.shell_tree, entry.shell.after)) { log("  shell draft: restore the patched tree to the backed-up tree"); shellBack = asTree(entry.shell.before); }
      else { log("  shell draft: changed since this script wrote it; NOT restored"); skipped++; }
    }
    const eq = liveEqualsDraft(before);
    const willPublish = !o.noPublish && entry.willPublish && eq.equal && homePage.status === "published" && !!before.profile.user_id;
    items.push({ entry, before, homeBack, shellBack, willPublish });
  }
  const todo = items.filter((i) => i.homeBack || i.shellBack);
  log("");
  log(`TOTALS: profiles to restore=${todo.length} skipped(changed since)=${skipped}`);
  if (!o.apply) {
    log("Dry run only. To restore: add --apply --yes.");
    return { exitCode: 0, wrote: 0, published: 0, backupPath: null, mode: "restore-dry-run" };
  }
  if (todo.length === 0) { log("Nothing to restore."); return { exitCode: skipped > 0 ? 1 : 0, wrote: 0, published: 0, backupPath: null, mode: "restore" }; }

  const undo: Backup = {
    ticket: "TUL-209",
    kind: "demo-block-en-overlays",
    label: "restore-undo",
    createdAt: io.now(),
    entries: todo.map(({ entry, before, homeBack, shellBack, willPublish }) => {
      const homePage = before.pages.find((p) => p.is_home)!;
      return {
        ...entry,
        willPublish,
        home: homeBack ? { pageId: homePage.id, before: homePage.blocks, after: homeBack, blocksPublishedBefore: homePage.blocks_published } : null,
        shell: shellBack ? { before: before.site.shell_tree, after: shellBack, shellPublishedBefore: before.site.shell_published } : null,
      };
    }),
  };
  const backupPath = io.backup("restore-undo", undo);
  log(`Backup of the trees being replaced: ${backupPath}`);

  let wrote = 0, published = 0, failed = 0;
  for (const { entry, before, homeBack, shellBack, willPublish } of todo) {
    const code = entry.profileCode;
    const homePage = before.pages.find((p) => p.is_home)!;
    const res = await io.writeDraft({
      siteId: before.site.id,
      expectedDraftRev: before.site.draft_rev,
      ...(shellBack ? { shell: shellBack } : {}),
      ...(homeBack ? { home: { pageId: homePage.id, blocks: homeBack } } : {}),
      kind: "restore",
      summaryEn: SUMMARY_RESTORE.en,
      summaryEs: SUMMARY_RESTORE.es,
    });
    if (!res.ok) { log(res.conflict ? `FAILED ${code}: draft_rev moved. Nothing written for it.` : `FAILED ${code}: draft write error: ${res.error}`); failed++; continue; }
    wrote++;
    const expect = { home: homeBack, shell: shellBack };
    const afterDraft = await io.load(code);
    const problems = afterDraft ? verifySnapshots(before, afterDraft, { ...expect, published: false }) : ["could not re-read the profile"];
    if (problems.length > 0) { log(`FAILED VERIFICATION ${code} after the draft restore:`); for (const p of problems) log(`  ! ${p}`); failed++; continue; }
    if (!willPublish) { log(`${code}: draft restored and verified; the live site was not touched.`); continue; }
    const pub = await io.publish({ siteId: before.site.id, talentProfileId: before.profile.id, profileCode: code, userId: before.profile.user_id as string });
    if (!pub.ok) { log(`FAILED ${code}: publish error: ${pub.error}. The draft is restored; the live site is not.`); failed++; continue; }
    const afterPub = await io.load(code);
    const pubProblems = afterPub ? verifySnapshots(before, afterPub, { ...expect, published: true }) : ["could not re-read the profile"];
    if (pubProblems.length > 0) { log(`FAILED VERIFICATION ${code} after publish:`); for (const p of pubProblems) log(`  ! ${p}`); failed++; continue; }
    published++;
    log(`${code}: restored, published and verified.`);
  }
  log(`Done: drafts restored=${wrote} published=${published} failed=${failed}.`);
  return { exitCode: failed > 0 || skipped > 0 ? 1 : 0, wrote, published, backupPath, mode: "restore" };
}
