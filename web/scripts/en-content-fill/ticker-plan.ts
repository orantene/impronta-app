/**
 * TUL-15 Stage 5b layer B, script 2: pure plan, guards and runner that make the
 * ticker (`marquee` node) of the TEST talent TAL-93900 follow her services.
 * No database client and no app imports (only the pure leaf-diff helper of the
 * Jorgelina scripts): every read and write goes through the injected `Io`, so
 * the tests drive it with a fake and nothing in here can reach production alone.
 *
 * The change (PR #2716 semantics): a `marquee` with NO `props.source`, or
 * `source: "custom"`, gets `source: "services"`. Its typed `items` stay exactly
 * as they are: they are the fallback words a services ticker shows when she has
 * no published services. A ticker that already has a source, a marquee with no
 * typed items, a node of any other kind, and every other prop are left alone.
 *
 * Trees looked at: the HOME page and the SHELL (draft and published). Nodes are
 * anchored by TREE PATH and id (the lede-anchor lesson of publish-plan.ts): the
 * final diff of draft-before vs draft-after must be EXACTLY one
 * `<path>.props.source` leaf per planned node, anything else refuses.
 *
 * Writes go through the app's own DRAFT writer (history entry, draft_rev CAS).
 * The site is published only when the live site already EQUALS the draft before
 * the patch (so a publish can ship nothing but the ticker); otherwise the run
 * reports "needs publish". Same rule as scripts/upgrade-site-designs.mjs.
 */

import { diffLeaves } from "../jorgelina-content/publish-plan";
import {
  assertProfileCode,
  assertResolvedTarget,
  isObj,
  parseCli,
  RefusedError,
  sameJson,
  targetLine,
  TARGET_PROFILE_CODE,
  type CliOptions,
} from "./guards";

// ---------------------------------------------------------------- types

export type Node = { id?: string; kind?: string; props?: Record<string, unknown>; children?: Node[]; [k: string]: unknown };

export interface SiteRow {
  id: string;
  site_slug: string | null;
  shell_tree: unknown;
  shell_published: unknown;
  design_tokens_draft: unknown;
  design_tokens: unknown;
  draft_rev: number | null;
  site_published_at: string | null;
}

export interface PageRow {
  id: string;
  is_home: boolean;
  status: string | null;
  blocks: unknown;
  blocks_published: unknown;
  updated_at: string;
}

export interface Snapshot {
  profile: { id: string; profile_code: string; user_id: string | null };
  site: SiteRow;
  pages: PageRow[];
}

export interface DraftWriteInput {
  siteId: string;
  /** CAS on talent_sites.draft_rev. */
  expectedDraftRev: number | null;
  shell?: Node[];
  home?: { pageId: string; blocks: Node[] };
  kind: "edit" | "restore";
  summaryEn: string;
  summaryEs: string;
}

export interface Io {
  /** Everything the plan reads. `null` when the profile does not exist. */
  load(profileCode: string): Promise<Snapshot | null>;
  /** DRAFT write through the app's own writer (history entry, draft_rev CAS). Never touches published state. */
  writeDraft(input: DraftWriteInput): Promise<{ ok: true; draftRev: number } | { ok: false; conflict: boolean; error: string }>;
  /** Service-role publish (same path the upgrade script uses). Only called when the live site equalled the draft. */
  publish(input: { siteId: string; talentProfileId: string; profileCode: string; userId: string }): Promise<{ ok: true; warning?: string } | { ok: false; error: string }>;
  backup(label: string, data: unknown): string;
  readBackup(path: string): unknown;
  log(line: string): void;
  now(): string;
}

export interface Found { path: string; id: string | undefined }
export interface SkippedMarquee extends Found { reason: string }

export interface TreePlan {
  scope: "home" | "shell";
  /** Every marquee in the draft tree. */
  total: number;
  /** Will be set to source "services". */
  candidates: Found[];
  /** Already `services` (left alone). */
  already: Found[];
  skipped: SkippedMarquee[];
  before: Node[];
  after: Node[];
}

export interface LiveTree {
  scope: "home-published" | "shell-published";
  customMarquees: Found[];
  servicesMarquees: Found[];
}

export interface Plan {
  home: TreePlan;
  shell: TreePlan;
  homePage: PageRow;
  live: LiveTree[];
  /** The live site equals the draft before the patch, so a publish can ship nothing else. */
  liveEqualsDraft: boolean;
  liveEqualsDraftWhy: string[];
  /** Candidates exist in the draft, so a write is needed. */
  writes: boolean;
  /** Already patched in the draft but not live: nothing to write, needs publish. */
  draftPatchedLiveNot: boolean;
}

/** One home ticker and one shell ticker is the most this script is built for. */
export const MAX_MARQUEES_PER_TREE = 1;

// ---------------------------------------------------------------- tree helpers

const asTree = (v: unknown): Node[] => (Array.isArray(v) ? (v as Node[]) : []);

/** Every marquee with its `[0].children[1]` path. */
export function findMarquees(nodes: unknown, base = ""): Array<{ path: string; node: Node }> {
  const out: Array<{ path: string; node: Node }> = [];
  if (!Array.isArray(nodes)) return out;
  nodes.forEach((n: Node, i) => {
    const path = `${base}[${i}]`;
    if (n && typeof n === "object") {
      if (n.kind === "marquee") out.push({ path, node: n });
      out.push(...findMarquees(n.children, `${path}.children`));
    }
  });
  return out;
}

/** The node at a `[0].children[1]` path, or null. */
export function nodeAt(nodes: unknown, path: string): Node | null {
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

const clone = <T,>(v: T): T => (v === undefined ? v : (JSON.parse(JSON.stringify(v)) as T));

const hasTypedItems = (n: Node): boolean =>
  Array.isArray(n.props?.items) &&
  (n.props!.items as unknown[]).some((it) => isObj(it) && typeof it.text === "string" && it.text.trim().length > 0);

type Kind = "candidate" | "already" | "skip";
function classify(n: Node): { kind: Kind; reason?: string } {
  const source = n.props?.source;
  if (source === "services") return { kind: "already" };
  if (source !== undefined && source !== "custom") return { kind: "skip", reason: `has its own source ${JSON.stringify(source)}; left alone` };
  if (!hasTypedItems(n)) return { kind: "skip", reason: "no typed items to keep as the fallback; left alone" };
  return { kind: "candidate" };
}

/** Plans one tree. The `after` tree differs from `before` ONLY at `<path>.props.source` of each candidate. */
export function planTree(scope: "home" | "shell", tree: unknown): TreePlan {
  const before = asTree(tree);
  const all = findMarquees(before);
  const candidates: Found[] = [];
  const already: Found[] = [];
  const skipped: SkippedMarquee[] = [];
  for (const m of all) {
    const c = classify(m.node);
    const f: Found = { path: m.path, id: m.node.id };
    if (c.kind === "candidate") candidates.push(f);
    else if (c.kind === "already") already.push(f);
    else skipped.push({ ...f, reason: c.reason ?? "left alone" });
  }
  const after = clone(before);
  for (const c of candidates) {
    const n = nodeAt(after, c.path);
    if (!n || n.kind !== "marquee" || n.id !== c.id) throw new RefusedError(`${scope}: anchor ${c.path} does not resolve to the planned marquee`);
    n.props = { ...(n.props ?? {}), source: "services" };
  }
  return { scope, total: all.length, candidates, already, skipped, before, after };
}

/** The only difference between before and after may be one `source` leaf per candidate. Throws RefusedError otherwise. */
export function assertOnlySourceChanged(p: TreePlan): void {
  const want = new Set(p.candidates.map((c) => `${c.path}.props.source`));
  const got = diffLeaves(p.before, p.after, "");
  for (const c of got) {
    if (!want.has(c.path)) throw new RefusedError(`${p.scope}: unexpected change at ${c.path}`);
    if (c.after !== "services" || (c.before !== undefined && c.before !== "custom")) {
      throw new RefusedError(`${p.scope}: unexpected value change at ${c.path}`);
    }
    want.delete(c.path);
  }
  if (want.size > 0) throw new RefusedError(`${p.scope}: planned change missing for ${[...want].join(", ")}`);
}

function liveTree(scope: LiveTree["scope"], tree: unknown): LiveTree {
  const custom: Found[] = [];
  const services: Found[] = [];
  for (const m of findMarquees(asTree(tree))) {
    const s = m.node.props?.source;
    if (s === "services") services.push({ path: m.path, id: m.node.id });
    else if (s === undefined || s === "custom") custom.push({ path: m.path, id: m.node.id });
  }
  return { scope, customMarquees: custom, servicesMarquees: services };
}

/** Would publishing now ship nothing but our patch? (mirrors isLiveEqualToDraft + a published-site check). */
export function liveEqualsDraft(s: Snapshot): { equal: boolean; why: string[] } {
  const why: string[] = [];
  if (!s.site.site_published_at) why.push("the site has never been published");
  for (const p of s.pages) {
    // Strict: a draft-only page (published body null) is a difference.
    if (p.blocks_published === null || p.blocks_published === undefined || !sameJson(p.blocks, p.blocks_published)) why.push(`page ${p.id} draft differs from live`);
  }
  if (!sameJson(s.site.shell_tree ?? [], s.site.shell_published ?? [])) why.push("shell draft differs from live");
  if (!sameJson(s.site.design_tokens_draft ?? {}, s.site.design_tokens ?? {})) why.push("design tokens draft differs from live");
  return { equal: why.length === 0, why };
}

// ---------------------------------------------------------------- plan

export function planTicker(s: Snapshot): Plan {
  const homes = s.pages.filter((p) => p.is_home);
  if (homes.length !== 1) throw new RefusedError(`expected exactly 1 home page, found ${homes.length}`);
  const homePage = homes[0]!;
  const home = planTree("home", homePage.blocks);
  const shell = planTree("shell", s.site.shell_tree);
  for (const t of [home, shell]) {
    if (t.candidates.length > MAX_MARQUEES_PER_TREE) {
      throw new RefusedError(`${t.scope}: ${t.candidates.length} tickers would change, at most ${MAX_MARQUEES_PER_TREE} is expected; refusing`);
    }
    assertOnlySourceChanged(t);
  }
  const live = [liveTree("home-published", homePage.blocks_published), liveTree("shell-published", s.site.shell_published)];
  const eq = liveEqualsDraft(s);
  const writes = home.candidates.length + shell.candidates.length > 0;
  const draftPatchedLiveNot = !writes && (home.already.length + shell.already.length > 0) && live.some((l) => l.customMarquees.length > 0);
  return { home, shell, homePage, live, liveEqualsDraft: eq.equal, liveEqualsDraftWhy: eq.why, writes, draftPatchedLiveNot };
}

// ---------------------------------------------------------------- output

const fmt = (f: Found) => `${f.path}${f.id ? ` (id ${f.id})` : ""}`;

export function formatPlan(p: Plan): string[] {
  const out: string[] = [];
  for (const t of [p.home, p.shell]) {
    out.push(`${t.scope} draft: ${t.total} marquee node(s)`);
    for (const c of t.candidates) out.push(`  ~ ${fmt(c)}: props.source (absent or custom) -> "services"; typed items kept as the fallback`);
    for (const a of t.already) out.push(`  = ${fmt(a)}: already source "services"`);
    for (const k of t.skipped) out.push(`  - ${fmt(k)}: ${k.reason}`);
  }
  for (const l of p.live) {
    out.push(`${l.scope}: ${l.customMarquees.length} ticker(s) without a services source, ${l.servicesMarquees.length} already on services`);
  }
  out.push(p.liveEqualsDraft ? "Live site equals the draft: a publish would ship only the ticker change." : `Live site differs from the draft (${p.liveEqualsDraftWhy.join("; ")}): the change would need publish.`);
  return out;
}

// ---------------------------------------------------------------- verification

/** Re-read check. `expect` says which draft trees changed; `published` says whether live should now equal the draft trees. */
export function verifySnapshots(
  before: Snapshot,
  after: Snapshot,
  expect: { home: Node[] | null; shell: Node[] | null; published: boolean },
): string[] {
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
  if (!sameJson(after.site.design_tokens_draft, before.site.design_tokens_draft) || !sameJson(after.site.design_tokens, before.site.design_tokens)) {
    problems.push("design tokens changed");
  }
  // Only the ticker may differ inside the home and shell drafts.
  const hd = diffLeaves(bHome.blocks, aHome.blocks, "home:");
  const sd = diffLeaves(before.site.shell_tree, after.site.shell_tree, "shell:");
  for (const c of [...hd, ...sd]) {
    if (!/\.props\.source$/.test(c.path) && !expect.published) problems.push(`unexpected difference at ${c.path}`);
  }
  return problems;
}

// ---------------------------------------------------------------- backup shape

export interface TickerBackup {
  ticket: "TUL-15";
  kind: "ticker-source";
  label: string;
  createdAt: string;
  profile: { code: string; id: string; siteSlug: string };
  siteId: string;
  draftRevBefore: number | null;
  /** The publish intent at the time (restore re-publishes only when this is true and the live site equals the draft). */
  willPublish: boolean;
  home: { pageId: string; before: unknown; after: unknown; blocksPublishedBefore: unknown } | null;
  shell: { before: unknown; after: unknown; shellPublishedBefore: unknown } | null;
}

export function parseBackup(raw: unknown): TickerBackup {
  if (!isObj(raw) || raw.kind !== "ticker-source" || !isObj(raw.profile) || typeof raw.siteId !== "string") {
    throw new RefusedError("not a ticker-source backup file");
  }
  const p = raw.profile;
  if (typeof p.code !== "string" || typeof p.id !== "string" || typeof p.siteSlug !== "string") throw new RefusedError("backup has no profile identity");
  const home = isObj(raw.home) && typeof raw.home.pageId === "string"
    ? { pageId: raw.home.pageId, before: raw.home.before, after: raw.home.after, blocksPublishedBefore: raw.home.blocksPublishedBefore }
    : null;
  const shell = isObj(raw.shell) ? { before: raw.shell.before, after: raw.shell.after, shellPublishedBefore: raw.shell.shellPublishedBefore } : null;
  return {
    ticket: "TUL-15",
    kind: "ticker-source",
    label: typeof raw.label === "string" ? raw.label : "",
    createdAt: typeof raw.createdAt === "string" ? raw.createdAt : "",
    profile: { code: p.code, id: p.id, siteSlug: p.siteSlug },
    siteId: raw.siteId,
    draftRevBefore: typeof raw.draftRevBefore === "number" ? raw.draftRevBefore : null,
    willPublish: raw.willPublish === true,
    home,
    shell,
  };
}

// ---------------------------------------------------------------- runner

export interface RunResult {
  exitCode: number;
  status: "dry-run" | "no-op" | "applied" | "needs-publish" | "refused" | "failed" | "restore-dry-run" | "restored";
  published: boolean;
  backupPath: string | null;
}

const SUMMARY_PATCH = { en: "Ticker now follows your services", es: "El ticker ahora sigue tus servicios" };
const SUMMARY_RESTORE = { en: "Ticker source restored", es: "Origen del ticker restaurado" };

export async function run(argv: readonly string[], io: Io): Promise<RunResult> {
  const { log } = io;
  const refused = (msg: string): RunResult => {
    log(`REFUSED: ${msg}`);
    log("Nothing was written.");
    return { exitCode: 2, status: "refused", published: false, backupPath: null };
  };
  let o: CliOptions;
  try {
    o = parseCli(argv, { allowNoPublish: true });
    assertProfileCode(o.site);
  } catch (e) {
    if (e instanceof RefusedError) return refused(e.message);
    throw e;
  }
  const before = await io.load(o.site);
  if (!before) return refused(`profile ${o.site} not found in this database`);
  try {
    assertResolvedTarget(before.profile, before.site.site_slug, o);
  } catch (e) {
    if (e instanceof RefusedError) return refused(e.message);
    throw e;
  }
  log(targetLine(before.profile, before.site.site_slug as string));
  try {
    return o.restore ? await runRestore(o, before, io) : await runPatch(o, before, io);
  } catch (e) {
    if (e instanceof RefusedError) return refused(e.message);
    throw e;
  }
}

async function runPatch(o: CliOptions, before: Snapshot, io: Io): Promise<RunResult> {
  const { log } = io;
  log(o.apply ? "MODE: APPLY (backup first, draft write, verify, publish only if live equalled the draft)" : "MODE: DRY RUN (nothing is written)");
  const plan = planTicker(before);
  for (const l of formatPlan(plan)) log(l);

  if (!plan.writes) {
    if (plan.draftPatchedLiveNot) {
      log("The draft is already patched; the live site is not. Needs publish (use the site's Publish). Nothing written.");
      return { exitCode: 0, status: "needs-publish", published: false, backupPath: null };
    }
    log("Nothing to change: no ticker without a source was found in the home or shell draft.");
    return { exitCode: 0, status: "no-op", published: false, backupPath: null };
  }
  const homeUserId = before.profile.user_id;
  const willPublish = !o.noPublish && plan.liveEqualsDraft && plan.homePage.status === "published" && !!homeUserId;
  log(willPublish ? "After the draft write: will PUBLISH (live equalled the draft)." : "After the draft write: NEEDS PUBLISH (the script will not publish).");
  if (!o.apply) {
    log(`Dry run only. To write: add --apply --site ${TARGET_PROFILE_CODE}.`);
    return { exitCode: 0, status: "dry-run", published: false, backupPath: null };
  }

  const backup: TickerBackup = {
    ticket: "TUL-15",
    kind: "ticker-source",
    label: "patch",
    createdAt: io.now(),
    profile: { code: before.profile.profile_code, id: before.profile.id, siteSlug: before.site.site_slug as string },
    siteId: before.site.id,
    draftRevBefore: before.site.draft_rev,
    willPublish,
    home: plan.home.candidates.length > 0 ? { pageId: plan.homePage.id, before: plan.home.before, after: plan.home.after, blocksPublishedBefore: plan.homePage.blocks_published } : null,
    shell: plan.shell.candidates.length > 0 ? { before: plan.shell.before, after: plan.shell.after, shellPublishedBefore: before.site.shell_published } : null,
  };
  const backupPath = io.backup("patch", backup);
  log(`Backup of the old tree(s): ${backupPath}`);
  log(`Undo with: --restore ${backupPath} --apply --site ${TARGET_PROFILE_CODE}`);

  const res = await io.writeDraft({
    siteId: before.site.id,
    expectedDraftRev: before.site.draft_rev,
    ...(plan.shell.candidates.length > 0 ? { shell: plan.shell.after } : {}),
    ...(plan.home.candidates.length > 0 ? { home: { pageId: plan.homePage.id, blocks: plan.home.after } } : {}),
    kind: "edit",
    summaryEn: SUMMARY_PATCH.en,
    summaryEs: SUMMARY_PATCH.es,
  });
  if (!res.ok) {
    log(res.conflict ? "FAILED: the site was saved by someone while this ran (draft_rev moved). Nothing was written. Re-run." : `FAILED: draft write error: ${res.error}`);
    return { exitCode: 1, status: "failed", published: false, backupPath };
  }
  log(`Draft written (draft_rev ${res.draftRev}).`);

  const expect = { home: plan.home.candidates.length > 0 ? plan.home.after : null, shell: plan.shell.candidates.length > 0 ? plan.shell.after : null };
  const afterDraft = await io.load(before.profile.profile_code);
  const draftProblems = afterDraft ? verifySnapshots(before, afterDraft, { ...expect, published: false }) : ["could not re-read the profile"];
  if (draftProblems.length > 0) {
    log("FAILED VERIFICATION after the draft write:");
    for (const p of draftProblems) log(`  ! ${p}`);
    log(`Restore from the backup: ${backupPath}`);
    return { exitCode: 1, status: "failed", published: false, backupPath };
  }
  log("Verified: only the ticker source changed in the draft.");

  if (!willPublish) {
    log("NEEDS PUBLISH: the draft is patched, the live site is not (live differed from the draft before this run, or --no-publish).");
    return { exitCode: 0, status: "needs-publish", published: false, backupPath };
  }
  const pub = await io.publish({ siteId: before.site.id, talentProfileId: before.profile.id, profileCode: before.profile.profile_code, userId: homeUserId as string });
  if (!pub.ok) {
    log(`FAILED: publish error: ${pub.error}. The draft is patched; the live site is not. Needs publish.`);
    return { exitCode: 1, status: "failed", published: false, backupPath };
  }
  if (pub.warning) log(`WARN: ${pub.warning}`);
  const afterPub = await io.load(before.profile.profile_code);
  const pubProblems = afterPub ? verifySnapshots(before, afterPub, { ...expect, published: true }) : ["could not re-read the profile"];
  if (pubProblems.length > 0) {
    log("FAILED VERIFICATION after publish (the publish happened; use the backup to roll back):");
    for (const p of pubProblems) log(`  ! ${p}`);
    return { exitCode: 1, status: "failed", published: true, backupPath };
  }
  log("Published and verified: live equals the patched draft; nothing else changed.");
  return { exitCode: 0, status: "applied", published: true, backupPath };
}

async function runRestore(o: CliOptions, before: Snapshot, io: Io): Promise<RunResult> {
  const { log } = io;
  const backup = parseBackup(io.readBackup(o.restore as string));
  assertProfileCode(backup.profile.code);
  if (backup.profile.id !== before.profile.id) throw new RefusedError(`backup is for profile ${backup.profile.id}, this database resolved ${before.profile.id}`);
  if (backup.profile.siteSlug !== before.site.site_slug) throw new RefusedError(`backup is for site ${backup.profile.siteSlug}, resolved ${before.site.site_slug}`);
  if (backup.siteId !== before.site.id) throw new RefusedError("backup is for another site row");
  log(o.apply ? "MODE: RESTORE (apply)" : "MODE: RESTORE DRY RUN (nothing is written)");

  const homePage = before.pages.find((p) => p.is_home);
  if (!homePage) throw new RefusedError("no home page");
  if (backup.home && backup.home.pageId !== homePage.id) throw new RefusedError("backup is for another home page row");

  let homeBack: Node[] | null = null;
  let shellBack: Node[] | null = null;
  let skipped = 0;
  if (backup.home) {
    if (sameJson(homePage.blocks, backup.home.before)) log("  home draft: already at the backed-up tree; skip");
    else if (sameJson(homePage.blocks, backup.home.after)) { log("  home draft: restore the patched tree to the backed-up tree"); homeBack = asTree(backup.home.before); }
    else { log("  home draft: changed since this script wrote it; NOT restored"); skipped++; }
  }
  if (backup.shell) {
    if (sameJson(before.site.shell_tree, backup.shell.before)) log("  shell draft: already at the backed-up tree; skip");
    else if (sameJson(before.site.shell_tree, backup.shell.after)) { log("  shell draft: restore the patched tree to the backed-up tree"); shellBack = asTree(backup.shell.before); }
    else { log("  shell draft: changed since this script wrote it; NOT restored"); skipped++; }
  }
  const eq = liveEqualsDraft(before);
  const homePub = !!before.profile.user_id && homePage.status === "published";
  const willPublish = !o.noPublish && backup.willPublish && eq.equal && homePub;
  log(willPublish ? "After the draft restore: will PUBLISH (live equals the draft now)." : "After the draft restore: the live site is NOT republished by this script.");
  if (!homeBack && !shellBack) {
    log("Nothing to restore.");
    return { exitCode: skipped > 0 ? 1 : 0, status: o.apply ? "restored" : "restore-dry-run", published: false, backupPath: null };
  }
  if (!o.apply) {
    log(`Dry run only. To restore: add --apply --site ${TARGET_PROFILE_CODE}.`);
    return { exitCode: 0, status: "restore-dry-run", published: false, backupPath: null };
  }

  const undo: TickerBackup = {
    ...backup,
    label: "restore-undo",
    createdAt: io.now(),
    draftRevBefore: before.site.draft_rev,
    willPublish,
    home: homeBack ? { pageId: homePage.id, before: homePage.blocks, after: homeBack, blocksPublishedBefore: homePage.blocks_published } : null,
    shell: shellBack ? { before: before.site.shell_tree, after: shellBack, shellPublishedBefore: before.site.shell_published } : null,
  };
  const backupPath = io.backup("restore-undo", undo);
  log(`Backup of the trees being replaced: ${backupPath}`);

  const res = await io.writeDraft({
    siteId: before.site.id,
    expectedDraftRev: before.site.draft_rev,
    ...(shellBack ? { shell: shellBack } : {}),
    ...(homeBack ? { home: { pageId: homePage.id, blocks: homeBack } } : {}),
    kind: "restore",
    summaryEn: SUMMARY_RESTORE.en,
    summaryEs: SUMMARY_RESTORE.es,
  });
  if (!res.ok) {
    log(res.conflict ? "FAILED: the site was saved by someone while this ran (draft_rev moved). Nothing was written. Re-run." : `FAILED: draft write error: ${res.error}`);
    return { exitCode: 1, status: "failed", published: false, backupPath };
  }
  const expect = { home: homeBack, shell: shellBack };
  const afterDraft = await io.load(before.profile.profile_code);
  const problems = afterDraft ? verifySnapshots(before, afterDraft, { ...expect, published: false }) : ["could not re-read the profile"];
  if (problems.length > 0) {
    log("FAILED VERIFICATION after the draft restore:");
    for (const p of problems) log(`  ! ${p}`);
    return { exitCode: 1, status: "failed", published: false, backupPath };
  }
  if (!willPublish) {
    log("Draft restored and verified. The live site was not touched (needs publish if it carries the patched ticker).");
    return { exitCode: skipped > 0 ? 1 : 0, status: "restored", published: false, backupPath };
  }
  const pub = await io.publish({ siteId: before.site.id, talentProfileId: before.profile.id, profileCode: before.profile.profile_code, userId: before.profile.user_id as string });
  if (!pub.ok) {
    log(`FAILED: publish error: ${pub.error}. The draft is restored; the live site is not.`);
    return { exitCode: 1, status: "failed", published: false, backupPath };
  }
  const afterPub = await io.load(before.profile.profile_code);
  const pubProblems = afterPub ? verifySnapshots(before, afterPub, { ...expect, published: true }) : ["could not re-read the profile"];
  if (pubProblems.length > 0) {
    log("FAILED VERIFICATION after publish:");
    for (const p of pubProblems) log(`  ! ${p}`);
    return { exitCode: 1, status: "failed", published: true, backupPath };
  }
  log("Restored, published and verified.");
  return { exitCode: skipped > 0 ? 1 : 0, status: "restored", published: true, backupPath };
}
